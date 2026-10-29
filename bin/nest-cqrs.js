#!/usr/bin/env node

import { NodeWorkflow } from '@angular-devkit/schematics/tools/index.js';
import { strings } from '@angular-devkit/core';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { addPresets, detectPackageManager, initialize } from '../init/index.js';
import { databaseTypes, presetNames } from '../init/presets.js';
import { runUpdate } from './update.js';
import packageJson from '../package.json' with { type: 'json' };

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const collectionPath = resolve(packageRoot, 'collection.json');
const generatorAliases = {
  command: 'command', cmd: 'command', c: 'command',
  query: 'query', q: 'query',
  entity: 'entity', e: 'entity',
};
const colorEnabled = Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
const color = (code, value) => colorEnabled ? `\u001b[${code}m${value}\u001b[0m` : value;
const cyan = (value) => color('36', value);
const green = (value) => color('32', value);
const yellow = (value) => color('33', value);
const dim = (value) => color('2', value);

function printTable(headers, rows) {
  const widths = headers.map((header, column) => Math.max(
    header.length,
    ...rows.map((row) => String(row[column]).length),
  ));
  const border = (left, middle, right) => `${left}${widths.map((width) => '─'.repeat(width + 2)).join(middle)}${right}`;
  const row = (values, paint = (value) => value) => `│ ${values.map((value, column) => paint(String(value), column).padEnd(widths[column] + (paint(String(value), column).length - String(value).length))).join(' │ ')} │`;
  console.log(dim(border('┌', '┬', '┐')));
  console.log(row(headers, (value) => yellow(value)));
  console.log(dim(border('├', '┼', '┤')));
  for (const values of rows) {
    console.log(row(values, (value, column) => {
      if (column === 0) return green(value);
      if (column === 1) return cyan(value);
      return value;
    }));
  }
  console.log(dim(border('└', '┴', '┘')));
}

function printExamples(examples) {
  console.log(dim('Examples:'));
  for (const example of examples) {
    console.log(`  ${dim('$')} ${green('nest-cqrs')} ${example}`);
  }
}

function printHelp() {
  console.log(`${green('nest-cqrs')} ${dim(`v${packageJson.version}`)} — NestJS CQRS application generator\n`);
  console.log(`${yellow('Usage:')} nest-cqrs <command> [options]\n`);
  console.log(yellow('Commands:'));
  printTable(
    ['command', 'alias', 'description'],
    [
      ['init [options]', 'i', 'Initialize the CQRS application foundation.'],
      ['add <preset> [options]', 'a', 'Add database, migrations, or rate limiting.'],
      ['generate <type> <path/name>', 'g', 'Generate a CQRS artifact.'],
      ['resource <name> [options]', 'r', 'Generate a complete CQRS or Nest resource.'],
      ['update [options]', '', 'Update the installed generator from GitHub main.'],
      ['help', '', 'Display usage information.'],
    ],
  );
  printExamples([
    'i --database postgres --migrations',
    'a rate-limit',
    'r products -s cqrs -c',
  ]);
  console.log(`\n${yellow('Generators:')}`);
  printTable(
    ['name', 'aliases', 'description'],
    [
      ['command', 'cmd, c', 'Generate a CQRS command and handler.'],
      ['query', 'q', 'Generate a CQRS query and handler.'],
      ['entity', 'e', 'Generate a database-aware entity.'],
    ],
  );
  printExamples([
    'g c features/products/create-product',
    'g q features/products/list-products',
    'g e features/products/product -F "name:string,price:decimal"',
  ]);
  console.log(`\n${yellow('Options:')}`);
  printTable(
    ['option', 'alias', 'description'],
    [
      ['--structure <standard|cqrs>', '-s', 'Select the resource structure.'],
      ['--feature <name>', '-f', 'Use an existing feature as the destination.'],
      ['--fields <definitions>', '-F', 'Add optional entity fields.'],
      ['--database <type>', '-b', 'Select or override the database type.'],
      ['--crud / --no-crud', '-c', 'Enable or disable CRUD endpoints.'],
      ['--dry-run', '-d', 'Preview changes without writing files.'],
      ['--migrations / --no-migrations', '-m', 'Enable or disable SQL migrations.'],
      ['--resume', '-r', 'Resume an incomplete initialization.'],
      ['--all', '-a', 'Enable all compatible optional presets.'],
      ['--yes', '-y', 'Accept defaults and skip confirmations.'],
      ['--skip-install', '-k', 'Generate files without installing packages.'],
      ['--package-manager <npm|pnpm>', '', 'Select the package manager for update.'],
      ['--help', '-h', 'Display usage information.'],
      ['--version', '-v', 'Display the installed version.'],
    ],
  );
  printExamples([
    'g e product -b mongodb -d',
    'init --all -b postgres -y',
  ]);
  console.log(`\n${dim('A feature name without a command remains supported: nest-cqrs orders')}`);
}

