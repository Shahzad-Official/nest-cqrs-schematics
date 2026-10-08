export const presetNames = ['database', 'migrations', 'rate-limit'];
export const databaseTypes = ['postgres', 'mysql', 'mongodb'];
export const PRESET_VERSION = 2;

const dependencies = {
  postgres: { pg: '^8.0.0', typeorm: '^1.1.1' },
  mysql: { mysql2: '^3.0.0', typeorm: '^1.1.1' },
  mongodb: { mongodb: '^7.0.0', typeorm: '^1.1.1' },
};
const addImport = (source, statement) => source.includes(statement) ? source : source.replace("import { Module } from '@nestjs/common';", `import { Module } from '@nestjs/common';\n${statement}`);
const addModuleImport = (source, expression) => source.includes(`    ${expression},`) ? source : source.replace('    HealthModule,', `    HealthModule,\n    ${expression},`);

export function applyPresets({ files, packageJson, selected, databaseType, migrations = false }) {
  const enabled = new Set(selected);
  for (const name of enabled) {
    if (!presetNames.includes(name)) throw new Error(`Unknown preset: ${name}`);
  }
  if (enabled.has('database')) {
    if (!dependencies[databaseType]) throw new Error(`Choose a database: ${databaseTypes.join(', ')}`);
    if ((migrations || enabled.has('migrations')) && databaseType === 'mongodb') throw new Error('TypeORM schema migrations are not generated for MongoDB; use custom data-migration logic.');
    applyDatabase(files, packageJson, databaseType);
  }
  if (enabled.has('migrations') && !enabled.has('database')) {
    if (!databaseTypes.includes(databaseType)) throw new Error('Add a supported database before adding migrations.');
    if (databaseType === 'mongodb') throw new Error('TypeORM schema migrations are not generated for MongoDB; use custom data-migration logic.');
  }
  if (enabled.has('migrations')) applyMigrations(files, packageJson, databaseType);
  else if (migrations && enabled.has('database')) applyMigrations(files, packageJson, databaseType);
  if (enabled.has('rate-limit')) {
    packageJson.dependencies = { ...packageJson.dependencies, '@nestjs/throttler': '^6.0.0' };
    const app = addImport(files['src/app.module.ts'], "import { ThrottlerModule } from '@nestjs/throttler';");
    files['src/app.module.ts'] = addModuleImport(app, 'ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])');
  }
  return [...enabled];
}

function applyDatabase(files, packageJson, databaseType) {
  const driver = Object.fromEntries(Object.entries(dependencies[databaseType]).filter(([name]) => name !== 'typeorm'));
  packageJson.dependencies = { ...packageJson.dependencies, '@nestjs/typeorm': '^12.0.0', typeorm: '^1.1.1', ...driver };

  const isMongo = databaseType === 'mongodb';
  const typeormOptions = isMongo
    ? `return { type: 'mongodb', host: db.host, port: db.port, username: db.username, password: db.password, database: db.database, tls: db.ssl, autoLoadEntities: true, synchronize: false };`
    : `return { type: '${databaseType}', host: db.host, port: db.port, username: db.username, password: db.password, database: db.database, ssl: db.ssl ? { rejectUnauthorized: true } : false, autoLoadEntities: true, synchronize: false };`;
  let app = addImport(files['src/app.module.ts'], "import { TypeOrmModule } from '@nestjs/typeorm';");
  app = addModuleImport(app, `TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => {
        const db = config.getOrThrow('db', { infer: true });
        ${typeormOptions}
      },
    })`);
  files['src/app.module.ts'] = app;
  files['src/config/env.config.types.ts'] = files['src/config/env.config.types.ts'].replace(
    '  cors: { enabled: boolean; origins: string[] };',
    `  cors: { enabled: boolean; origins: string[] };
  db: { type: '${databaseType}'; host: string; port: number; username: string; password: string; database: string; ssl: boolean };`,
  );
  files['src/config/env.d.ts'] = files['src/config/env.d.ts'].replace(
    '      CORS_ORIGINS: string;',
    `      CORS_ORIGINS: string;
      DB_TYPE: '${databaseType}';
      DB_HOST: string;
      DB_PORT: number;
      DB_USERNAME: string;
      DB_PASSWORD: string;
      DB_NAME: string;
      DB_SSL: 'true' | 'false';`,
  );
  files['src/config/configuration.ts'] = files['src/config/configuration.ts'].replace(
    '    cors: { enabled: corsEnabled, origins },',
    `    cors: { enabled: corsEnabled, origins },
    db: { type: parsed.DB_TYPE, host: parsed.DB_HOST, port: parsed.DB_PORT, username: parsed.DB_USERNAME, password: parsed.DB_PASSWORD, database: parsed.DB_NAME, ssl: parsed.DB_SSL === 'true' },`,
  );
  files['src/config/env.validation.ts'] = files['src/config/env.validation.ts'].replace(
    '});\n',
    `  DB_TYPE: Joi.string().valid('${databaseType}').required(),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().required(),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.boolean().truthy('true').falsy('false').required(),
});\n`,
  );

  if (isMongo) {
    files['src/health/health.controller.ts'] = `import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }
}
`;
  } else {
    files['src/health/health.controller.ts'] = `import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService, private readonly db: TypeOrmHealthIndicator) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.db.pingCheck('database', { timeout: 1000 })]);
  }
}
`;
    delete files['src/health/health.controller.spec.ts'];
  }
  addDatabaseEnvironment(files, databaseType);
}

