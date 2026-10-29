import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = dirname(fileURLToPath(import.meta.url));
let root: string;
let checkout: string;
let bin: string;
let log: string;
let archive: string;
let data: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'nest-cqrs-installer-'));
  checkout = join(root, 'generator checkout');
  bin = join(root, 'bin');
  log = join(root, 'commands.log');
  archive = join(root, 'download.tar.gz');
  data = join(root, 'user application data');
  mkdirSync(checkout);
  mkdirSync(bin);
  copyFileSync(join(repositoryRoot, 'install.sh'), join(checkout, 'install.sh'));
  copyFileSync(join(repositoryRoot, 'package.json'), join(checkout, 'package.json'));
  writeFileSync(log, '');
  writeFileSync(join(bin, 'node'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const manager = `#!/bin/sh
printf '%s|%s|%s|CI=%s\\n' "$0" "$PWD" "$*" "\${CI:-}" >> "$INSTALLER_TEST_LOG"
case "$*" in
  --version) printf '%s\\n' "\${INSTALLER_TEST_PNPM_VERSION:-11.1.3}" ;;
  'bin --global')
    if [ "\${INSTALLER_TEST_GLOBAL_FAILURE:-0}" = 1 ]; then exit 1; fi
    printf '%s\\n' "$INSTALLER_TEST_BIN"
    ;;
  'prefix --global') printf '%s\\n' "$INSTALLER_TEST_PREFIX" ;;
  'ci --engine-strict'|'install --frozen-lockfile --config.engine-strict=true')
    exit "\${INSTALLER_TEST_INSTALL_STATUS:-0}"
    ;;
  'link'|'link --global'|'add --global .') exit "\${INSTALLER_TEST_LINK_STATUS:-0}" ;;
  *) exit 99 ;;
esac
`;
  for (const name of ['npm', 'pnpm']) writeFileSync(join(bin, name), manager, { mode: 0o755 });
  writeFileSync(join(bin, 'curl'), `#!/bin/sh
if [ "\${INSTALLER_TEST_DOWNLOAD_STATUS:-0}" != 0 ]; then exit "$INSTALLER_TEST_DOWNLOAD_STATUS"; fi
if [ "$1" != '-fsSL' ] || [ "$2" != 'https://github.com/Shahzad-Official/nest-cqrs-schematics/archive/refs/heads/main.tar.gz' ] || [ "$3" != '-o' ]; then exit 99; fi
cp "$INSTALLER_TEST_ARCHIVE" "$4"
`, { mode: 0o755 });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function install(args: string[] = [], env: Record<string, string> = {}, remote = false) {
  return spawnSync('/bin/sh', remote ? ['-s', '--', ...args] : [join(checkout, 'install.sh'), ...args], {
    cwd: root,
    encoding: 'utf8',
    input: remote ? readFileSync(join(repositoryRoot, 'install.sh'), 'utf8') : undefined,
    env: {
      ...process.env,
      PATH: `${bin}:/usr/bin:/bin`,
      INSTALLER_TEST_LOG: log,
      INSTALLER_TEST_BIN: bin,
      INSTALLER_TEST_PREFIX: root,
      INSTALLER_TEST_ARCHIVE: archive,
      XDG_DATA_HOME: data,
      ...env,
    },
  });
}

function commands() {
  return readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
}

describe('checkout installer', () => {
  it('defaults to npm and installs from its own directory, including paths with spaces', () => {
    const result = install();
    expect(result.status).toBe(0);
    expect(commands()).toEqual([
      `${bin}/npm|${checkout}|ci --engine-strict|CI=${process.env.CI ?? ''}`,
      `${bin}/npm|${checkout}|link|CI=${process.env.CI ?? ''}`,
      `${bin}/npm|${checkout}|prefix --global|CI=${process.env.CI ?? ''}`,
    ]);
    expect(result.stdout).toContain('Installation complete.');
    expect(result.stdout).toContain('Verify manually: nest-cqrs --help');
  });

  it.each([
    ['10.30.0', 'link --global'],
    ['11.1.3', 'add --global .'],
    ['12.0.0', 'add --global .'],
  ])('uses the matching global registration command with pnpm %s', (version, registration) => {
    const result = install(['pnpm'], { INSTALLER_TEST_PNPM_VERSION: version });
    expect(result.status).toBe(0);
    expect(commands()).toContain(`${bin}/pnpm|${checkout}|install --frozen-lockfile --config.engine-strict=true|CI=true`);
    expect(commands()).toContain(`${bin}/pnpm|${checkout}|${registration}|CI=${process.env.CI ?? ''}`);
    expect(commands().some(command => command.startsWith(`${bin}/npm|`))).toBe(false);
  });

  it.each(['npm', 'pnpm'])('stops before global registration when %s installation fails', manager => {
    const result = install([manager], { INSTALLER_TEST_INSTALL_STATUS: '23' });
    expect(result.status).toBe(23);
    expect(commands().some(command => /\|(link|link --global|add --global \.)\|/.test(command))).toBe(false);
    expect(result.stdout).not.toContain('Installation complete.');
  });

  it('does not report success when global registration fails', () => {
    const result = install([], { INSTALLER_TEST_LINK_STATUS: '17' });
    expect(result.status).toBe(17);
    expect(result.stdout).not.toContain('Installation complete.');
  });

  it('explains pnpm global setup before installing dependencies if its bin directory is unavailable', () => {
    const result = install(['pnpm'], { INSTALLER_TEST_GLOBAL_FAILURE: '1' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Run pnpm setup');
    expect(commands()).toHaveLength(2);
  });

  it.each(['9.15.0', 'invalid'])('rejects unsupported or invalid pnpm version %s', version => {
    const result = install(['pnpm'], { INSTALLER_TEST_PNPM_VERSION: version });
    expect(result.status).toBe(1);
    expect(commands()).toHaveLength(1);
  });

  it('reports missing prerequisites without running installation commands', () => {
    rmSync(join(bin, 'npm'));
    const result = install([], { PATH: bin });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Required command is not installed: npm');
    expect(commands()).toEqual([]);
  });

  it('shows help and rejects invalid arguments without installing anything', () => {
    expect(install(['--help']).status).toBe(0);
    expect(install(['yarn']).status).toBe(1);
    expect(install(['npm', 'unexpected']).status).toBe(1);
    expect(commands()).toEqual([]);
  });

  it('reports a global bin directory that must be added to PATH', () => {
    const prefix = resolve(root, 'different-prefix');
    const result = install([], { INSTALLER_TEST_PREFIX: prefix });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Add this global command directory to PATH: ${prefix}/bin`);
  });
});

function prepareArchive() {
  const result = spawnSync('/usr/bin/tar', ['-czf', archive, '-C', root, basename(checkout)], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
}

function downloadedCopies() {
  const path = join(data, 'nest-cqrs-schematics');
  return readdirSync(path).filter(name => name.startsWith('install.')).map(name => join(path, name));
}

describe('downloaded installer', () => {
  it.each(['npm', 'pnpm'])('downloads and installs with %s without touching the current Nest project', manager => {
    prepareArchive();
    const existing = '{"name":"my-existing-api"}\n';
    writeFileSync(join(root, 'package.json'), existing);
    writeFileSync(join(root, 'AGENTS.md'), 'Keep my project rules.\n');

    const result = install([manager], {}, true);

    expect(result.status, result.stderr).toBe(0);
    const copies = downloadedCopies();
    expect(copies).toHaveLength(1);
    const source = join(copies[0], 'source');
    expect(readFileSync(join(source, 'package.json'), 'utf8')).toBe(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'));
    expect(commands().every(command => command.split('|')[1] === source)).toBe(true);
    expect(result.stdout).toContain(`Installed files: ${source}`);
    expect(result.stdout).toContain('Installation complete.');
    expect(result.stdout).not.toContain('ci --engine-strict');
    expect(result.stdout).not.toContain('clone');
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe(existing);
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe('Keep my project rules.\n');
    expect(readFileSync(join(copies[0], 'install.log'), 'utf8')).toContain('Registering nest-cqrs globally');
  });

  it('cleans up a failed download without attempting dependency installation', () => {
    const result = install([], { INSTALLER_TEST_DOWNLOAD_STATUS: '22' }, true);
    expect(result.status).toBe(22);
    expect(downloadedCopies()).toEqual([]);
    expect(commands()).toEqual([]);
    expect(result.stdout).not.toContain('Installation complete.');
  });

  it('rejects an invalid archive and cleans up only its own download directory', () => {
    writeFileSync(archive, 'not a gzip archive');
    const result = install([], {}, true);
    expect(result.status).not.toBe(0);
    expect(downloadedCopies()).toEqual([]);
    expect(commands()).toEqual([]);
  });

  it('rejects an archive missing the expected installer before executing package commands', () => {
    rmSync(join(checkout, 'install.sh'));
    prepareArchive();
    const result = install([], {}, true);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Downloaded archive does not contain the expected installer and package.json');
    expect(downloadedCopies()).toEqual([]);
    expect(commands()).toEqual([]);
  });

  it('surfaces installation errors and retains source and logs for diagnosis or partial global links', () => {
    prepareArchive();
    const result = install([], { INSTALLER_TEST_INSTALL_STATUS: '23' }, true);
    expect(result.status).toBe(23);
    expect(result.stderr).toContain('Installation failed. Files and log retained at:');
    expect(result.stdout).not.toContain('Installation complete.');
    const copies = downloadedCopies();
    expect(copies).toHaveLength(1);
    expect(readFileSync(join(copies[0], 'source', 'install.sh'), 'utf8')).toContain('npm ci --engine-strict');
    expect(readFileSync(join(copies[0], 'install.log'), 'utf8')).toContain('Installing dependencies with npm');
    expect(commands()).toHaveLength(1);
  });

  it('keeps previous copies and user files when installing again', () => {
    prepareArchive();
    mkdirSync(join(data, 'nest-cqrs-schematics'), { recursive: true });
    const note = join(data, 'nest-cqrs-schematics', 'user-note.txt');
    writeFileSync(note, 'Keep this existing file.');
    expect(install([], {}, true).status).toBe(0);
    const first = downloadedCopies()[0];
    expect(install([], {}, true).status).toBe(0);
    expect(downloadedCopies()).toHaveLength(2);
    expect(readFileSync(note, 'utf8')).toBe('Keep this existing file.');
    expect(readFileSync(join(first, 'source', 'package.json'), 'utf8')).toContain('@retail-pos/schematics');
  });
});