function parseArgs(argv) {
  const result = {
    name: undefined,
    structure: undefined,
    crud: undefined,
    dryRun: false,
    resume: false,
    dummyFeature: undefined,
    skipDummyFeature: false,
    skipInstall: false,
    all: false,
    yes: false,
    selectedPresets: [],
    databaseType: undefined,
    migrations: undefined,
    feature: undefined,
    generator: undefined,
    fields: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') result.help = true;
    else if (argument === '--version' || argument === '-v') result.version = true;
    else if (argument === '--dry-run' || argument === '-d') result.dryRun = true;
    else if (argument === '--resume' || argument === '-r') result.resume = true;
    else if (argument === '--no-dummy-feature') result.skipDummyFeature = true;
    else if (argument === '--skip-install' || argument === '-k') result.skipInstall = true;
    else if (argument.startsWith('--package-manager=')) result.packageManager = argument.slice('--package-manager='.length);
    else if (argument === '--package-manager') {
      result.packageManager = argv[++index];
      if (!result.packageManager) throw new Error('--package-manager requires npm or pnpm.');
    }
    else if (argument === '--all' || argument === '-a') result.all = true;
    else if (argument === '--yes' || argument === '-y') result.yes = true;
    else if (argument.startsWith('--dummy-feature=')) result.dummyFeature = argument.slice('--dummy-feature='.length);
    else if (argument === '--dummy-feature') result.dummyFeature = argv[++index];
    else if (argument === '--crud' || argument === '-c') result.crud = true;
    else if (argument === '--no-crud') result.crud = false;
    else if (argument === '--migrations' || argument === '-m') result.migrations = true;
    else if (argument === '--no-migrations') result.migrations = false;
    else if (argument.startsWith('--database=')) result.databaseType = argument.slice('--database='.length);
    else if (argument === '--database' || argument === '-b') result.databaseType = argv[++index];
    else if (argument.startsWith('--fields=')) result.fields = argument.slice('--fields='.length);
    else if (argument === '--fields' || argument === '-F') result.fields = argv[++index];
    else if (argument.startsWith('--structure=')) {
      result.structure = argument.slice('--structure='.length);
    } else if (argument === '--structure' || argument === '-s') result.structure = argv[++index];
    else if (argument.startsWith('--feature=')) result.feature = argument.slice('--feature='.length);
    else if (argument === '--feature' || argument === '-f') result.feature = argv[++index];
    else if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`);
    else if (!result.name) result.name = argument;
    else if (['generate', 'g'].includes(result.name) && !result.generator) result.generator = argument;
    else if (['generate', 'g'].includes(result.name) && !result.requestName) result.requestName = argument;
    else if (['add', 'a'].includes(result.name) && !result.preset) result.preset = argument;
    else if (['resource', 'r'].includes(result.name) && !result.resourceName) result.resourceName = argument;
    else throw new Error(`Unexpected argument: ${argument}`);
  }
  if (result.packageManager !== undefined && !['npm', 'pnpm'].includes(result.packageManager)) {
    throw new Error('--package-manager requires npm or pnpm.');
  }
  if (result.name === 'update' && argv.some((argument) => argument.startsWith('-')
    && !['--dry-run', '-d', '--package-manager', '--help', '-h', '--version', '-v'].includes(argument)
    && !argument.startsWith('--package-manager='))) {
    throw new Error('update supports only --package-manager npm|pnpm, --dry-run, --help and --version.');
  }
  return result;
}

async function askInitOptions(options) {
  if (options.all) {
    if (!options.databaseType) {
      throw new Error('--all requires an explicit database choice: --database postgres|mysql|mongodb.');
    }
    options.migrations ??= options.databaseType !== 'mongodb';
    validateDatabaseOptions(options);
    options.selectedPresets = presetNames.filter((name) =>
      name !== 'migrations' || (options.databaseType !== 'mongodb' && options.migrations !== false),
    );
    options.dummyFeature ||= 'users';
    return;
  }
  if (options.resume) return;
  if (options.databaseType) options.selectedPresets.push('database');
  if (options.migrations === true && !options.databaseType) {
    throw new Error('--migrations requires a database selection.');
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const askYes = async (question) => {
      const answer = (await prompt.question(`${question} [Y/n]: `)).trim().toLowerCase();
      return answer !== 'n' && answer !== 'no';
    };
    if (!options.yes) {
      if (!options.databaseType && await askYes('Configure a database with TypeORM?')) {
        const answer = (await prompt.question('Database (1 = PostgreSQL, 2 = MySQL, 3 = MongoDB) [1]: ')).trim().toLowerCase();
        options.databaseType = answer === '2' || answer === 'mysql' ? 'mysql' : answer === '3' || answer === 'mongodb' ? 'mongodb' : 'postgres';
        options.selectedPresets.push('database');
      }
      if (options.databaseType && options.databaseType !== 'mongodb' && options.migrations === undefined) {
        options.migrations = await askYes('Set up TypeScript migration scripts?');
      }
      if (options.migrations && !options.selectedPresets.includes('migrations')) options.selectedPresets.push('migrations');
      if (await askYes('Configure rate limiting?')) options.selectedPresets.push('rate-limit');
    }
    if (options.databaseType && !options.selectedPresets.includes('database')) options.selectedPresets.push('database');
    options.migrations ??= false;
    if (options.migrations && !options.selectedPresets.includes('migrations')) options.selectedPresets.push('migrations');
    validateDatabaseOptions(options);
    if (options.dummyFeature || options.skipDummyFeature || options.yes) return;
    if (await askYes('Generate a dummy CQRS feature?')) {
      options.dummyFeature = (await prompt.question('Feature name [users]: ')).trim() || 'users';
    }
  } finally {
    prompt.close();
  }
}

function validateDatabaseOptions(options) {
  if (options.databaseType && !databaseTypes.includes(options.databaseType)) {
    throw new Error(`Database must be one of: ${databaseTypes.join(', ')}.`);
  }
  if (options.migrations && options.databaseType === 'mongodb') {
    throw new Error('MongoDB does not use the generated TypeORM SQL migration scaffold.');
  }
}

async function askAddOptions(options) {
  if (['postgres', 'mysql', 'mongodb'].includes(options.preset)) {
    options.databaseType ||= options.preset;
    options.preset = 'database';
  }
  if (options.preset !== 'database') return;
  if (!options.databaseType && options.yes) {
    throw new Error('Select a database with --database postgres|mysql|mongodb.');
  }
  if (!options.yes) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (!options.databaseType) {
        const answer = (await prompt.question('Database (1 = PostgreSQL, 2 = MySQL, 3 = MongoDB) [1]: ')).trim().toLowerCase();
        options.databaseType = answer === '2' || answer === 'mysql' ? 'mysql' : answer === '3' || answer === 'mongodb' ? 'mongodb' : 'postgres';
      }
      if (options.databaseType !== 'mongodb' && options.migrations === undefined) {
        const answer = (await prompt.question('Set up TypeScript migration scripts? [y/N]: ')).trim().toLowerCase();
        options.migrations = answer === 'y' || answer === 'yes';
      }
    } finally {
      prompt.close();
    }
  }
  options.migrations ??= false;
  validateDatabaseOptions(options);
}

async function askMissing(options) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    options.name ||= (await prompt.question('Feature name: ')).trim();
    if (!options.structure) {
      const answer = (
        await prompt.question(
          'Structure (1 = Standard Nest CRUD, 2 = CQRS) [2]: ',
        )
      )
        .trim()
        .toLowerCase();
      options.structure = answer === '1' || answer === 'standard' ? 'standard' : 'cqrs';
    }
    if (options.crud === undefined) {
      const answer = (await prompt.question('Generate CRUD endpoints? [Y/n]: '))
        .trim()
        .toLowerCase();
      options.crud = answer !== 'n' && answer !== 'no';
    }
  } finally {
    prompt.close();
  }
}

function assertNestProject() {
  if (!existsSync(resolve('nest-cli.json')) || !existsSync(resolve('package.json'))) {
    throw new Error(
      'Run nest-cqrs from the root of a Nest project (nest-cli.json and package.json are required).',
    );
  }
  const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  if (!dependencies['@nestjs/core']) {
    throw new Error(
      'The current directory is not a supported Nest project: @nestjs/core is missing.',
    );
  }
}

function runStandard(options, spawn = spawnSync) {
  const packageManager = detectPackageManager(process.cwd());
  const args = [
    'exec',
    ...(packageManager === 'npm' ? ['--'] : []),
    'nest',
    'generate',
    'resource',
    options.name,
    `--crud=${options.crud}`,
    '--no-spec',
  ];
  if (options.dryRun) args.push('--dry-run');
  const result = spawn(packageManager, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Nest resource generator exited with status ${result.status}.`);
  }
}

