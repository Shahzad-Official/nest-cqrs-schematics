export const presetNames = ['database', 'migrations', 'rate-limit'];
export const databaseTypes = ['postgres', 'mysql', 'mongodb'];
export const PRESET_VERSION = 4;

const dependencies = {
  postgres: { pg: '^8.0.0', typeorm: '^1.1.1' },
  mysql: { mysql2: '^3.0.0', typeorm: '^1.1.1' },
  mongodb: { mongodb: '^7.0.0', typeorm: '^1.1.1' },
};
const addImport = (source, statement) => source.includes(statement) ? source : source.replace("import { Module } from '@nestjs/common';", `import { Module } from '@nestjs/common';\n${statement}`);
const addModuleImport = (source, expression) => source.includes(`    ${expression},`) ? source : source.replace('    HealthModule,', `    HealthModule,\n    ${expression},`);
const addProvider = (source, expression) => source.includes(`{ provide: APP_GUARD, useClass: ${expression} }`) ? source : source.replace(
  '    { provide: APP_FILTER, useClass: GlobalExceptionFilter },',
  `    { provide: APP_GUARD, useClass: ${expression} },\n    { provide: APP_FILTER, useClass: GlobalExceptionFilter },`,
);

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
    packageJson.dependencies = { '@nestjs/throttler': '^6.0.0', ...packageJson.dependencies };
    let app = addImport(files['src/app.module.ts'], "import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';");
    app = app.replace('import { APP_FILTER, APP_INTERCEPTOR }', 'import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR }');
    app = addModuleImport(app, 'ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])');
    files['src/app.module.ts'] = addProvider(app, 'ThrottlerGuard');
  }
  return [...enabled];
}

function applyDatabase(files, packageJson, databaseType) {
  packageJson.dependencies = {
    '@nestjs/typeorm': '^12.0.0',
    ...dependencies[databaseType],
    ...packageJson.dependencies,
  };

  const typeormOptions = `const common = { host: db.host, port: db.port, username: db.username, password: db.password, database: db.database, autoLoadEntities: true, synchronize: false, manualInitialization: config.getOrThrow('env', { infer: true }) === 'test' };
        return db.type === 'mongodb'
          ? { ...common, type: db.type, tls: db.ssl }
          : { ...common, type: db.type, ssl: db.ssl ? { rejectUnauthorized: true } : false };`;
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
  db: { type: 'postgres' | 'mysql' | 'mongodb'; host: string; port: number; username: string; password: string; database: string; ssl: boolean };`,
  );
  files['src/config/env.d.ts'] = files['src/config/env.d.ts'].replace(
    '      CORS_ORIGINS: string;',
    `      CORS_ORIGINS: string;
      DB_TYPE: 'postgres' | 'mysql' | 'mongodb';
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
    `  DB_TYPE: Joi.string().valid('postgres', 'mysql', 'mongodb').required(),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().required(),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.boolean().truthy('true').falsy('false').required(),
});\n`,
  );

  files['src/health/health.controller.ts'] = `import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { ApiErrorEnvelope, ApiSuccessEnvelope } from '../common/decorators/api-response.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService, private readonly db: TypeOrmHealthIndicator) {}

  @Get('live')
  @ApiSuccessEnvelope({ status: 200, description: 'Application is alive', data: { type: 'object' } })
  @ApiErrorEnvelope(500, 'Unexpected health-check failure')
  @HealthCheck()
  live(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get('ready')
  @ApiSuccessEnvelope({ status: 200, description: 'Application and database are ready', data: { type: 'object' } })
  @ApiErrorEnvelope(503, 'Database is unavailable')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.health.check([() => this.db.pingCheck('database', { timeout: 1000 })]);
  }
}
`;
  addDatabaseEnvironment(files, databaseType);
}

function applyMigrations(files, packageJson, databaseType) {
  packageJson.dependencies = { dotenv: '^17.0.0', ...packageJson.dependencies };
  packageJson.devDependencies = { 'typeorm-ts-node-esm': '^0.3.20', ...packageJson.devDependencies };
  if (!files['src/config/env.config.types.ts']?.includes("type: 'postgres' | 'mysql' | 'mongodb'")) {
    throw new Error('Select a database before adding TypeORM migrations.');
  }
  if (!dependencies[databaseType] || databaseType === 'mongodb') {
    throw new Error('TypeORM schema migrations are only scaffolded for PostgreSQL and MySQL.');
  }
  if (!files['src/database/data-source.ts']) files['src/database/data-source.ts'] = `import { config } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

config({ path: [\`.env.\${process.env.NODE_ENV ?? 'development'}\`, '.env'] });

const common = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: false,
  entities: ['src/**/*.entity.ts', 'dist/src/**/*.entity'],
  migrations: ['src/database/migrations/*.ts', 'dist/src/database/migrations/*'],
};
const databaseType = process.env.DB_TYPE;
if (databaseType === 'mongodb') {
  throw new Error('TypeORM schema migrations are only supported for DB_TYPE=postgres or DB_TYPE=mysql');
}
const options: DataSourceOptions = {
  ...common,
  type: databaseType,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
};

export default new DataSource(options);
`;
  files['src/database/migrations/.gitkeep'] ??= '';
  Object.assign(packageJson.scripts, {
      'migration:create': 'typeorm migration:create src/database/migrations/migration',
      'migration:generate': 'typeorm-ts-node-esm migration:generate src/database/migrations/migration -d src/database/data-source.ts',
      'migration:show': 'typeorm-ts-node-esm migration:show -d src/database/data-source.ts',
      'migration:run': 'typeorm-ts-node-esm migration:run -d src/database/data-source.ts',
      'migration:revert': 'typeorm-ts-node-esm migration:revert -d src/database/data-source.ts',
      'migration:run:prod': 'typeorm migration:run -d dist/src/database/data-source',
  });
}

function addDatabaseEnvironment(files, databaseType) {
  if (files['.env.example'].includes('DB_TYPE=')) return;
  const port = databaseType === 'mongodb' ? 27017 : databaseType === 'mysql' ? 3306 : 5432;
  const label = databaseType === 'mongodb' ? 'MongoDB' : databaseType === 'mysql' ? 'MySQL' : 'PostgreSQL';
  files['.env.example'] += `\n# Database type: postgres, mysql, or mongodb. The selected default is ${label}.
# All database settings are read at runtime; update this block to switch connections.
DB_TYPE="${databaseType}"
DB_HOST="localhost"
DB_PORT=${port}
DB_USERNAME="app_user"
DB_PASSWORD="change_me"
DB_NAME="app_db"
DB_SSL=false
`;
}
