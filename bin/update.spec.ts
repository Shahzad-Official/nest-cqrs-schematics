import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { assertSupportedNode, runUpdate } from './update.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'nest-cqrs-update-'));
  mkdirSync(join(root, 'bin'));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

it.each(['npm', 'pnpm'])('updates with saved %s settings using the downloaded installer as stdin', (packageManager) => {
  writeFileSync(join(root, 'bin/installation.json'), JSON.stringify({ packageManager }));
  const script = '#!/bin/sh\nprintf "installer"\n';
  const spawn = vi.fn().mockReturnValueOnce({ status: 0, stdout: script }).mockReturnValueOnce({ status: 0 });
  runUpdate({ root }, spawn);
  expect(spawn).toHaveBeenNthCalledWith(1, 'curl', ['-fsSL', expect.stringContaining('/main/install.sh')], expect.objectContaining({ cwd: tmpdir(), encoding: 'utf8', shell: false, timeout: 60_000 }));
  expect(spawn).toHaveBeenNthCalledWith(2, 'sh', ['-s', '--', packageManager], { cwd: tmpdir(), input: script, stdio: ['pipe', 'inherit', 'inherit'], shell: false, env: { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}` } });
});

it.each(['22.22.3', '22.23.0', '24.15.0', '24.22.2', '26.0.0', '27.0.0'])('accepts supported Node %s', (version) => {
  expect(() => assertSupportedNode(version)).not.toThrow();
});

it.each(['20.20.0', '22.22.2', '23.0.0', '24.14.99', '25.2.1', '26.0.0-rc.1'])('rejects unsupported Node %s with an actionable command', (version) => {
  expect(() => assertSupportedNode(version)).toThrow('fnm exec --using=24 nest-cqrs update');
});

it.each([false, true])('rejects unsupported Node before network or installation (dry run: %s)', (dryRun) => {
  vi.spyOn(process, 'versions', 'get').mockReturnValue({ ...process.versions, node: '25.2.1' });
  const spawn = vi.fn();
  expect(() => runUpdate({ root, packageManager: 'npm', dryRun }, spawn)).toThrow('Node.js v25.2.1 is unsupported');
  expect(spawn).not.toHaveBeenCalled();
});

it('allows explicit settings to override a saved manager', () => {
  writeFileSync(join(root, 'bin/installation.json'), '{"packageManager":"npm"}');
  const spawn = vi.fn().mockReturnValue({ status: 0, stdout: 'installer' });
  runUpdate({ root, packageManager: 'pnpm' }, spawn);
  expect(spawn.mock.calls[1][1]).toEqual(['-s', '--', 'pnpm']);
});

it('previews without running commands or accessing the network', () => {
  const spawn = vi.fn();
  runUpdate({ root, packageManager: 'npm', dryRun: true }, spawn);
  expect(spawn).not.toHaveBeenCalled();
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No files changed.'));
});

it('requires an explicit supported manager when settings are missing or invalid', () => {
  const spawn = vi.fn();
  expect(() => runUpdate({ root }, spawn)).toThrow('Choose the installer package manager');
  expect(() => runUpdate({ root, packageManager: 'yarn' }, spawn)).toThrow('Choose');
  writeFileSync(join(root, 'bin/installation.json'), '{"packageManager":"yarn"}');
  expect(() => runUpdate({ root }, spawn)).toThrow('Choose');
  writeFileSync(join(root, 'bin/installation.json'), 'invalid json');
  expect(() => runUpdate({ root }, spawn)).toThrow('Cannot read installation settings');
  expect(spawn).not.toHaveBeenCalled();
});

it.each([
  { status: 22, stdout: 'partial installer' },
  { status: null, signal: 'SIGTERM', stdout: 'partial installer' },
  { status: 0, stdout: '  \n' },
  { error: new Error('curl unavailable') },
])('does not execute a failed, partial or empty download (%j)', (download) => {
  const spawn = vi.fn().mockReturnValue(download);
  expect(() => runUpdate({ root, packageManager: 'npm' }, spawn)).toThrow();
  expect(spawn).toHaveBeenCalledTimes(1);
  expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Generator updated.'));
});

it.each([{ status: 1 }, { status: null, signal: 'SIGTERM' }, { error: new Error('shell unavailable') }])('propagates installer failures (%j)', (result) => {
  const spawn = vi.fn().mockReturnValueOnce({ status: 0, stdout: 'installer' }).mockReturnValueOnce(result);
  expect(() => runUpdate({ root, packageManager: 'pnpm' }, spawn)).toThrow();
  expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Generator updated.'));
});
