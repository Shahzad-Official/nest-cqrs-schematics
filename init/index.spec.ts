import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { addPresets, approvePnpmBuilds, applyPlan, buildPlan, ensureGitignore, initialize, preflight } from './index.js';

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'nest-cqrs-init-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    scripts: {
      build: 'nest build',
      format: 'prettier --write "src/**/*.ts" "test/**/*.ts"',
      lint: 'oxlint --type-aware src/ test/',
      test: 'node --experimental-vm-modules ./node_modules/jest/bin/jest.js',
      'test:e2e': 'node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config ./test/jest-e2e.json',
    },
    dependencies: { '@nestjs/core': '^12.0.1', '@nestjs/platform-express': '^12.0.1' },
    devDependencies: { jest: '^30.0.0', oxlint: '^1.58.0', prettier: '^3.4.2', typescript: '^6.0.2' },
  }));
  writeFileSync(join(root, 'nest-cli.json'), JSON.stringify({ collection: '@nestjs/schematics', sourceRoot: 'src' }));
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
  writeFileSync(join(root, 'src/main.ts'), 'default');
  writeFileSync(join(root, 'src/app.module.ts'), 'default');
  return root;
}

describe('init foundation', () => {
  describe('.gitignore preservation', () => {
    const entries = ['.env', '.env.development', '.env.staging', '.env.production', '.nest-cqrs.pending.json'];

    it('preserves a realistic NestJS file byte-for-byte before one appended block', () => {
      const root = project();
      const original = ['# compiled output', '/dist', '/node_modules', '', '# IDEs and editors', '/.idea', '.project', '', '# misc', '.DS_Store', 'npm-debug.log*', '!example.env', ''].join('\n');
      writeFileSync(join(root, '.gitignore'), original);

      expect(ensureGitignore(root)).toBe(true);

      const updated = readFileSync(join(root, '.gitignore'), 'utf8');
      expect(updated.slice(0, original.length)).toBe(original);
      expect(updated.slice(original.length)).toBe(`\n${entries.join('\n')}\n`);
    });

    it('reports an append for an existing file instead of an update', () => {
      const root = project();
      writeFileSync(join(root, '.gitignore'), '/dist\n');

      const operations = applyPlan(root, buildPlan(root, '0.1.0'), true);

      expect(operations).toContain('APPEND .gitignore');
      expect(operations).not.toContain('UPDATE .gitignore');
      expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe('/dist\n');
    });

    it('appends only missing active entries and does not count comments', () => {
      const root = project();
      const original = '# .env\n.env.development\n.env.production\n';
      writeFileSync(join(root, '.gitignore'), original);

      ensureGitignore(root);

      expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe(
        `${original}\n.env\n.env.staging\n.nest-cqrs.pending.json\n`,
      );
    });

    it.each([
      ['with a trailing newline', 'dist/\n', 'dist/\n\n'],
      ['without a trailing newline', 'dist/', 'dist/\n\n'],
    ])('handles files %s and is byte-idempotent', (_label, original, prefix) => {
      const root = project();
      writeFileSync(join(root, '.gitignore'), original);
      ensureGitignore(root);
      const once = readFileSync(join(root, '.gitignore'));
      expect(once.toString('utf8')).toBe(`${prefix}${entries.join('\n')}\n`);
      expect(ensureGitignore(root)).toBe(false);
      expect(readFileSync(join(root, '.gitignore'))).toEqual(once);
    });

    it('creates an absent file and leaves a complete file unchanged', () => {
      const root = project();
      expect(ensureGitignore(root)).toBe(true);
      const once = readFileSync(join(root, '.gitignore'));
      expect(once.toString('utf8')).toBe(`${entries.join('\n')}\n`);
      expect(ensureGitignore(root)).toBe(false);
      expect(readFileSync(join(root, '.gitignore'))).toEqual(once);
    });
  });

  it('generates the complete canonical AI guidance hierarchy for the default foundation', () => {
    const plan = buildPlan(project(), '0.1.0');
    const guidancePaths = Object.keys(plan.generated).filter((path) => path === 'AGENTS.md' || path.startsWith('agents/'));

    expect(guidancePaths.sort()).toEqual([
      'AGENTS.md',
      'agents/ARCHITECTURE.md',
      'agents/CODEBASE_MAP.md',
      'agents/PROJECT_CONTEXT.md',
      'agents/README.md',
      'agents/knowledge/INDEX.md',
    ]);
    expect(Object.keys(plan.generated).some((path) => path.startsWith('docs/'))).toBe(false);
    expect(Object.keys(plan.generated).some((path) => path.startsWith('ai/'))).toBe(false);
    expect(Object.keys(plan.generated).some((path) => /(?:^|\/)SKILL\.md$/.test(path))).toBe(false);

    const agents = plan.generated['AGENTS.md'];
    expect(agents).toContain('canonical source of coding-agent rules');
    expect(agents).toContain('Agent support for automatically discovering this file varies');
    expect(agents).toContain('agents/ARCHITECTURE.md');
    expect(agents).toContain('agents/PROJECT_CONTEXT.md');
    expect(agents).toContain('agents/CODEBASE_MAP.md');
    expect(agents).toContain('agents/knowledge/INDEX.md');
    expect(agents).toContain('<!-- nest-cqrs:managed:commands:start -->');
    expect(agents).toContain('Build: `npm run build`');
    expect(agents).not.toContain('migration:run');
    expect(agents).toContain('If no durable knowledge changed, report that');
    expect(agents).toContain('Do not store secrets, raw logs, command transcripts');

    const architecture = plan.generated['agents/ARCHITECTURE.md'];
    expect(architecture).toContain('<!-- nest-cqrs:managed:architecture:start -->');
    expect(architecture).toContain('None were selected during initialization.');
    expect(architecture).not.toContain('### Database');
    expect(architecture).not.toContain('### Migrations');
    expect(architecture).not.toContain('### Rate limiting');
    expect(architecture).toContain('`@nestjs/swagger` is installed');
    expect(architecture).toContain('exposed at `/docs` only when validated `SWAGGER_ENABLED` is true');
    expect(architecture).toContain('`SWAGGER_ENABLED` is required by the Joi schema');
    expect(architecture).toContain('Joi does not provide a runtime default');

    const context = plan.generated['agents/PROJECT_CONTEXT.md'];
    expect(context).toContain('Product-specific context is INCOMPLETE');
    expect(context).toContain('## TODO: Product purpose — INCOMPLETE');
    expect(context).toContain('## TODO: Domain concepts — INCOMPLETE');
    expect(context).toContain('## TODO: Business rules — INCOMPLETE');
    expect(context).toContain('## TODO: Users and roles — INCOMPLETE');

    const map = plan.generated['agents/CODEBASE_MAP.md'];
    expect(map).toContain('<!-- nest-cqrs:managed:codebase-map:start -->');
    expect(map).toContain('`src/config/`');
    expect(map).not.toContain('src/database/');
    expect(map).not.toContain('src/features/');

    const readme = plan.generated['agents/README.md'];
    expect(readme).toContain('[`AGENTS.md`](../AGENTS.md) is the canonical source');
    expect(readme).toContain('does not define a second or competing policy');
    expect(readme).toContain('preserve it byte-for-byte');

    const index = plan.generated['agents/knowledge/INDEX.md'];
    expect(index).toContain('Do not create empty placeholder notes');
    expect(index).toContain('No feature or topic notes have been created yet.');
    expect(index).not.toContain('./order-lifecycle.md');

    for (const path of guidancePaths) {
      const links = [...plan.generated[path].matchAll(/\]\(([^)]+\.md)\)/g)].map((match) => match[1]);
      for (const link of links) {
        const target = posix.normalize(posix.join(posix.dirname(path), link));
        expect(plan.generated[target], `${path} links to missing ${target}`).toBeDefined();
      }
    }
  });

  it('renders selected presets and the normalized starter feature without claiming unselected integrations', () => {
    const complete = buildPlan(
      project(),
      '0.1.0',
      'Stock Items',
      ['database', 'rate-limit'],
      { type: 'postgres', migrations: true },
    );
    const architecture = complete.generated['agents/ARCHITECTURE.md'];
    const map = complete.generated['agents/CODEBASE_MAP.md'];
    expect(architecture).toContain('### Database');
    expect(architecture).toContain('initial `DB_TYPE` is `postgres`');
    expect(architecture).toContain('### Migrations');
    expect(architecture).toContain('### Rate limiting');
    expect(architecture).toContain('`src/features/stock-items/`');
    expect(map).toContain('`src/database/data-source.ts`');
    expect(map).toContain('`src/database/migrations/`');
    expect(map).toContain('`src/features/stock-items/`');
    expect(complete.generated['AGENTS.md']).toContain('Run migrations: `npm run migration:run`');

    const rateOnly = buildPlan(project(), '0.1.0', undefined, ['rate-limit']);
    expect(rateOnly.generated['agents/ARCHITECTURE.md']).toContain('### Rate limiting');
    expect(rateOnly.generated['agents/ARCHITECTURE.md']).not.toContain('### Database');
    expect(rateOnly.generated['agents/ARCHITECTURE.md']).not.toContain('### Migrations');
    expect(rateOnly.generated['agents/CODEBASE_MAP.md']).not.toContain('src/database/');

    const mongo = buildPlan(project(), '0.1.0', undefined, ['database'], { type: 'mongodb', migrations: false });
    expect(mongo.generated['agents/ARCHITECTURE.md']).toContain('initial `DB_TYPE` is `mongodb`');
    expect(mongo.generated['agents/ARCHITECTURE.md']).not.toContain('### Migrations');
    expect(mongo.generated['agents/CODEBASE_MAP.md']).not.toContain('src/database/data-source.ts');
  });

  it('renders commands for the detected package manager', () => {
    const pnpmRoot = project();
    writeFileSync(join(pnpmRoot, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
    expect(buildPlan(pnpmRoot, '0.1.0').generated['AGENTS.md']).toContain('Build: `pnpm build`');

    const yarnRoot = project();
    writeFileSync(join(yarnRoot, 'yarn.lock'), '');
    expect(buildPlan(yarnRoot, '0.1.0').generated['AGENTS.md']).toContain('Build: `yarn build`');
  });

  it('builds a Fastify foundation without deferred integrations', () => {
    const root = project();
    const plan = buildPlan(root, '0.1.0');
    expect(plan.generated['src/main.ts']).toContain('FastifyAdapter');
    expect(plan.generated['src/main.ts']).toContain("'docs'");
    expect(plan.generated['src/config/env.d.ts']).toContain('declare global');
    expect(plan.generated['src/config/env.d.ts']).toContain('interface ProcessEnv');
    expect(plan.generated['src/config/env.validation.ts']).toContain("NODE_ENV: Joi.string()");
    expect(plan.generated['src/config/env.validation.ts']).toContain(".valid('development', 'staging', 'production', 'test')");
    expect(plan.generated['src/config/env.validation.ts']).toContain('.required()');
    expect(plan.generated['src/config/env.validation.ts']).toContain('oxlint-disable-next-line unicorn/no-thenable');
    expect(plan.generated['src/config/env.validation.ts']).not.toContain('APP_ENV');
    expect(plan.generated['src/config/env-file-path.ts']).toContain('process.env.NODE_ENV');
    expect(plan.generated['src/config/env-file-path.ts']).not.toContain('APP_ENV');
    expect(plan.generated['src/config/configuration.ts']).toContain('const parsed = process.env;');
    expect(plan.generated['src/config/configuration.ts']).toContain('env: parsed.NODE_ENV');
    expect(plan.generated['src/config/configuration.ts']).not.toContain('Number(process.env');
    expect(plan.generated['src/config/configuration.ts']).not.toContain('as EnvConfig[');
    expect(plan.generated['src/app.module.ts']).toContain("config.getOrThrow('env'");
    expect(plan.generated['src/app.module.ts']).not.toContain('TypeOrmModule');
    expect(plan.generated['src/app.module.ts']).not.toContain('ThrottlerGuard');
    expect(plan.generated['package.json']).not.toContain('node-flow');
    expect(plan.generated['tsconfig.json']).toBeUndefined();
    expect(plan.generated['nest-cli.json']).toBeUndefined();
    expect(JSON.parse(plan.generated['package.json']).scripts.format).toBe('prettier --write "src/**/*.ts" "test/**/*.ts"');
    expect(JSON.parse(plan.generated['package.json']).devDependencies).toMatchObject({
      jest: '^30.0.0',
      oxlint: '^1.58.0',
      prettier: '^3.4.2',
      typescript: '^6.0.2',
    });
    expect(plan.generated['vitest.config.ts']).toBeUndefined();
    expect(plan.generated['vitest.config.e2e.ts']).toBeUndefined();
    expect(plan.generated['src/health/health.controller.ts']).toContain('HealthCheckService');
    expect(plan.generated['src/health/health.module.ts']).toContain('TerminusModule');
    expect(plan.generated['src/health/health.controller.ts']).toContain("@Get('live')");
    expect(plan.generated['src/health/health.controller.ts']).toContain("@Get('ready')");
    expect(plan.generated['src/health/health.controller.ts']).toContain('@ApiSuccessEnvelope');
    expect(plan.generated['test/setup-env.ts']).toContain("NODE_ENV: 'test'");
    expect(plan.generated['test/setup-env.ts']).toContain("SWAGGER_ENABLED: 'true'");
    expect(plan.generated['test/setup-env.ts']).toContain("CORS_ORIGINS: ''");
    expect(plan.generated['test/setup-env.ts']).toContain("DB_HOST: '127.0.0.1'");
    expect(plan.generated['test/app.e2e-spec.ts']).toContain("import './setup-env'");
    expect(plan.generated['.env.test.example']).toBeUndefined();
    expect(plan.generated['src/common/decorators/api-response.decorator.ts']).toContain('ApiSuccessEnvelope');
    expect(plan.generated['src/common/decorators/api-response.decorator.ts']).toContain('ApiErrorEnvelope');
    expect(plan.generated['test/app.e2e-spec.ts']).toContain("#/components/schemas/ApiSuccessResponse");
    expect(plan.generated['test/app.e2e-spec.ts']).toContain("#/components/schemas/ApiErrorResponse");
    expect(plan.generated['src/common/interfaces/api-response.interface.ts']).toContain('@ApiProperty');
    expect(plan.generated['.env.example']).toContain('NODE_ENV="development"');
    expect(plan.generated['.env.example']).toContain('PORT=3000');
    expect(plan.generated['.env.development.example']).toBeUndefined();
  });

  it('matches generated relative imports to the existing project module type', () => {
    const commonJsRoot = project();
    const commonJs = buildPlan(commonJsRoot, '0.1.0');
    expect(commonJs.generated['src/main.ts']).toContain("from './app.module'");
    expect(commonJs.generated['src/main.ts']).not.toContain("from './app.module.js'");

    const esmRoot = project();
    const packageJson = JSON.parse(readFileSync(join(esmRoot, 'package.json'), 'utf8'));
    packageJson.type = 'module';
    delete packageJson.devDependencies.jest;
    packageJson.devDependencies.vitest = '^4.1.2';
    packageJson.devDependencies['vite-tsconfig-paths'] = '^5.1.4';
    writeFileSync(join(esmRoot, 'package.json'), JSON.stringify(packageJson));
    const esm = buildPlan(esmRoot, '0.1.0');
    expect(esm.generated['src/main.ts']).toContain("from './app.module.js'");
    expect(esm.generated['test/app.e2e-spec.ts']).toContain("import './setup-env.js'");
    expect(esm.generated['src/health/health.controller.spec.ts']).toContain('vi.fn()');

    const esmDatabase = buildPlan(esmRoot, '0.1.0', undefined, ['database'], {
      type: 'postgres',
      migrations: false,
    });
    expect(esmDatabase.generated['vitest.config.integration.ts']).toBeDefined();
    expect(esmDatabase.generated['test/jest-integration.json']).toBeUndefined();
    expect(JSON.parse(esmDatabase.generated['package.json']).scripts['test:integration'])
      .toContain('vitest.config.integration.ts');
  });

  it('composes PostgreSQL migrations and rate limiting into the foundation plan', () => {
    const root = project();
    const plan = buildPlan(root, '0.1.0', 'examples', ['database', 'rate-limit'], { type: 'postgres', migrations: true });
    expect(plan.generated['src/app.module.ts']).toContain('TypeOrmModule.forRootAsync');
    expect(plan.generated['src/app.module.ts']).toContain('ThrottlerModule.forRoot');
    expect(plan.generated['src/app.module.ts']).toContain('{ provide: APP_GUARD, useClass: ThrottlerGuard }');
    expect(plan.generated['test/rate-limit.e2e-spec.ts']).toContain("expect(429)");
    expect(plan.generated['test/rate-limit.e2e-spec.ts']).toContain('requestNumber < 100');
    expect(plan.generated['src/instrumentation.ts']).toBeUndefined();
    expect(plan.generated['compose.jaeger.yml']).toBeUndefined();
    expect(plan.generated['src/database/data-source.ts']).toContain('type: databaseType');
    expect(plan.generated['src/database/data-source.ts']).toContain('process.env.DB_TYPE');
    expect(plan.generated['src/config/env.d.ts']).toContain('DB_HOST: string');
    expect(plan.generated['src/config/configuration.ts']).toContain('host: parsed.DB_HOST');
    expect(plan.generated['src/config/env.validation.ts']).toContain('DB_HOST: Joi.string().required()');
    expect(plan.generated['src/app.module.ts']).toContain('manualInitialization:');
    expect(plan.generated['src/health/health.controller.ts']).toContain("live(): Promise<HealthCheckResult>");
    expect(plan.generated['src/health/health.controller.ts']).toContain("ready(): Promise<HealthCheckResult>");
    expect(plan.generated['src/health/health.controller.ts']).toContain("this.health.check([])");
    expect(plan.generated['src/health/health.controller.ts']).toContain("this.db.pingCheck('database'");
    expect(plan.generated['test/app.e2e-spec.ts']).not.toContain("GET /api/health/ready");
    expect(plan.generated['test/app.e2e-spec.ts']).toContain('getDataSourceToken()');
    expect(plan.generated['test/database.integration-spec.ts']).toContain("GET /api/health/ready");
    expect(plan.generated['test/setup-integration-env.ts']).toContain('RUN_DATABASE_INTEGRATION');
    expect(plan.generated['test/jest-integration.json']).toContain('.integration-spec.ts$');
    expect(JSON.parse(plan.generated['package.json']).scripts['test:integration']).toContain('test/jest-integration.json');
    expect(plan.generated['.env.example']).toContain('DB_HOST="localhost"');
    expect(plan.generated['.env.example']).toContain('# Database type: postgres, mysql, or mongodb.');
    expect(Object.keys(plan.manifest.presets)).toEqual(expect.arrayContaining(['database', 'migrations', 'rate-limit']));
    expect(plan.manifest.presets.database).toMatchObject({ type: 'postgres', migrations: true });
    expect(plan.generated['package.json']).not.toContain('@opentelemetry/');
    expect(plan.generated['.env.example']).not.toContain('OTEL_');
    expect(plan.generated['package.json']).not.toMatch(/passport|@nestjs\/jwt/);
    expect(plan.generated['src/auth/auth.module.ts']).toBeUndefined();
    expect(plan.generated['agents/ARCHITECTURE.md']).toContain('illustrative CQRS scaffold');
  });

  it('selects MySQL or MongoDB drivers and only generates relational migration scripts', () => {
    const mysql = buildPlan(project(), '0.1.0', undefined, ['database'], { type: 'mysql', migrations: false });
    const mysqlPackage = JSON.parse(mysql.generated['package.json']);
    expect(mysqlPackage.dependencies.mysql2).toBeDefined();
    expect(mysqlPackage.dependencies.pg).toBeUndefined();
    expect(mysqlPackage.dependencies.mongodb).toBeUndefined();
    expect(mysql.generated['src/app.module.ts']).toContain("db.type === 'mongodb'");
    expect(mysql.generated['src/app.module.ts']).toContain('type: db.type');
    expect(mysql.generated['src/database/data-source.ts']).toBeUndefined();
    expect(mysqlPackage.scripts['migration:run']).toBeUndefined();

    const mongo = buildPlan(project(), '0.1.0', undefined, ['database'], { type: 'mongodb', migrations: false });
    const mongoPackage = JSON.parse(mongo.generated['package.json']);
    expect(mongoPackage.dependencies.mongodb).toBeDefined();
    expect(mongoPackage.dependencies.pg).toBeUndefined();
    expect(mongoPackage.dependencies.mysql2).toBeUndefined();
    expect(mongo.generated['src/config/env.validation.ts']).toContain(".valid('postgres', 'mysql', 'mongodb')");
    expect(mongo.generated['src/app.module.ts']).toContain('tls: db.ssl');
    expect(mongo.generated['src/database/data-source.ts']).toBeUndefined();
    expect(mongoPackage.scripts['migration:run']).toBeUndefined();
    expect(mongo.generated['src/health/health.controller.ts']).toContain("this.db.pingCheck('database'");

    expect(() => buildPlan(project(), '0.1.0', undefined, ['database'], { type: 'mongodb', migrations: true })).toThrow('not generated for MongoDB');
  });

  it('adds relational migrations later using the selected database from the manifest', async () => {
    const root = project();
    await initialize({
      root,
      packageVersion: '0.1.0',
      dryRun: false,
      resume: false,
      skipInstall: true,
      selectedPresets: ['database'],
      databaseOptions: { type: 'mysql', migrations: false },
      runFeature: () => undefined,
    });

    await addPresets({ root, names: ['migrations'], dryRun: false, skipInstall: true });
    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const manifest = JSON.parse(readFileSync(join(root, '.nest-cqrs.json'), 'utf8'));
    expect(existsSync(join(root, 'src/database/data-source.ts'))).toBe(true);
    expect(packageJson.scripts['migration:run']).toContain('typeorm-ts-node-esm');
    expect(manifest.presets.database.migrations).toBe(true);
    expect(manifest.presets.migrations.databaseType).toBe('mysql');
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain('Run migrations: `npm run migration:run`');
    expect(readFileSync(join(root, 'agents/ARCHITECTURE.md'), 'utf8')).toContain('### Migrations');
    expect(readFileSync(join(root, 'agents/CODEBASE_MAP.md'), 'utf8')).toContain('`src/database/data-source.ts`');
  });

  it('updates only managed guidance blocks when adding a preset and preserves user text byte-for-byte', async () => {
    const root = project();
    await initialize({
      root,
      packageVersion: '0.1.0',
      dryRun: false,
      resume: false,
      skipInstall: true,
      runFeature: () => undefined,
    });
    const architecturePath = join(root, 'agents/ARCHITECTURE.md');
    const original = readFileSync(architecturePath, 'utf8');
    const start = '<!-- nest-cqrs:managed:architecture:start -->';
    const end = '<!-- nest-cqrs:managed:architecture:end -->';
    const customized = `USER PREFIX\n${original.replace(start, `${start}\nUSER MANAGED TEXT`).replace(end, `USER MANAGED TEXT\n${end}`)}USER SUFFIX\n`;
    writeFileSync(architecturePath, customized);
    const readmeBefore = readFileSync(join(root, 'agents/README.md'), 'utf8');
    const contextBefore = readFileSync(join(root, 'agents/PROJECT_CONTEXT.md'), 'utf8');
    const indexBefore = readFileSync(join(root, 'agents/knowledge/INDEX.md'), 'utf8');

    await addPresets({ root, names: ['rate-limit'], dryRun: false, skipInstall: true });

    const updated = readFileSync(architecturePath, 'utf8');
    expect(updated.startsWith('USER PREFIX\n')).toBe(true);
    expect(updated.endsWith('USER SUFFIX\n')).toBe(true);
    expect(updated).not.toContain('USER MANAGED TEXT');
    expect(updated).toContain('### Rate limiting');
    expect(readFileSync(join(root, 'agents/README.md'), 'utf8')).toBe(readmeBefore);
    expect(readFileSync(join(root, 'agents/PROJECT_CONTEXT.md'), 'utf8')).toBe(contextBefore);
    expect(readFileSync(join(root, 'agents/knowledge/INDEX.md'), 'utf8')).toBe(indexBefore);
  });

  it('previews add-time guidance updates without writing them', async () => {
    const root = project();
    await initialize({ root, packageVersion: '0.1.0', dryRun: false, resume: false, skipInstall: true, runFeature: () => undefined });
    const architectureBefore = readFileSync(join(root, 'agents/ARCHITECTURE.md'), 'utf8');
    const mapBefore = readFileSync(join(root, 'agents/CODEBASE_MAP.md'), 'utf8');

    const result = await addPresets({ root, names: ['rate-limit'], dryRun: true, skipInstall: true });

    expect(result.operations).toContain('UPDATE agents/ARCHITECTURE.md');
    expect(result.operations).toContain('UPDATE agents/CODEBASE_MAP.md');
    expect(result.operations).not.toContain('UPDATE AGENTS.md');
    expect(readFileSync(join(root, 'agents/ARCHITECTURE.md'), 'utf8')).toBe(architectureBefore);
    expect(readFileSync(join(root, 'agents/CODEBASE_MAP.md'), 'utf8')).toBe(mapBefore);
    const manifest = JSON.parse(readFileSync(join(root, '.nest-cqrs.json'), 'utf8'));
    expect(manifest.presets['rate-limit']).toBeUndefined();
  });

  it.each([
    ['missing', (source: string) => source.replace('<!-- nest-cqrs:managed:architecture:end -->', '')],
    ['duplicate', (source: string) => source.replace('<!-- nest-cqrs:managed:architecture:start -->', '<!-- nest-cqrs:managed:architecture:start -->\n<!-- nest-cqrs:managed:architecture:start -->')],
    ['reversed', (source: string) => source.replace(/<!-- nest-cqrs:managed:architecture:start -->[\s\S]*<!-- nest-cqrs:managed:architecture:end -->/, '<!-- nest-cqrs:managed:architecture:end -->\ncontent\n<!-- nest-cqrs:managed:architecture:start -->')],
    ['nested', (source: string) => source.replace('<!-- nest-cqrs:managed:architecture:end -->', '<!-- nest-cqrs:managed:extra:start -->\n<!-- nest-cqrs:managed:extra:end -->\n<!-- nest-cqrs:managed:architecture:end -->')],
  ])('rejects %s managed markers before writing preset changes', async (_kind, mutate) => {
    const root = project();
    await initialize({ root, packageVersion: '0.1.0', dryRun: false, resume: false, skipInstall: true, runFeature: () => undefined });
    const architecturePath = join(root, 'agents/ARCHITECTURE.md');
    writeFileSync(architecturePath, mutate(readFileSync(architecturePath, 'utf8')));
    const appBefore = readFileSync(join(root, 'src/app.module.ts'), 'utf8');

    await expect(addPresets({ root, names: ['rate-limit'], dryRun: false, skipInstall: true })).rejects.toThrow('managed block');
    expect(readFileSync(join(root, 'src/app.module.ts'), 'utf8')).toBe(appBefore);
    const manifest = JSON.parse(readFileSync(join(root, '.nest-cqrs.json'), 'utf8'));
    expect(manifest.presets['rate-limit']).toBeUndefined();
  });

  it('rejects a missing managed guidance file before writing preset changes', async () => {
    const root = project();
    await initialize({ root, packageVersion: '0.1.0', dryRun: false, resume: false, skipInstall: true, runFeature: () => undefined });
    rmSync(join(root, 'agents/CODEBASE_MAP.md'));
    const appBefore = readFileSync(join(root, 'src/app.module.ts'), 'utf8');

    await expect(addPresets({ root, names: ['rate-limit'], dryRun: false, skipInstall: true })).rejects.toThrow('managed guidance file is missing');
    expect(readFileSync(join(root, 'src/app.module.ts'), 'utf8')).toBe(appBefore);
  });

  it('dry-run reports operations without writing', () => {
    const root = project();
    const plan = buildPlan(root, '0.1.0');
    const operations = applyPlan(root, plan, true);
    expect(operations).toContain('UPDATE src/main.ts');
    expect(operations).toContain('CREATE AGENTS.md');
    expect(operations).toContain('CREATE agents/README.md');
    expect(operations).toContain('CREATE agents/ARCHITECTURE.md');
    expect(operations).toContain('CREATE agents/PROJECT_CONTEXT.md');
    expect(operations).toContain('CREATE agents/CODEBASE_MAP.md');
    expect(operations).toContain('CREATE agents/knowledge/INDEX.md');
    expect(readFileSync(join(root, 'src/main.ts'), 'utf8')).toBe('default');
    expect(existsSync(join(root, '.env.example'))).toBe(false);
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false);
    expect(existsSync(join(root, 'ai'))).toBe(false);
  });

  it('initializes without installation and writes the manifest last', async () => {
    const root = project();
    const result = await initialize({ root, packageVersion: '0.1.0', dryRun: false, resume: false, skipInstall: true, runFeature: () => undefined });
    expect(result.complete).toBe(true);
    expect(existsSync(join(root, '.nest-cqrs.json'))).toBe(true);
    expect(existsSync(join(root, '.nest-cqrs.pending.json'))).toBe(false);
    expect(readFileSync(join(root, 'src/main.ts'), 'utf8')).toContain('FastifyAdapter');
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(root, 'agents/knowledge/INDEX.md'))).toBe(true);
  });

  it('preserves project-owned .gitignore content through init and add', async () => {
    const root = project();
    const original = '# NestJS\n/dist\n/node_modules\n!node_modules/example\n';
    writeFileSync(join(root, '.gitignore'), original);
    await initialize({ root, packageVersion: '0.1.0', dryRun: false, resume: false, skipInstall: true, runFeature: () => undefined });
    const afterInit = readFileSync(join(root, '.gitignore'), 'utf8');
    expect(afterInit.startsWith(original)).toBe(true);

    await addPresets({ root, names: ['rate-limit'], dryRun: false, skipInstall: true });

    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe(afterInit);
  });

  it('formats the full project after installation and feature generation', async () => {
    const root = project();
    const order: string[] = [];
    const install = vi.fn(() => order.push('install'));
    const runFeature = vi.fn(() => { order.push('feature'); });
    const format = vi.fn(() => {
      order.push('format');
      expect(existsSync(join(root, '.nest-cqrs.pending.json'))).toBe(true);
      expect(existsSync(join(root, '.nest-cqrs.json'))).toBe(false);
    });

    await initialize({
      root,
      packageVersion: '0.1.0',
      dryRun: false,
      resume: false,
      skipInstall: false,
      dummyFeature: 'examples',
      install,
      runFeature,
      format,
    });

    expect(order).toEqual(['install', 'feature', 'format']);
    expect(format).toHaveBeenCalledWith(root, 'npm');
    expect(existsSync(join(root, '.nest-cqrs.json'))).toBe(true);
  });

  it('keeps initialization recovery metadata when formatting fails', async () => {
    const root = project();
    await expect(initialize({
      root,
      packageVersion: '0.1.0',
      dryRun: false,
      resume: false,
      skipInstall: false,
      install: vi.fn(),
      runFeature: () => undefined,
      format: () => { throw new Error('simulated format failure'); },
    })).rejects.toThrow('simulated format failure');
    expect(existsSync(join(root, '.nest-cqrs.pending.json'))).toBe(true);
    expect(existsSync(join(root, '.nest-cqrs.json'))).toBe(false);
  });

  it('formats after adding a preset when installation is enabled', async () => {
    const root = project();
    await initialize({ root, packageVersion: '0.1.0', dryRun: false, resume: false, skipInstall: true, runFeature: () => undefined });
    const order: string[] = [];
    await addPresets({
      root,
      names: ['rate-limit'],
      dryRun: false,
      skipInstall: false,
      install: vi.fn(() => order.push('install')),
      format: vi.fn(() => order.push('format')),
    });
    expect(order).toEqual(['install', 'format']);
  });

  it('does not run formatting for dry runs or when installation is skipped', async () => {
    const dryRoot = project();
    const dryFormat = vi.fn();
    await initialize({ root: dryRoot, packageVersion: '0.1.0', dryRun: true, resume: false, skipInstall: false, runFeature: () => undefined, format: dryFormat });
    expect(dryFormat).not.toHaveBeenCalled();

    const skippedRoot = project();
    const skippedFormat = vi.fn();
    await initialize({ root: skippedRoot, packageVersion: '0.1.0', dryRun: false, resume: false, skipInstall: true, runFeature: () => undefined, format: skippedFormat });
    expect(skippedFormat).not.toHaveBeenCalled();
  });

  it('rejects repeated initialization', () => {
    const root = project();
    writeFileSync(join(root, '.nest-cqrs.json'), '{}');
    expect(() => preflight(root)).toThrow('already initialized');
  });

  it('keeps recovery metadata after an install failure and resumes safely', async () => {
    const root = project();
    const originalGitignore = '# user rules\n/dist\n';
    writeFileSync(join(root, '.gitignore'), originalGitignore);
    await expect(initialize({
      root,
      packageVersion: '0.1.0',
      dryRun: false,
      resume: false,
      skipInstall: false,
      runFeature: () => undefined,
      install: () => { throw new Error('simulated install failure'); },
    })).rejects.toThrow('simulated install failure');
    expect(existsSync(join(root, '.nest-cqrs.pending.json'))).toBe(true);
    expect(existsSync(join(root, '.nest-cqrs.json'))).toBe(false);
    const guidanceBeforeResume = readFileSync(join(root, 'agents/ARCHITECTURE.md'), 'utf8');
    const afterFailure = readFileSync(join(root, '.gitignore'), 'utf8');
    expect(afterFailure.startsWith(originalGitignore)).toBe(true);
    writeFileSync(join(root, '.gitignore'), `${afterFailure}# added while pending\n`);
    const beforeResume = readFileSync(join(root, '.gitignore'), 'utf8');

    await initialize({
      root,
      packageVersion: '0.1.0',
      dryRun: false,
      resume: true,
      skipInstall: false,
      runFeature: () => undefined,
      install: () => undefined,
      format: vi.fn(),
    });
    expect(existsSync(join(root, '.nest-cqrs.pending.json'))).toBe(false);
    expect(existsSync(join(root, '.nest-cqrs.json'))).toBe(true);
    expect(readFileSync(join(root, 'agents/ARCHITECTURE.md'), 'utf8')).toBe(guidanceBeforeResume);
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe(beforeResume);
  });

  it('approves ignored pnpm builds, checkpoints allowBuilds, then resumes successfully', async () => {
    const root = project();
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
    const install = vi.fn()
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('Dependency installation failed'), {
          pnpmOutput: 'WARN ignored build scripts\nERR_PNPM_IGNORED_BUILDS',
        });
      })
      .mockImplementationOnce(() => {
        throw new Error('simulated interruption after approval');
      });
    const approvalSpawn = vi.fn((command, args, options) => {
      expect(command).toBe('pnpm');
      expect(args).toEqual(['approve-builds', '--all']);
      expect(options.cwd).toBe(root);
      writeFileSync(join(root, 'pnpm-workspace.yaml'), "allowBuilds:\n  '@scarf/scarf': true\n  protobufjs: true\n");
      return { status: 0 };
    });
    const approveBuilds = vi.fn((projectRoot) => approvePnpmBuilds(projectRoot, approvalSpawn));

    await expect(initialize({
      root,
      packageVersion: '0.1.0',
      dryRun: false,
      resume: false,
      skipInstall: false,
      runFeature: () => undefined,
      install,
      approveBuilds,
    })).rejects.toThrow('simulated interruption after approval');

    expect(approveBuilds).toHaveBeenCalledOnce();
    expect(approveBuilds).toHaveBeenCalledWith(root);
    expect(approvalSpawn).toHaveBeenCalledOnce();
    expect(install).toHaveBeenNthCalledWith(1, root, 'pnpm');
    expect(install).toHaveBeenNthCalledWith(2, root, 'pnpm');
    const checkpoint = JSON.parse(readFileSync(join(root, '.nest-cqrs.pending.json'), 'utf8'));
    expect(checkpoint.pnpm.allowBuilds).toEqual({ '@scarf/scarf': true, protobufjs: true });
    expect(JSON.stringify(checkpoint)).not.toContain('dangerouslyAllowAllBuilds');
    expect(existsSync(join(root, '.nest-cqrs.json'))).toBe(false);

    await initialize({
      root,
      packageVersion: '0.1.0',
      dryRun: false,
      resume: true,
      skipInstall: false,
      runFeature: () => undefined,
      install: vi.fn(),
      approveBuilds: vi.fn(),
      format: vi.fn(),
    });
    expect(install).toHaveBeenCalledTimes(2);
    expect(existsSync(join(root, '.nest-cqrs.pending.json'))).toBe(false);
    expect(existsSync(join(root, '.nest-cqrs.json'))).toBe(true);
  });

  it('does not approve builds for other install failures', async () => {
    const root = project();
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
    const approveBuilds = vi.fn();
    await expect(initialize({
      root,
      packageVersion: '0.1.0',
      dryRun: false,
      resume: false,
      skipInstall: false,
      runFeature: () => undefined,
      install: () => { throw new Error('registry unavailable'); },
      approveBuilds,
    })).rejects.toThrow('registry unavailable');
    expect(approveBuilds).not.toHaveBeenCalled();
  });

  it('rejects collisions outside replaceable starter files', () => {
    const root = project();
    mkdirSync(join(root, 'src/health'));
    writeFileSync(join(root, 'src/health/health.module.ts'), 'custom');
    expect(() => applyPlan(root, buildPlan(root, '0.1.0'), false)).toThrow('Refusing to overwrite');
    expect(readFileSync(join(root, 'src/main.ts'), 'utf8')).toBe('default');
  });

  it.each(['AGENTS.md', 'agents/ARCHITECTURE.md'])('rejects a %s guidance collision before any writes', (path) => {
    const root = project();
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), 'user content');
    expect(() => applyPlan(root, buildPlan(root, '0.1.0'), false)).toThrow('Refusing to overwrite');
    expect(readFileSync(join(root, 'src/main.ts'), 'utf8')).toBe('default');
    expect(readFileSync(join(root, path), 'utf8')).toBe('user content');
  });

  it('does not rewrite managed guidance or project-owned text for a v5/v3 project', async () => {
    const root = project();
    await initialize({ root, packageVersion: '0.1.0', dryRun: false, resume: false, skipInstall: true, runFeature: () => undefined });
    const manifestPath = join(root, '.nest-cqrs.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.foundation.version = 5;
    for (const preset of Object.values(manifest.presets ?? {}) as Array<{ version: number }>) preset.version = 3;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const architecturePath = join(root, 'agents/ARCHITECTURE.md');
    const customized = `${readFileSync(architecturePath, 'utf8')}\nUSER-OWNED LEGACY NOTE\n`;
    writeFileSync(architecturePath, customized);

    const result = await addPresets({ root, names: ['rate-limit'], dryRun: false, skipInstall: true });
    expect(result.operations).not.toContain('UPDATE agents/ARCHITECTURE.md');
    expect(result.operations).not.toContain('UPDATE agents/CODEBASE_MAP.md');
    expect(readFileSync(architecturePath, 'utf8')).toBe(customized);
    const updatedManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(updatedManifest.foundation.version).toBe(5);
    expect(updatedManifest.presets['rate-limit'].version).toBe(4);
  });
});
