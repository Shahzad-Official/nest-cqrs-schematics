import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addPresets, approvePnpmBuilds, applyPlan, buildPlan, initialize, preflight } from './index.js';

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'nest-cqrs-init-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { '@nestjs/core': '^12.0.0', '@nestjs/platform-express': '^12.0.0' }, scripts: {} }));
  writeFileSync(join(root, 'nest-cli.json'), JSON.stringify({ collection: '@nestjs/schematics', sourceRoot: 'src' }));
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
  writeFileSync(join(root, 'src/main.ts'), 'default');
  writeFileSync(join(root, 'src/app.module.ts'), 'default');
  return root;
}

describe('init foundation', () => {
  it('builds a Fastify ESM foundation without deferred integrations', () => {
    const root = project();
    const plan = buildPlan(root, '0.1.0');
    expect(plan.generated['src/main.ts']).toContain('FastifyAdapter');
    expect(plan.generated['src/main.ts']).toContain("'docs'");
    expect(plan.generated['src/config/env.d.ts']).toContain('declare global');
    expect(plan.generated['src/config/env.d.ts']).toContain('interface ProcessEnv');
    expect(plan.generated['src/config/env.validation.ts']).toContain("NODE_ENV: Joi.string()");
    expect(plan.generated['src/config/env.validation.ts']).toContain('.valid(\'development\', \'staging\', \'production\')');
    expect(plan.generated['src/config/env.validation.ts']).toContain('.required()');
    expect(plan.generated['src/config/configuration.ts']).toContain('const parsed = process.env;');
    expect(plan.generated['src/config/configuration.ts']).toContain('env: parsed.NODE_ENV');
    expect(plan.generated['src/config/configuration.ts']).not.toContain('Number(process.env');
    expect(plan.generated['src/config/configuration.ts']).not.toContain('as EnvConfig[');
    expect(plan.generated['src/app.module.ts']).toContain("config.getOrThrow('env'");
    expect(plan.generated['src/app.module.ts']).not.toContain('TypeOrmModule');
    expect(plan.generated['package.json']).not.toContain('node-flow');
    expect(plan.generated['src/health/health.controller.ts']).toContain('HealthCheckService');
    expect(plan.generated['src/health/health.module.ts']).toContain('TerminusModule');
    expect(plan.generated['.env.development.example']).toBeUndefined();
  });

  it('composes PostgreSQL migrations and rate limiting into the foundation plan', () => {
    const root = project();
    const plan = buildPlan(root, '0.1.0', 'examples', ['database', 'rate-limit'], { type: 'postgres', migrations: true });
    expect(plan.generated['src/app.module.ts']).toContain('TypeOrmModule.forRootAsync');
    expect(plan.generated['src/app.module.ts']).toContain('ThrottlerModule.forRoot');
    expect(plan.generated['src/instrumentation.ts']).toBeUndefined();
    expect(plan.generated['compose.jaeger.yml']).toBeUndefined();
    expect(plan.generated['src/database/data-source.ts']).toContain("type: 'postgres'");
    expect(plan.generated['src/config/env.d.ts']).toContain('DB_HOST: string');
    expect(plan.generated['src/config/configuration.ts']).toContain('host: parsed.DB_HOST');
    expect(plan.generated['src/config/env.validation.ts']).toContain('DB_HOST: Joi.string().required()');
    expect(plan.generated['.env.example']).toContain('DB_HOST=localhost');
    expect(Object.keys(plan.manifest.presets)).toEqual(expect.arrayContaining(['database', 'migrations', 'rate-limit']));
    expect(plan.manifest.presets.database).toMatchObject({ type: 'postgres', migrations: true });
    expect(plan.generated['package.json']).not.toContain('@opentelemetry/');
    expect(plan.generated['.env.example']).not.toContain('OTEL_');
    expect(plan.generated['package.json']).not.toMatch(/passport|@nestjs\/jwt/);
    expect(plan.generated['src/auth/auth.module.ts']).toBeUndefined();
  });

  it('selects MySQL or MongoDB drivers and only generates relational migration scripts', () => {
    const mysql = buildPlan(project(), '0.1.0', undefined, ['database'], { type: 'mysql', migrations: false });
    const mysqlPackage = JSON.parse(mysql.generated['package.json']);
    expect(mysqlPackage.dependencies.mysql2).toBeDefined();
    expect(mysql.generated['src/app.module.ts']).toContain("type: 'mysql'");
    expect(mysql.generated['src/database/data-source.ts']).toBeUndefined();
    expect(mysqlPackage.scripts['migration:run']).toBeUndefined();

    const mongo = buildPlan(project(), '0.1.0', undefined, ['database'], { type: 'mongodb', migrations: false });
    const mongoPackage = JSON.parse(mongo.generated['package.json']);
    expect(mongoPackage.dependencies.mongodb).toBeDefined();
    expect(mongo.generated['src/app.module.ts']).toContain("type: 'mongodb'");
    expect(mongo.generated['src/app.module.ts']).toContain('tls: db.ssl');
    expect(mongo.generated['src/database/data-source.ts']).toBeUndefined();
    expect(mongoPackage.scripts['migration:run']).toBeUndefined();
    expect(mongo.generated['src/health/health.controller.ts']).toContain('this.health.check([])');

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
  });

  it('dry-run reports operations without writing', () => {
    const root = project();
    const plan = buildPlan(root, '0.1.0');
    const operations = applyPlan(root, plan, true);
    expect(operations).toContain('UPDATE src/main.ts');
    expect(readFileSync(join(root, 'src/main.ts'), 'utf8')).toBe('default');
    expect(existsSync(join(root, '.env.example'))).toBe(false);
  });

  it('initializes without installation and writes the manifest last', async () => {
    const root = project();
    const result = await initialize({ root, packageVersion: '0.1.0', dryRun: false, resume: false, skipInstall: true, runFeature: () => undefined });
    expect(result.complete).toBe(true);
    expect(existsSync(join(root, '.nest-cqrs.json'))).toBe(true);
    expect(existsSync(join(root, '.nest-cqrs.pending.json'))).toBe(false);
    expect(readFileSync(join(root, 'src/main.ts'), 'utf8')).toContain('FastifyAdapter');
  });

  it('rejects repeated initialization', () => {
    const root = project();
    writeFileSync(join(root, '.nest-cqrs.json'), '{}');
    expect(() => preflight(root)).toThrow('already initialized');
  });

  it('keeps recovery metadata after an install failure and resumes safely', async () => {
    const root = project();
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

    await initialize({
      root,
      packageVersion: '0.1.0',
      dryRun: false,
      resume: true,
      skipInstall: false,
      runFeature: () => undefined,
      install: () => undefined,
    });
    expect(existsSync(join(root, '.nest-cqrs.pending.json'))).toBe(false);
    expect(existsSync(join(root, '.nest-cqrs.json'))).toBe(true);
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
});
