import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { devDependencies, files, FOUNDATION_VERSION, removableDefaultFiles, runtimeDependencies } from './foundation.js';
import { GUIDANCE_FOUNDATION_VERSION, managedBlocks, renderGuidanceFiles, replaceManagedBlock } from './guidance.js';
import { applyPresets, PRESET_VERSION, presetNames } from './presets.js';

const manifestPath = '.nest-cqrs.json';
const pendingPath = '.nest-cqrs.pending.json';
const gitignoreEntries = ['.env', '.env.development', '.env.staging', '.env.production', pendingPath];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const addMissing = (existing = {}, additions) => Object.fromEntries([
  ...Object.entries(additions),
  ...Object.entries(existing),
]);

function usesEsmImports(root) {
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  if (packageJson.type === 'module') return true;

  const tsconfig = JSON.parse(readFileSync(resolve(root, 'tsconfig.json'), 'utf8'));
  const moduleKind = String(tsconfig.compilerOptions?.module ?? '').toLowerCase();
  const moduleResolution = String(tsconfig.compilerOptions?.moduleResolution ?? '').toLowerCase();
  return moduleResolution !== 'bundler'
    && ['es2015', 'es2020', 'es2022', 'es6', 'esnext'].includes(moduleKind);
}

function applyImportStyle(files, esm) {
  if (!esm) return files;
  const relativeImport = /((?:from\s+|import\s*)['"])(\.{1,2}\/[^'"]+?)(?<!\.js)(['"])/g;
  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith('.ts')) files[path] = content.replace(relativeImport, '$1$2.js$3');
  }
  return files;
}

const detectTestRunner = (packageJson) => packageJson.devDependencies?.vitest || packageJson.dependencies?.vitest
  ? 'vitest'
  : 'jest';

function gitignoreAppend(root) {
  const path = resolve(root, '.gitignore');
  if (!existsSync(path)) return `${gitignoreEntries.join('\n')}\n`;

  const existing = readFileSync(path);
  const text = existing.toString('utf8');
  const activeLines = new Set(text.split(/\r\n|\n|\r/));
  const missing = gitignoreEntries.filter((entry) => !activeLines.has(entry));
  if (!missing.length) return '';

  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  if (!existing.length) return `${missing.join(newline)}${newline}`;
  const hasTrailingNewline = text.endsWith('\n') || text.endsWith('\r');
  const hasBlankLine = text.endsWith('\n\n') || text.endsWith('\r\n\r\n') || text.endsWith('\r\r');
  const separator = hasBlankLine ? '' : hasTrailingNewline ? newline : `${newline}${newline}`;
  return `${separator}${missing.join(newline)}${newline}`;
}

export function ensureGitignore(root, dryRun = false) {
  const addition = gitignoreAppend(root);
  if (!addition) return false;
  if (!dryRun) appendFileSync(resolve(root, '.gitignore'), addition);
  return true;
}

