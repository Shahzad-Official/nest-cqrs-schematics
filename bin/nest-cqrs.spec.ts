import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generatorAliases, parseArgs, printHelp, runStandard } from './nest-cqrs.js';

describe('nest-cqrs CLI', () => {
  it('prints structured help and its version', () => {
    const output: string[] = [];
    const log = console.log;
    console.log = (value = '') => output.push(String(value));
    try {
      printHelp();
    } finally {
      console.log = log;
    }
    const help = output.join('\n');

    expect(help).toContain('Commands:');
    expect(help).toContain('Generators:');
    expect(help).toContain('generate <type> <path/name>');
    expect(help).toContain('update [options]');
    expect(help).toContain('--package-manager <npm|pnpm>');
    expect(help).toContain('cmd, c');
    expect(help).toContain('g c features/products/create-product');
    expect(help).toContain('g e product -b mongodb -d');
  });

  it('accepts generator and option aliases', () => {
    const options = parseArgs([
      'g', 'e', 'catalog/product', '-b', 'postgres', '-F', 'name:string', '-d',
    ]);

    expect(options).toMatchObject({
      name: 'g',
      generator: 'e',
      requestName: 'catalog/product',
      databaseType: 'postgres',
      fields: 'name:string',
      dryRun: true,
    });
    expect(generatorAliases.e).toBe('entity');
    expect(generatorAliases.q).toBe('query');
    expect(generatorAliases.c).toBe('command');
  });

  it('parses update options and rejects invalid managers or unrelated options', () => {
    expect(parseArgs(['update', '--package-manager', 'pnpm', '--dry-run'])).toMatchObject({ name: 'update', packageManager: 'pnpm', dryRun: true });
    expect(parseArgs(['update', '--package-manager=npm'])).toMatchObject({ packageManager: 'npm' });
    for (const args of [['--package-manager'], ['--package-manager='], ['--package-manager', 'yarn'], ['--skip-install'], ['--all']]) {
      expect(() => parseArgs(['update', ...args])).toThrow();
    }
  });

  describe('standard resources', () => {
    let root: string;

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'nest-cqrs-cli-'));
      vi.spyOn(process, 'cwd').mockReturnValue(root);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      rmSync(root, { recursive: true, force: true });
    });

    it.each([
      ['npm', 'package-lock.json'],
      ['pnpm', 'pnpm-lock.yaml'],
      ['yarn', 'yarn.lock'],
      ['npm', undefined],
    ])('uses %s for a project with %s', (packageManager, lockfile) => {
      if (lockfile) writeFileSync(join(root, lockfile), '');
      const spawn = vi.fn(() => ({ status: 0 }));

      runStandard({ name: 'orders', crud: true, dryRun: true }, spawn);

      expect(spawn).toHaveBeenCalledWith(packageManager, [
        'exec',
        ...(packageManager === 'npm' ? ['--'] : []),
        'nest', 'generate', 'resource', 'orders', '--crud=true', '--no-spec', '--dry-run',
      ], { cwd: root, stdio: 'inherit', shell: false });
    });

    it('preserves spawn and generator failures', () => {
      const options = { name: 'orders', crud: false };
      const error = new Error('package manager unavailable');
      expect(() => runStandard(options, () => ({ error }))).toThrow(error);
      expect(() => runStandard(options, () => ({ status: 1 })))
        .toThrow('Nest resource generator exited with status 1.');
    });
  });
});
