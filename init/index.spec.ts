import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPlan, buildPlan, initialize, preflight } from './index.js';

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
    expect(plan.generated['src/app.module.ts']).not.toContain('TypeOrmModule');
    expect(plan.generated['package.json']).not.toContain('node-flow');
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

  it('rejects collisions outside replaceable starter files', () => {
    const root = project();
    mkdirSync(join(root, 'src/health'));
    writeFileSync(join(root, 'src/health/health.module.ts'), 'custom');
    expect(() => applyPlan(root, buildPlan(root, '0.1.0'), false)).toThrow('Refusing to overwrite');
    expect(readFileSync(join(root, 'src/main.ts'), 'utf8')).toBe('default');
  });
});