export function buildPlan(root, packageVersion, dummyFeature, selectedPresets = [], databaseOptions = {}) {
  const packagePath = resolve(root, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  const testRunner = detectTestRunner(packageJson);
  packageJson.dependencies = addMissing(packageJson.dependencies, runtimeDependencies);
  delete packageJson.dependencies?.['@nestjs/platform-express'];
  packageJson.devDependencies = addMissing(packageJson.devDependencies, devDependencies);

  const generated = { ...files };
  const normalizedPresets = new Set(selectedPresets);
  if (normalizedPresets.has('database') && databaseOptions.migrations) normalizedPresets.add('migrations');
  const appliedPresets = applyPresets({
    files: generated,
    packageJson,
    selected: [...normalizedPresets],
    databaseType: databaseOptions.type,
    migrations: databaseOptions.migrations,
    testRunner,
  });
  if (testRunner === 'vitest' && generated['src/health/health.controller.spec.ts']) {
    generated['src/health/health.controller.spec.ts'] = generated['src/health/health.controller.spec.ts']
      .replaceAll('jest.fn()', 'vi.fn()');
  }
  applyImportStyle(generated, usesEsmImports(root));
  Object.assign(generated, renderGuidanceFiles({
    packageManager: detectPackageManager(root),
    packageJson,
    selectedPresets: appliedPresets,
    databaseType: databaseOptions.type,
    dummyFeature,
  }));
  generated['package.json'] = `${JSON.stringify(packageJson, null, 2)}\n`;

  const manifest = {
    manifestVersion: 1,
    generator: { name: '@retail-pos/schematics', version: packageVersion },
    foundation: {
      version: FOUNDATION_VERSION,
      status: 'complete',
      appliedAt: new Date().toISOString(),
      ...(dummyFeature ? { starterFeature: dummyFeature } : {}),
    },
    presets: Object.fromEntries(appliedPresets.map((name) => [name, {
      version: PRESET_VERSION,
      status: 'complete',
      ...(name === 'database' ? { type: databaseOptions.type, migrations: Boolean(databaseOptions.migrations) || appliedPresets.includes('migrations') } : {}),
    }])),
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
  const gitignoreExisted = existsSync(resolve(root, '.gitignore'));
  if (ensureGitignore(root, dryRun)) {
    operations.push(`${gitignoreExisted ? 'APPEND' : 'CREATE'} .gitignore`);
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
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: false });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const pnpmOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
    const error = new Error(
      `Dependency installation failed with status ${result.status}.${pnpmOutput ? `\n${pnpmOutput}` : ''}`,
    );
    error.pnpmOutput = pnpmOutput;
    error.code = pnpmOutput.includes('ERR_PNPM_IGNORED_BUILDS')
      ? 'ERR_PNPM_IGNORED_BUILDS'
      : undefined;
    throw error;
  }
}

