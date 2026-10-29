import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import packageJson from '../package.json' with { type: 'json' };

const installerUrl = 'https://raw.githubusercontent.com/Shahzad-Official/nest-cqrs-schematics/main/install.sh';

export function assertSupportedNode(version = process.versions.node) {
  const [major, minor, patch] = version.split('.').map(Number);
  // Keep these minimums aligned with package.json engines.node.
  const supported = /^\d+\.\d+\.\d+$/.test(version) && (
    (major === 22 && (minor > 22 || (minor === 22 && patch >= 3)))
    || (major === 24 && minor >= 15)
    || major >= 26
  );
  if (!supported) {
    throw new Error(`Node.js v${version} is unsupported; required: ${packageJson.engines.node}. Activate Node 24 and retry: fnm exec --using=24 nest-cqrs update (or nvm use 24, then nest-cqrs update).`);
  }
}

export function runUpdate({ root, packageManager, dryRun = false }, spawn = spawnSync) {
  assertSupportedNode();
  const metadataPath = join(root, 'bin', 'installation.json');
  if (!packageManager && existsSync(metadataPath)) {
    try {
      packageManager = JSON.parse(readFileSync(metadataPath, 'utf8')).packageManager;
    } catch {
      throw new Error('Cannot read installation settings. Use update --package-manager npm or pnpm.');
    }
  }
  if (!['npm', 'pnpm'].includes(packageManager)) {
    throw new Error('Choose the installer package manager: nest-cqrs update --package-manager npm (or pnpm).');
  }
  console.log(`Updating Nest CQRS Schematics from main using ${packageManager}...`);
  if (dryRun) {
    console.log(`Would download ${installerUrl} and run the installer. No files changed.`);
    return;
  }

  const download = spawn('curl', ['-fsSL', installerUrl], {
    cwd: tmpdir(), encoding: 'utf8', shell: false, timeout: 60_000, maxBuffer: 1024 * 1024,
  });
  if (download.error) throw download.error;
  if (download.status !== 0) throw new Error(`Installer download failed (${download.signal ?? download.status}). Installation was not started.`);
  if (!download.stdout?.trim()) throw new Error('Downloaded installer is empty. Installation was not started.');

  const installation = spawn('sh', ['-s', '--', packageManager], {
    cwd: tmpdir(), input: download.stdout, stdio: ['pipe', 'inherit', 'inherit'], shell: false,
    // Use the CLI's Node for npm/pnpm even when another Node is earlier on PATH.
    env: { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}` },
  });
  if (installation.error) throw installation.error;
  if (installation.status !== 0) throw new Error(`Update failed (${installation.signal ?? installation.status}). Check the installer output before retrying.`);
  console.log('Generator updated. Existing Nest projects were not modified.');
}
