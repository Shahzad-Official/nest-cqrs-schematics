import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = resolve(repositoryRoot, 'bin/nest-cqrs.js');

function createNestProject(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `nest-cqrs-${name}-`));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({
    name: `acceptance-${name}`,
    version: '0.0.0',
    private: true,
    scripts: {},
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
      '@types/node': '^24.0.0',
      'source-map-support': '^0.5.21',
      'ts-loader': '^9.5.0',
      'ts-node': '^10.9.0',
      'tsconfig-paths': '^4.2.0',
      typescript: '^6.0.0',
    },
  }, null, 2)}\n`);
  writeFileSync(join(root, 'nest-cli.json'), `${JSON.stringify({ collection: '@nestjs/schematics', sourceRoot: 'src' }, null, 2)}\n`);
  writeFileSync(join(root, 'pnpm-workspace.yaml'), "allowBuilds:\n  '@scarf/scarf': true\n");
  writeFileSync(join(root, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: {
      declaration: true,
      emitDecoratorMetadata: true,
      experimentalDecorators: true,
      removeComments: true,
      sourceMap: true,
      outDir: './dist',
      baseUrl: './',
      incremental: true,
      skipLibCheck: true,
      strictNullChecks: true,
      noImplicitAny: false,
      strictBindCallApply: false,
      forceConsistentCasingInFileNames: false,
      noFallthroughCasesInSwitch: false,
    },
  }, null, 2)}\n`);
  writeFileSync(join(root, 'tsconfig.build.json'), `${JSON.stringify({ extends: './tsconfig.json', exclude: ['node_modules', 'test', 'dist', '**/*spec.ts'] }, null, 2)}\n`);
  writeFileSync(join(root, 'src/main.ts'), 'export {};\n');
  writeFileSync(join(root, 'src/app.module.ts'), 'export {};\n');
  writeFileSync(join(root, '.gitignore'), '# Nest defaults\n/dist\n/node_modules\n\n# project rule\n.local-cache/\n');
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

function verifyGeneratedApplication(name: string, initArgs: string[]): void {
  const root = createNestProject(name);
  try {
    run(root, process.execPath, [cli, 'init', '--skip-install', '--yes', ...initArgs]);
    run(root, 'pnpm', ['install', '--lockfile-only']);
    run(root, 'pnpm', ['install', '--frozen-lockfile']);
    run(root, 'pnpm', ['format']);
    run(root, 'pnpm', ['exec', 'prettier', '--check', '.', '--ignore-unknown']);
    for (const script of ['build', 'lint', 'test', 'test:e2e']) {
      run(root, 'pnpm', [script]);
    }
    expect(readFileSync(join(root, '.nest-cqrs.json'), 'utf8')).toContain('"status": "complete"');
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toBe(
      '# Nest defaults\n/dist\n/node_modules\n\n# project rule\n.local-cache/\n\n.env\n.env.development\n.env.staging\n.env.production\n.nest-cqrs.pending.json\n',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('generated application acceptance', () => {
  it('verifies the default foundation', () => {
    verifyGeneratedApplication('foundation', ['--no-dummy-feature']);
  });

  it('verifies rate limiting, PostgreSQL migrations, and a generated CQRS feature', () => {
    verifyGeneratedApplication('postgres', ['--all', '--database', 'postgres', '--dummy-feature', 'examples']);
  });

  it('verifies MongoDB without relational migrations', () => {
    verifyGeneratedApplication('mongodb', ['--all', '--database', 'mongodb', '--no-dummy-feature']);
  });
});