async function runCqrs(options) {
  const target = resolve('src', 'features', strings.dasherize(options.name));
  if (existsSync(target)) {
    throw new Error(`Refusing to overwrite existing feature directory: ${target}`);
  }
  const workflow = new NodeWorkflow(process.cwd(), {
    dryRun: options.dryRun,
    force: false,
    resolvePaths: [packageRoot],
    schemaValidation: true,
  });

  workflow.reporter.subscribe((event) => {
    const label = event.kind === 'create' ? 'CREATE' : event.kind.toUpperCase();
    console.log(`${label} ${event.path}`);
  });

  await new Promise((resolveExecution, rejectExecution) => {
    workflow
      .execute({
        collection: collectionPath,
        schematic: 'cqrs-resource',
        options: {
          name: options.name,
          crud: options.crud,
          spec: false,
        },
      })
      .subscribe({ complete: resolveExecution, error: rejectExecution });
  });

  if (options.dryRun) console.log('Dry run enabled. No files written.');
}

async function runRequest(options) {
  options.generator = generatorAliases[options.generator];
  if (!options.generator) {
    throw new Error('Generator must be "command", "query", or "entity".');
  }
  if (!options.requestName) throw new Error(`${options.generator} name is required.`);

  const workflow = new NodeWorkflow(process.cwd(), {
    dryRun: options.dryRun,
    force: false,
    resolvePaths: [packageRoot],
    schemaValidation: true,
  });
  workflow.reporter.subscribe((event) => {
    const label = event.kind === 'create' ? 'CREATE' : event.kind.toUpperCase();
    console.log(`${label} ${event.path}`);
  });
  await new Promise((resolveExecution, rejectExecution) => {
    workflow.execute({
      collection: collectionPath,
      schematic: options.generator,
      options: {
        name: options.requestName,
        feature: options.feature,
        fields: options.fields,
        database: options.databaseType,
      },
    }).subscribe({ complete: resolveExecution, error: rejectExecution });
  });
  if (options.dryRun) console.log('Dry run enabled. No files written.');
}

