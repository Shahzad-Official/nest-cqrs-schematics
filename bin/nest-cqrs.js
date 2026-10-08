#!/usr/bin/env node

import { NodeWorkflow } from '@angular-devkit/schematics/tools/index.js';
import { strings } from '@angular-devkit/core';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { initialize } from '../init/index.js';
import packageJson from '../package.json' with { type: 'json' };

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const collectionPath = resolve(packageRoot, 'collection.json');

function printHelp() {
  console.log(`Usage:
  nest-cqrs <feature-name> [options]
  nest-cqrs init [options]

Generate a resource, or initialize the preferred Nest application foundation.

Options:
  --structure <standard|cqrs>  Skip the structure prompt
  --crud / --no-crud          Enable or disable CRUD endpoints
  --tests / --no-tests        Enable or disable unit tests
  --dry-run                   Preview without writing files
  --dummy-feature <name>      With init, generate a CQRS feature after setup
  --no-dummy-feature          With init, skip the optional feature
  --resume                    Resume an incomplete init
  -h, --help                  Show this help`);
}

function parseArgs(argv) {
  const result = {
    name: undefined,
    structure: undefined,
    crud: undefined,
    tests: undefined,
    dryRun: false,
    resume: false,
    dummyFeature: undefined,
    skipDummyFeature: false,
    skipInstall: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') result.help = true;
    else if (argument === '--dry-run') result.dryRun = true;
    else if (argument === '--resume') result.resume = true;
    else if (argument === '--no-dummy-feature') result.skipDummyFeature = true;
    else if (argument === '--skip-install') result.skipInstall = true;
    else if (argument.startsWith('--dummy-feature=')) result.dummyFeature = argument.slice('--dummy-feature='.length);
    else if (argument === '--dummy-feature') result.dummyFeature = argv[++index];
    else if (argument === '--crud') result.crud = true;
    else if (argument === '--no-crud') result.crud = false;
    else if (argument === '--tests') result.tests = true;
    else if (argument === '--no-tests') result.tests = false;
    else if (argument.startsWith('--structure=')) {
      result.structure = argument.slice('--structure='.length);
    } else if (argument === '--structure') result.structure = argv[++index];
    else if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`);
    else if (!result.name) result.name = argument;
    else throw new Error(`Unexpected argument: ${argument}`);
  }
  return result;
}

async function askInitOptions(options) {
  if (options.dummyFeature || options.skipDummyFeature || options.resume) return;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await prompt.question('Generate a dummy CQRS feature? [y/N]: ')).trim().toLowerCase();
    if (answer === 'y' || answer === 'yes') {
      options.dummyFeature = (await prompt.question('Feature name [examples]: ')).trim() || 'examples';
    }
  } finally {
    prompt.close();
  }
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
    if (options.tests === undefined) {
      const answer = (await prompt.question('Generate unit tests? [Y/n]: '))
        .trim()
        .toLowerCase();
      options.tests = answer !== 'n' && answer !== 'no';
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
    options.tests ? '--spec' : '--no-spec',
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
          spec: options.tests,
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
    runFeature: (name) => runCqrs({ name, crud: true, tests: true, dryRun: false }),
  });
  for (const operation of result.operations) console.log(operation);
  if (options.dryRun) console.log('Dry run enabled. No files written.');
  else console.log('Nest CQRS foundation initialized successfully.');
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) return printHelp();
    if (options.name === 'init') return await runInit(options);
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