export function formatProject(root, packageManager) {
  const command = packageManager === 'npm' ? 'npm' : packageManager;
  const args = packageManager === 'npm' ? ['run', 'format'] : ['format'];
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: false });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Project formatting failed with status ${result.status}.`);
  }
}

export function approvePnpmBuilds(root, spawn = spawnSync) {
  const result = spawn('pnpm', ['approve-builds', '--all'], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`pnpm approve-builds --all failed with status ${result.status}.`);
  }
}

function isIgnoredBuildsError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return error?.code === 'ERR_PNPM_IGNORED_BUILDS'
    || error?.pnpmOutput?.includes('ERR_PNPM_IGNORED_BUILDS')
    || message.includes('ERR_PNPM_IGNORED_BUILDS');
}

function readPnpmAllowBuilds(root) {
  const workspacePath = resolve(root, 'pnpm-workspace.yaml');
  if (!existsSync(workspacePath)) {
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    return packageJson.pnpm?.allowBuilds ?? null;
  }

  const lines = readFileSync(workspacePath, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((line) => /^allowBuilds\s*:/.test(line));
  if (start === -1) return null;
  const headerValue = lines[start].replace(/^allowBuilds\s*:\s*/, '').trim();
  if (headerValue && headerValue !== '{}') {
    try { return JSON.parse(headerValue); } catch { return headerValue; }
  }

  const allowBuilds = {};
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (!/^\s+/.test(line)) break;
    const entry = line.match(/^\s+(['"]?)([^:'"]+)\1\s*:\s*(true|false)\s*(?:#.*)?$/);
    if (entry) allowBuilds[entry[2].trim()] = entry[3] === 'true';
  }
  return allowBuilds;
}

function updatePnpmRecoveryCheckpoint(root, packageVersion, dummyFeature, selectedPresets, databaseOptions) {
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const plan = buildPlan(root, packageVersion, dummyFeature, selectedPresets, databaseOptions);
  const checkpointPath = resolve(root, pendingPath);
  const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf8'));
  checkpoint.planHash = hash(JSON.stringify(plan.generated));
  checkpoint.pnpm = {
    allowBuilds: readPnpmAllowBuilds(root),
    approvedAt: new Date().toISOString(),
  };
  writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
}

export function detectPackageManager(root) {
  if (existsSync(resolve(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(resolve(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

export async function initialize({ root, packageVersion, dryRun, resume, skipInstall, dummyFeature, selectedPresets = [], databaseOptions = {}, runFeature, install = installDependencies, approveBuilds = approvePnpmBuilds, format = formatProject }) {
  preflight(root, resume);
  if (resume) {
    const pending = JSON.parse(readFileSync(resolve(root, pendingPath), 'utf8'));
    selectedPresets = pending.selectedPresets ?? selectedPresets;
    databaseOptions = pending.databaseOptions ?? databaseOptions;
    dummyFeature = pending.dummyFeature ?? dummyFeature;
  }
  const plan = buildPlan(root, packageVersion, dummyFeature, selectedPresets, databaseOptions);
  const digest = hash(JSON.stringify(plan.generated));
  if (resume) {
    const pending = JSON.parse(readFileSync(resolve(root, pendingPath), 'utf8'));
    if (pending.planHash !== digest) throw new Error('Cannot resume because the project or generator plan has changed. Resolve the drift first.');
    if (pending.pnpm && JSON.stringify(pending.pnpm.allowBuilds) !== JSON.stringify(readPnpmAllowBuilds(root))) {
      throw new Error('Cannot resume because pnpm allowBuilds changed after approval. Resolve the configuration drift first.');
    }
  }
  const operations = resume ? [] : applyPlan(root, plan, dryRun);
  if (dryRun) return { operations, complete: false };

  if (resume) ensureGitignore(root);

  if (!resume) writeFileSync(resolve(root, pendingPath), `${JSON.stringify({
    manifestVersion: 1,
    foundationVersion: FOUNDATION_VERSION,
    planHash: digest,
    selectedPresets,
    databaseOptions,
    dummyFeature,
  }, null, 2)}\n`);
  const packageManager = detectPackageManager(root);
  if (!skipInstall) {
    try {
      install(root, packageManager);
    } catch (error) {
      if (packageManager !== 'pnpm' || !isIgnoredBuildsError(error)) throw error;
      console.log('Detected ERR_PNPM_IGNORED_BUILDS. Approving pending dependency builds with pnpm approve-builds --all.');
      approveBuilds(root);
      updatePnpmRecoveryCheckpoint(root, packageVersion, dummyFeature, selectedPresets, databaseOptions);
      install(root, packageManager);
    }
  }
  if (dummyFeature) await runFeature(dummyFeature);
  if (!skipInstall) format(root, packageManager);

  writeFileSync(resolve(root, manifestPath), `${JSON.stringify(plan.manifest, null, 2)}\n`);
  rmSync(resolve(root, pendingPath));
  return { operations, complete: true };
}

export async function addPresets({ root, names, dryRun, skipInstall, databaseOptions = {}, install = installDependencies, format = formatProject }) {
  for (const name of names) if (!presetNames.includes(name)) throw new Error(`Unknown preset: ${name}. Available: ${presetNames.join(', ')}`);
  const manifestFile = resolve(root, manifestPath);
  if (!existsSync(manifestFile)) throw new Error('Run nest-cqrs init before adding presets.');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const already = names.filter((name) => manifest.presets?.[name]?.status === 'complete');
  if (already.length) throw new Error(`Already installed: ${already.join(', ')}`);
  const effectiveDatabaseOptions = {
    ...databaseOptions,
    type: databaseOptions.type ?? manifest.presets?.database?.type,
    migrations: databaseOptions.migrations ?? names.includes('migrations'),
  };
  if (names.includes('migrations') && manifest.presets?.database?.migrations) {
    throw new Error('Migrations are already configured for this database.');
  }

  const controlledPaths = [
    'src/main.ts', 'src/app.module.ts', 'src/config/env.config.types.ts',
    'src/config/configuration.ts', 'src/config/env.validation.ts', 'src/config/env.d.ts',
    'src/health/health.controller.ts', 'src/health/health.module.ts', 'src/health/health.controller.spec.ts',
    'src/database/data-source.ts', 'src/database/migrations/.gitkeep', 'test/app.e2e-spec.ts',
    'test/rate-limit.e2e-spec.ts',
    'test/database.integration-spec.ts', 'test/setup-integration-env.ts', 'test/jest-integration.json',
    'vitest.config.integration.ts', '.env.example',
  ];
  const generated = Object.fromEntries(controlledPaths.filter((path) => existsSync(resolve(root, path))).map((path) => [path, readFileSync(resolve(root, path), 'utf8')]));
  const originalPaths = new Set(Object.keys(generated));
  originalPaths.add('package.json');
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const applied = applyPresets({
    files: generated,
    packageJson,
    selected: names,
    databaseType: effectiveDatabaseOptions.type,
    migrations: effectiveDatabaseOptions.migrations,
    testRunner: detectTestRunner(packageJson),
  });
  applyImportStyle(generated, usesEsmImports(root));
  generated['package.json'] = `${JSON.stringify(packageJson, null, 2)}\n`;
  if (manifest.foundation?.version >= GUIDANCE_FOUNDATION_VERSION) {
    const selectedPresets = [...new Set([
      ...Object.entries(manifest.presets ?? {})
        .filter(([, preset]) => preset?.status === 'complete')
        .map(([name]) => name),
      ...applied,
    ])];
    const desiredGuidance = renderGuidanceFiles({
      packageManager: detectPackageManager(root),
      packageJson,
      selectedPresets,
      databaseType: effectiveDatabaseOptions.type,
      dummyFeature: manifest.foundation.starterFeature,
    });
    for (const [path, block] of Object.entries(managedBlocks)) {
      const absolute = resolve(root, path);
      if (!existsSync(absolute)) {
        throw new Error(`Cannot update ${path}: managed guidance file is missing.`);
      }
      originalPaths.add(path);
      const current = readFileSync(absolute, 'utf8');
      const updated = replaceManagedBlock(current, desiredGuidance[path], block, path);
      if (updated !== current) generated[path] = updated;
    }
  }
  for (const path of Object.keys(generated)) {
    if (!originalPaths.has(path) && existsSync(resolve(root, path))) throw new Error(`Refusing to overwrite existing file: ${path}`);
  }
  const operations = Object.entries(generated).map(([path, content]) => {
    const absolute = resolve(root, path);
    const existed = existsSync(absolute);
    if (!dryRun) { mkdirSync(dirname(absolute), { recursive: true }); writeFileSync(absolute, content); }
    return `${existed ? 'UPDATE' : 'CREATE'} ${path}`;
  });
  const gitignoreExisted = existsSync(resolve(root, '.gitignore'));
  if (ensureGitignore(root, dryRun)) {
    operations.push(`${gitignoreExisted ? 'APPEND' : 'CREATE'} .gitignore`);
  }
  if (dryRun) return { operations, complete: false };
  if (!skipInstall) {
    const packageManager = detectPackageManager(root);
    install(root, packageManager);
    format(root, packageManager);
  }
  manifest.presets ??= {};
  for (const name of applied) manifest.presets[name] = {
    version: PRESET_VERSION,
    status: 'complete',
    appliedAt: new Date().toISOString(),
    ...(name === 'database' ? { type: effectiveDatabaseOptions.type, migrations: Boolean(effectiveDatabaseOptions.migrations) || names.includes('migrations') } : {}),
    ...(name === 'migrations' ? { databaseType: effectiveDatabaseOptions.type } : {}),
  };
  if (applied.includes('migrations') && manifest.presets.database) {
    manifest.presets.database.migrations = true;
  }
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  return { operations, complete: true };
}
