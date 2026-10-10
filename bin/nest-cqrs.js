#!/usr/bin/env node

import { NodeWorkflow } from '@angular-devkit/schematics/tools/index.js';
import { strings } from '@angular-devkit/core';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { addPresets, initialize } from '../init/index.js';
import { databaseTypes, presetNames } from '../init/presets.js';
import packageJson from '../package.json' with { type: 'json' };

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const collectionPath = resolve(packageRoot, 'collection.json');

function printHelp() {
  console.log(`Usage:
  nest-cqrs <feature-name> [options]
  nest-cqrs init [options]
  nest-cqrs add <database|migrations|postgres|mysql|mongodb|rate-limit> [options]

Generate a resource, or initialize the preferred Nest application foundation.

Options:
  --structure <standard|cqrs>  Skip the structure prompt
  --crud / --no-crud          Enable or disable CRUD endpoints
  --dry-run                   Preview without writing files
  --dummy-feature <name>      With init, generate a CQRS feature after setup
  --no-dummy-feature          With init, skip the optional feature
  --database <type>           Select postgres, mysql, or mongodb
  --migrations / --no-migrations  Enable/disable SQL migration scripts
  --resume                    Resume an incomplete init
  -a, --all                   Enable all optional selections (requires --database)
  -y, --yes                   Skip confirmation prompts
  -h, --help                  Show this help`);
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
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') result.help = true;
    else if (argument === '--dry-run') result.dryRun = true;
    else if (argument === '--resume') result.resume = true;
    else if (argument === '--no-dummy-feature') result.skipDummyFeature = true;
    else if (argument === '--skip-install') result.skipInstall = true;
    else if (argument === '--all' || argument === '-a') result.all = true;
    else if (argument === '--yes' || argument === '-y') result.yes = true;
    else if (argument.startsWith('--dummy-feature=')) result.dummyFeature = argument.slice('--dummy-feature='.length);
    else if (argument === '--dummy-feature') result.dummyFeature = argv[++index];
    else if (argument === '--crud') result.crud = true;
    else if (argument === '--no-crud') result.crud = false;
    else if (argument === '--migrations') result.migrations = true;
    else if (argument === '--no-migrations') result.migrations = false;
    else if (argument.startsWith('--database=')) result.databaseType = argument.slice('--database='.length);
    else if (argument === '--database') result.databaseType = argv[++index];
    else if (argument.startsWith('--structure=')) {
      result.structure = argument.slice('--structure='.length);
    } else if (argument === '--structure') result.structure = argv[++index];
    else if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`);
    else if (!result.name) result.name = argument;
    else if (result.name === 'add' && !result.preset) result.preset = argument;
    else throw new Error(`Unexpected argument: ${argument}`);
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
    options.dummyFeature ||= 'examples';
    return;
  }
  if (options.resume) return;
  if (options.databaseType) options.selectedPresets.push('database');
  if (options.migrations === true && !options.databaseType) {
    throw new Error('--migrations requires a database selection.');
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const askYes = async (question) => (await prompt.question(`${question} [y/N]: `)).trim().toLowerCase();
    if (!options.yes) {
      if (!options.databaseType && ['y', 'yes'].includes(await askYes('Configure a database with TypeORM?'))) {
        const answer = (await prompt.question('Database (1 = PostgreSQL, 2 = MySQL, 3 = MongoDB) [1]: ')).trim().toLowerCase();
        options.databaseType = answer === '2' || answer === 'mysql' ? 'mysql' : answer === '3' || answer === 'mongodb' ? 'mongodb' : 'postgres';
        options.selectedPresets.push('database');
      }
      if (options.databaseType && options.databaseType !== 'mongodb' && options.migrations === undefined) {
        options.migrations = ['y', 'yes'].includes(await askYes('Set up TypeScript migration scripts?'));
      }
      if (options.migrations && !options.selectedPresets.includes('migrations')) options.selectedPresets.push('migrations');
      if (['y', 'yes'].includes(await askYes('Configure rate limiting?'))) options.selectedPresets.push('rate-limit');
    }
    if (options.databaseType && !options.selectedPresets.includes('database')) options.selectedPresets.push('database');
    options.migrations ??= false;
    if (options.migrations && !options.selectedPresets.includes('migrations')) options.selectedPresets.push('migrations');
    validateDatabaseOptions(options);
    if (options.dummyFeature || options.skipDummyFeature || options.yes) return;
    const answer = (await prompt.question('Generate a dummy CQRS feature? [y/N]: ')).trim().toLowerCase();
    if (answer === 'y' || answer === 'yes') {
      options.dummyFeature = (await prompt.question('Feature name [examples]: ')).trim() || 'examples';
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

function runStandard(options) {
  const args = [
    'exec',
    'nest',
    'generate',
    'resource',
    options.name,
    `--crud=${options.crud}`,
    '--no-spec',
  ];
  if (options.dryRun) args.push('--dry-run');
  const result = spawnSync('pnpm', args, {
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
    if (options.help) return printHelp();
    if (options.name === 'init') return await runInit(options);
    if (options.name === 'add') return await runAdd(options);
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

await main();