async function runInit(options) {
  await askInitOptions(options);
  assertNestProject();
  const result = await initialize({
    root: process.cwd(),
    packageVersion: packageJson.version,
    dryRun: options.dryRun,
    resume: options.resume,
    skipInstall: options.skipInstall,
    dummyFeature: options.dummyFeature,
    selectedPresets: options.selectedPresets,
    databaseOptions: { type: options.databaseType, migrations: options.migrations },
    runFeature: (name) => runCqrs({ name, crud: true, dryRun: false }),
  });
  for (const operation of result.operations) console.log(operation);
  if (options.dryRun) console.log('Dry run enabled. No files written.');
  else console.log('Nest CQRS foundation initialized successfully.');
}

async function runAdd(options) {
  assertNestProject();
  await askAddOptions(options);
  if (!options.preset) throw new Error(`Preset is required. Available: ${presetNames.join(', ')}`);
  const result = await addPresets({
    root: process.cwd(),
    names: options.preset === 'database' && options.migrations ? ['database', 'migrations'] : [options.preset],
    dryRun: options.dryRun,
    skipInstall: options.skipInstall,
    databaseOptions: { type: options.databaseType, migrations: options.migrations || options.preset === 'migrations' },
  });
  for (const operation of result.operations) console.log(operation);
  if (options.dryRun) console.log('Dry run enabled. No files written.');
  else console.log(`Preset installed: ${options.preset}`);
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.version) return console.log(packageJson.version);
    if (options.help || options.name === 'help') return printHelp();
    if (options.name === 'update') return runUpdate({ root: packageRoot, packageManager: options.packageManager, dryRun: options.dryRun });
    if (['init', 'i'].includes(options.name)) return await runInit(options);
    if (['add', 'a'].includes(options.name)) return await runAdd(options);
    if (['generate', 'g'].includes(options.name)) {
      assertNestProject();
      return await runRequest(options);
    }
    if (['resource', 'r'].includes(options.name)) options.name = options.resourceName;
    await askMissing(options);
    if (!options.name) throw new Error('Feature name is required.');
    if (!['standard', 'cqrs'].includes(options.structure)) {
      throw new Error('Structure must be either "standard" or "cqrs".');
    }
    assertNestProject();
    if (options.structure === 'standard') runStandard(options);
    else await runCqrs(options);
  } catch (error) {
    console.error(
      `nest-cqrs: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

export { generatorAliases, parseArgs, printHelp, runStandard };

function isExecutableEntry() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}

if (isExecutableEntry()) {
  await main();
}
