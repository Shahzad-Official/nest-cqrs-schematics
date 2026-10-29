import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = resolve(repositoryRoot, 'bin/nest-cqrs.js');

function createNestProject(name: string, esm = false): string {
  const root = mkdtempSync(join(tmpdir(), `nest-cqrs-${name}-`));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({
    name: `acceptance-${name}`,
    version: '0.0.0',
    private: true,
    scripts: {
      build: 'nest build',
      format: 'prettier --write "src/**/*.ts" "test/**/*.ts"',
      lint: 'oxlint --type-aware src/ test/',
      test: 'node --experimental-vm-modules ./node_modules/jest/bin/jest.js',
      'test:e2e': 'node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config ./test/jest-e2e.json',
    },
    dependencies: {
      '@nestjs/common': '^12.0.0',
      '@nestjs/core': '^12.0.0',
      '@nestjs/platform-express': '^12.0.0',
      'reflect-metadata': '^0.2.2',
      rxjs: '^7.8.0',
    },
    devDependencies: {
      '@nestjs/cli': '^12.0.0',
      '@nestjs/testing': '^12.0.0',
      '@types/jest': '^30.0.0',
      '@types/node': '^24.0.0',
      '@types/supertest': '^7.0.0',
      jest: '^30.0.0',
      oxlint: '^1.58.0',
      'oxlint-tsgolint': '^7.0.2001',
      prettier: '^3.4.2',
      'source-map-support': '^0.5.21',
      supertest: '^7.0.0',
      'ts-jest': '^29.4.0',
      'ts-loader': '^9.5.0',
      'ts-node': '^10.9.0',
      'tsconfig-paths': '^4.2.0',
      typescript: '^6.0.0',
    },
  }, null, 2)}\n`);
  writeFileSync(join(root, 'nest-cli.json'), `${JSON.stringify({ collection: '@nestjs/schematics', sourceRoot: 'src' }, null, 2)}\n`);
  writeFileSync(join(root, 'pnpm-workspace.yaml'), "allowBuilds:\n  '@parcel/watcher': true\n  '@scarf/scarf': true\n  unrs-resolver: true\n");
  writeFileSync(join(root, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: {
      declaration: true,
      module: 'nodenext',
      moduleResolution: 'nodenext',
      isolatedModules: true,
      emitDecoratorMetadata: true,
      experimentalDecorators: true,
      removeComments: true,
      sourceMap: true,
      outDir: './dist',
      rootDir: '.',
      incremental: true,
      skipLibCheck: true,
      types: ['node', 'jest'],
      strictNullChecks: true,
      noImplicitAny: false,
      strictBindCallApply: false,
      forceConsistentCasingInFileNames: false,
      noFallthroughCasesInSwitch: false,
    },
  }, null, 2)}\n`);
  writeFileSync(join(root, 'tsconfig.build.json'), `${JSON.stringify({ extends: './tsconfig.json', exclude: ['node_modules', 'test', 'dist', '**/*spec.ts'] }, null, 2)}\n`);
  mkdirSync(join(root, 'test'), { recursive: true });
  writeFileSync(join(root, 'test/jest-e2e.json'), `${JSON.stringify({
    moduleFileExtensions: ['js', 'json', 'ts'],
    rootDir: '.',
    testEnvironment: 'node',
    testRegex: '.e2e-spec.ts$',
    transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  }, null, 2)}\n`);
  writeFileSync(join(root, 'jest.config.ts'), `import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\\\.spec\\\\.ts$',
  transform: { '^.+\\\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
};

export default config;
`);
  writeFileSync(join(root, 'src/main.ts'), 'export {};\n');
  writeFileSync(join(root, 'src/app.module.ts'), 'export {};\n');
  writeFileSync(join(root, '.gitignore'), '# Nest defaults\n/dist\n/node_modules\n\n# project rule\n.local-cache/\n');
  if (esm) {
    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    packageJson.type = 'module';
    Object.assign(packageJson.scripts, {
      test: 'vitest run',
      'test:e2e': 'vitest run --config ./vitest.config.e2e.ts',
    });
    for (const dependency of ['@types/jest', 'jest', 'ts-jest']) delete packageJson.devDependencies[dependency];
    Object.assign(packageJson.devDependencies, {
      '@vitest/coverage-v8': '^4.1.2',
      'vite-tsconfig-paths': '^5.1.4',
      vitest: '^4.1.2',
    });
    writeFileSync(join(root, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
    const tsconfig = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8'));
    tsconfig.compilerOptions.types = ['vitest/globals', 'node'];
    writeFileSync(join(root, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);
    rmSync(join(root, 'jest.config.ts'));
    writeFileSync(join(root, 'vitest.config.ts'), `import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({ plugins: [tsconfigPaths()], test: { globals: true, include: ['**/*.spec.ts'] } });
`);
    writeFileSync(join(root, 'vitest.config.e2e.ts'), `import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({ plugins: [tsconfigPaths()], test: { globals: true, include: ['test/**/*.e2e-spec.ts'] } });
`);
  }
  return root;
}

function run(root: string, command: string, args: string[]): void {
  try {
    execFileSync(command, args, {
      cwd: root,
      env: { ...process.env, CI: 'true' },
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    const failure = error as Error & { stdout?: string | Buffer; stderr?: string | Buffer };
    throw new Error([
      `Command failed in ${root}: ${command} ${args.join(' ')}`,
      failure.message,
      failure.stdout?.toString(),
      failure.stderr?.toString(),
    ].filter(Boolean).join('\n'));
  }
}

function verifyGeneratedApplication(
  name: string,
  initArgs: string[],
  esm = false,
  expectedScripts: Record<string, string> = {},
): void {
  const root = createNestProject(name, esm);
  try {
    run(root, process.execPath, [cli, 'init', '--skip-install', '--yes', ...initArgs]);
    run(root, 'pnpm', ['install', '--lockfile-only']);
    run(root, 'pnpm', ['install', '--frozen-lockfile']);
    run(root, 'pnpm', ['exec', 'prettier', '--write', 'src/**/*.ts']);
    run(root, 'pnpm', ['exec', 'prettier', '--check', 'src/**/*.ts']);
    for (const script of ['build', 'lint', 'test']) {
      run(root, 'pnpm', [script]);
    }
    const logging = readFileSync(join(root, 'src/common/logging/http-logger.options.ts'), 'utf8');
    expect(logging).toMatch(/if \(response\.statusCode >= 400\) return ["']warn["']/);
    expect(logging).toMatch(/return ["']silent["']/);
    expect(logging).toMatch(/customErrorMessage: \(\) => ["']HTTP request failed["']/);
    expect(logging).toMatch(
      /redact: \[["']req\.headers\.authorization["'], ["']req\.headers\.cookie["']\]/,
    );
    const loggingSpec = join(
      root,
      'src/common/logging/http-logger.options.spec.ts',
    );
    expect(existsSync(loggingSpec)).toBe(true);
    expect(existsSync(join(root, 'src/health/health.controller.spec.ts'))).toBe(false);
    expect(existsSync(join(root, 'test/app.e2e-spec.ts'))).toBe(false);
    expect(existsSync(join(root, 'test/database.integration-spec.ts'))).toBe(false);
    expect(existsSync(join(root, 'test/rate-limit.e2e-spec.ts'))).toBe(false);
    expect(readFileSync(join(root, '.nest-cqrs.json'), 'utf8')).toContain('"status": "complete"');
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe(
      '# Nest defaults\n/dist\n/node_modules\n\n# project rule\n.local-cache/\n\n.env\n.env.development\n.env.staging\n.env.production\n.nest-cqrs.pending.json\n',
    );
    const generatedPackage = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    );
    expect(generatedPackage.scripts.test).toBe(
      esm
        ? 'vitest run --passWithNoTests'
        : 'node --experimental-vm-modules ./node_modules/jest/bin/jest.js --passWithNoTests',
    );
    expect(generatedPackage.scripts).toMatchObject(expectedScripts);

    rmSync(loggingSpec);
    run(root, 'pnpm', ['test']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('generated application acceptance', () => {
  it('generates the AI project guidance', () => {
    const root = createNestProject('guidance');
    try {
      run(root, process.execPath, [
        cli,
        'init',
        '--skip-install',
        '--yes',
        '--no-dummy-feature',
      ]);

      const guidance = {
        'AGENTS.md': [
          '# Agent Instructions',
          '<!-- nest-cqrs:managed:guidance:start -->',
          'Follow existing canonical instructions',
          '.agents/instructions/engineering.md',
          '.agents/instructions/workflow.md',
        ],
        '.agents/README.md': [
          '# AI Project Guidance',
          'This layout follows ContextRivet',
          'Text inside `nest-cqrs:managed` markers is generator-owned.',
        ],
        '.agents/ARCHITECTURE.md': [
          '# Project architecture',
          '<!-- nest-cqrs:managed:architecture:start -->',
          '- NestJS runs on the Fastify adapter.',
          '### Request flow and component responsibilities',
          'Commands and queries describe one use-case intent',
          'Apply SOLID as design guidance, not as a checklist',
          '### Persistence and consistency',
          'must succeed or fail atomically',
          'No dummy CQRS feature was requested during initialization.',
        ],
        '.agents/PROJECT.md': [
          '# Project context',
          'Status: pending',
          'Product-specific context is INCOMPLETE.',
          'Use npm, matching the npm fallback used when no pnpm or Yarn lockfile is present.',
          '- Unit tests: `npm run test`',
        ],
        '.agents/CODEBASE_MAP.md': [
          '# Codebase Map',
          '<!-- nest-cqrs:managed:codebase-map:start -->',
          '- `src/main.ts` — Fastify bootstrap',
          "Nest CLI's existing Jest configuration",
        ],
        '.agents/instructions/testing.md': [
          '# Testing Guide',
          'This project uses Jest.',
          'Use extensionless relative imports because this is a CommonJS project.',
          'prove commit and rollback behavior',
          'Validate migrations against disposable data',
        ],
        '.agents/knowledge/INDEX.md': [
          '# Knowledge index',
          '### When a knowledge note is appropriate',
          'No feature or topic notes have been created by the generator.',
        ],
        '.agents/instructions/bootstrap.md': ['# Complete project context', 'Preserve any existing ContextRivet readiness gate'],
        '.agents/instructions/engineering.md': ['Keep controllers transport-focused', 'explicit transaction boundary'],
        '.agents/instructions/stack.md': ['# NestJS stack conventions', 'Joi-validated configuration'],
        '.agents/instructions/workflow.md': ['### Task-end knowledge checkpoint', 'Do not store secrets'],
        '.agents/instructions/code-intelligence.md': ['# Code investigation', 'targeted source searches'],
        '.agents/knowledge/decisions.md': ['# Accepted decisions', 'explicit user agreement'],
        '.agents/templates/feature.md': ['# Feature knowledge template', 'Evidence status: observed / accepted / unverified', '## Open questions'],
      };

      for (const [path, expectedContent] of Object.entries(guidance)) {
        const absolutePath = join(root, path);
        expect(existsSync(absolutePath), `${path} should be generated`).toBe(true);
        const content = readFileSync(absolutePath, 'utf8');
        for (const expected of expectedContent) expect(content).toContain(expected);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('verifies the default foundation', () => {
    verifyGeneratedApplication('foundation', ['--no-dummy-feature']);
  });

  it('verifies an ESM and Vitest foundation', () => {
    verifyGeneratedApplication('esm-foundation', ['--no-dummy-feature'], true);
  });

  it('verifies rate limiting, PostgreSQL migrations, and a generated CQRS feature', () => {
    verifyGeneratedApplication(
      'postgres',
      ['--all', '--database', 'postgres', '--dummy-feature', 'examples'],
      false,
      {
        'migration:run:prod':
          'typeorm migration:run -d dist/database/data-source',
      },
    );
  });

  it('verifies MongoDB without relational migrations', () => {
    verifyGeneratedApplication('mongodb', ['--all', '--database', 'mongodb', '--no-dummy-feature']);
  });
});