function applyMigrations(files, packageJson, databaseType) {
  packageJson.dependencies = { ...packageJson.dependencies, dotenv: '^17.0.0' };
  packageJson.devDependencies = { ...packageJson.devDependencies, 'typeorm-ts-node-esm': '^0.3.20' };
  if (!files['src/config/env.config.types.ts']?.includes(`type: '${databaseType}'`)) {
    throw new Error('Select a database before adding TypeORM migrations.');
  }
  if (!dependencies[databaseType] || databaseType === 'mongodb') {
    throw new Error('TypeORM schema migrations are only scaffolded for PostgreSQL and MySQL.');
  }
  if (!files['src/database/data-source.ts']) files['src/database/data-source.ts'] = `import 'dotenv/config';
import { DataSource } from 'typeorm';

export default new DataSource({
  type: '${databaseType}',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
  synchronize: false,
  entities: ['src/**/*.entity.ts', 'dist/src/**/*.entity.js'],
  migrations: ['src/database/migrations/*.ts', 'dist/src/database/migrations/*.js'],
});
`;
  files['src/database/migrations/.gitkeep'] ??= '';
  Object.assign(packageJson.scripts, {
      'migration:create': 'typeorm migration:create src/database/migrations/migration',
      'migration:generate': 'typeorm-ts-node-esm migration:generate src/database/migrations/migration -d src/database/data-source.ts',
      'migration:show': 'typeorm-ts-node-esm migration:show -d src/database/data-source.ts',
      'migration:run': 'typeorm-ts-node-esm migration:run -d src/database/data-source.ts',
      'migration:revert': 'typeorm-ts-node-esm migration:revert -d src/database/data-source.ts',
      'migration:run:prod': 'typeorm migration:run -d dist/src/database/data-source.js',
  });
}

function addDatabaseEnvironment(files, databaseType) {
  if (files['.env.example'].includes(`DB_TYPE=${databaseType}`)) return;
  const port = databaseType === 'mongodb' ? 27017 : databaseType === 'mysql' ? 3306 : 5432;
  const label = databaseType === 'mongodb' ? 'MongoDB' : databaseType === 'mysql' ? 'MySQL' : 'PostgreSQL';
  files['.env.example'] += `\n# ${label} (use a dedicated, least-privileged database user)
DB_TYPE=${databaseType}
DB_HOST=localhost
DB_PORT=${port}
DB_USERNAME=app_user
DB_PASSWORD=change_me
DB_NAME=app_db
DB_SSL=false
`;
}
