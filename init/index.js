import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { devDependencies, files, FOUNDATION_VERSION, removableDefaultFiles, runtimeDependencies } from './foundation.js';

const manifestPath = '.nest-cqrs.json';
const pendingPath = '.nest-cqrs.pending.json';
const hash = (value) => createHash('sha256').update(value).digest('hex');

export function buildPlan(root, packageVersion, dummyFeature) {
  const packagePath = resolve(root, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  packageJson.type = 'module';
  packageJson.scripts = {
    ...packageJson.scripts,
    build: 'nest build',
    format: 'prettier --write "src/**/*.ts" "test/**/*.ts"',
    start: 'nest start',
    'start:dev': 'nest start --watch',
    'start:debug': 'nest start --debug --watch',
    'start:prod': 'node dist/src/main.js',
    lint: 'oxlint --type-aware src/ test/',
    test: 'vitest run',
    'test:watch': 'vitest',
    'test:cov': 'vitest run --coverage',
    'test:e2e': 'vitest run --config ./vitest.config.e2e.ts',
  };
  packageJson.dependencies = { ...packageJson.dependencies, ...runtimeDependencies };
  delete packageJson.dependencies?.['@nestjs/platform-express'];
  packageJson.devDependencies = { ...packageJson.devDependencies, ...devDependencies };
  packageJson.devDependencies.typescript ??= '^6.0.0';

  const generated = { ...files, 'package.json': `${JSON.stringify(packageJson, null, 2)}\n` };
  const nestCli = JSON.parse(readFileSync(resolve(root, 'nest-cli.json'), 'utf8'));
  nestCli.collection = '@nestjs/schematics';
  generated['nest-cli.json'] = `${JSON.stringify(nestCli, null, 2)}\n`;

  const tsconfigPath = resolve(root, 'tsconfig.json');
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
  Object.assign(tsconfig.compilerOptions, {
    module: 'nodenext',
    moduleResolution: 'nodenext',
    target: 'ES2023',
    strict: true,
    types: ['vitest/globals', 'node'],
  });
  generated['tsconfig.json'] = `${JSON.stringify(tsconfig, null, 2)}\n`;

  const gitignorePath = resolve(root, '.gitignore');
  const gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';
  const additions = ['.env', '.env.development', '.env.staging', '.env.production', '.nest-cqrs.pending.json'];
  const gitignoreLines = gitignore.trimEnd().split(/\r?\n/).filter(Boolean);
  for (const addition of additions) {
    if (!gitignoreLines.includes(addition)) gitignoreLines.push(addition);
  }
  generated['.gitignore'] = `${gitignoreLines.join('\n')}\n`;

  const manifest = {
    manifestVersion: 1,
    generator: { name: '@retail-pos/schematics', version: packageVersion },
    foundation: { version: FOUNDATION_VERSION, status: 'complete', appliedAt: new Date().toISOString() },
    presets: {},
  };
  return { generated, manifest, dummyFeature };
}

export function preflight(root, resume = false) {
  for (const required of ['package.json', 'nest-cli.json', 'tsconfig.json']) {
    if (!existsSync(resolve(root, required))) throw new Error(`Not a supported Nest project: ${required} is missing.`);
  }
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  if (!pkg.dependencies?.['@nestjs/core']) throw new Error('Not a supported Nest project: @nestjs/core is missing.');
  if (existsSync(resolve(root, manifestPath))) throw new Error('This project is already initialized (.nest-cqrs.json exists).');
  if (existsSync(resolve(root, pendingPath)) && !resume) throw new Error('An incomplete initialization exists. Run nest-cqrs init --resume.');
  if (resume && !existsSync(resolve(root, pendingPath))) throw new Error('There is no incomplete initialization to resume.');
}

export function applyPlan(root, plan, dryRun) {
  const operations = [];
  const replaceable = [
    'src/main.ts',
    'src/app.module.ts',
    'package.json',
    'nest-cli.json',
    'tsconfig.json',
    '.gitignore',
    'vitest.config.ts',
    'vitest.config.e2e.ts',
    'test/app.e2e-spec.ts',
  ];

  // Validate the complete plan before the first write so a collision cannot
  // leave a half-applied foundation.
  for (const path of Object.keys(plan.generated)) {
    const absolute = resolve(root, path);
    if (existsSync(absolute) && !replaceable.includes(path)) {
      throw new Error(`Refusing to overwrite existing file: ${path}`);
    }
  }

  for (const [path, content] of Object.entries(plan.generated)) {
    const absolute = resolve(root, path);
    operations.push(`${existsSync(absolute) ? 'UPDATE' : 'CREATE'} ${path}`);
    if (!dryRun) {
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, content);
    }
  }
  for (const path of removableDefaultFiles.filter((item) => item !== 'test/app.e2e-spec.ts')) {
    const absolute = resolve(root, path);
    if (existsSync(absolute)) {
      operations.push(`DELETE ${path}`);
      if (!dryRun) rmSync(absolute);
    }
  }
  return operations;
}

export function installDependencies(root, packageManager) {
  const command = packageManager === 'npm' ? 'npm' : packageManager;
  const args = packageManager === 'npm' ? ['install'] : ['install'];
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Dependency installation failed with status ${result.status}.`);
}

export function detectPackageManager(root) {
  if (existsSync(resolve(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(resolve(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

export async function initialize({ root, packageVersion, dryRun, resume, skipInstall, dummyFeature, runFeature, install = installDependencies }) {
  preflight(root, resume);
  const plan = buildPlan(root, packageVersion, dummyFeature);
  const digest = hash(JSON.stringify(plan.generated));
  if (resume) {
    const pending = JSON.parse(readFileSync(resolve(root, pendingPath), 'utf8'));
    if (pending.planHash !== digest) throw new Error('Cannot resume because the project or generator plan has changed. Resolve the drift first.');
  }
  const operations = resume ? [] : applyPlan(root, plan, dryRun);
  if (dryRun) return { operations, complete: false };

  if (!resume) writeFileSync(resolve(root, pendingPath), `${JSON.stringify({ manifestVersion: 1, foundationVersion: FOUNDATION_VERSION, planHash: digest }, null, 2)}\n`);
  if (!skipInstall) install(root, detectPackageManager(root));
  if (dummyFeature) await runFeature(dummyFeature);

  writeFileSync(resolve(root, manifestPath), `${JSON.stringify(plan.manifest, null, 2)}\n`);
  rmSync(resolve(root, pendingPath));
  return { operations, complete: true };
}
