import { strings } from '@angular-devkit/core';

export const GUIDANCE_FOUNDATION_VERSION = 5;

export const managedBlocks = {
  'AGENTS.md': 'commands',
  'agents/ARCHITECTURE.md': 'architecture',
  'agents/CODEBASE_MAP.md': 'codebase-map',
};

const markdown = (lines) => `${lines.join('\n')}\n`;
const command = (packageManager, script) => packageManager === 'npm'
  ? `npm run ${script}`
  : `${packageManager} ${script}`;

function managedMarkers(name) {
  return {
    start: `<!-- nest-cqrs:managed:${name}:start -->`,
    end: `<!-- nest-cqrs:managed:${name}:end -->`,
  };
}

function commandBlock(packageManager, packageJson) {
  const lockDescription = packageManager === 'pnpm'
    ? 'the detected `pnpm-lock.yaml`'
    : packageManager === 'yarn'
      ? 'the detected `yarn.lock`'
      : 'the npm fallback used when no pnpm or Yarn lockfile is present';
  const labels = [
    ['Build', 'build'],
    ['Format', 'format'],
    ['Lint', 'lint'],
    ['Unit tests', 'test'],
    ['Watch tests', 'test:watch'],
    ['Coverage', 'test:cov'],
    ['E2E tests', 'test:e2e'],
    ['Create migration', 'migration:create'],
    ['Generate migration', 'migration:generate'],
    ['Show migrations', 'migration:show'],
    ['Run migrations', 'migration:run'],
    ['Revert migration', 'migration:revert'],
    ['Run production migrations', 'migration:run:prod'],
  ];
  return [
    `Use ${packageManager}, matching ${lockDescription}.`,
    '',
    ...labels
      .filter(([, script]) => packageJson.scripts?.[script])
      .map(([label, script]) => `- ${label}: \`${command(packageManager, script)}\``),
  ].join('\n');
}

function architectureBlock({ selectedPresets, databaseType, dummyFeature }) {
  const selected = new Set(selectedPresets);
  const integrations = [];
  if (selected.has('database')) {
    integrations.push(
      '### Database',
      '',
      '- TypeORM is registered asynchronously from validated `db` configuration.',
      `- The generated initial \`DB_TYPE\` is \`${databaseType}\`.`,
      '- Validated runtime database types are `postgres`, `mysql`, and `mongodb`.',
      '- Database host, port, credentials, name, and TLS/SSL behavior come from the validated configuration layer.',
      '- The health endpoint includes a TypeORM database check.',
      '',
    );
  }
  if (selected.has('migrations')) {
    integrations.push(
      '### Migrations',
      '',
      '- `src/database/data-source.ts` defines the TypeORM CLI data source.',
      '- Migration scripts are generated in `package.json`.',
      '- Generated schema migration support is limited to PostgreSQL and MySQL.',
      '- MongoDB is rejected for this migration scaffold.',
      '',
    );
  }
  if (selected.has('rate-limit')) {
    integrations.push(
      '### Rate limiting',
      '',
      '- `ThrottlerModule` is registered globally with a 60,000 ms TTL and a limit of 100 requests for the generated throttler definition.',
      '',
    );
  }
  if (!integrations.length) integrations.push('None were selected during initialization.', '');

  return [
    '## Generated foundation',
    '',
    '### Runtime and application bootstrap',
    '',
    '- NestJS runs on the Fastify adapter.',
    '- `src/main.ts` applies the configured global API prefix.',
    '- A global `ValidationPipe` transforms inputs, removes unknown properties, and rejects non-whitelisted properties.',
    '- CORS is enabled only when validated configuration enables it.',
    '',
    '### Module and request architecture',
    '',
    '- `AppModule` provides global configuration, Pino logging, CQRS, health checks, the global exception filter, and the response interceptor.',
    '- Application features use feature modules with commands, queries, handlers, controllers, DTOs, and entities as applicable.',
    '- Successful responses are normalized by `ResponseInterceptor`.',
    '- Unhandled and HTTP errors are normalized by `GlobalExceptionFilter`.',
    '',
    '### Configuration and validation',
    '',
    '- Environment files are selected from `NODE_ENV` using `.env.<environment>` followed by `.env`.',
    '- Supported environments are `development`, `staging`, and `production`.',
    '- Environment input is validated with Joi before typed configuration is used.',
    '- Application code consumes configuration through `ConfigService<EnvConfig>`.',
    '',
    '### Logging and operational behavior',
    '',
    '- HTTP and application logging use `nestjs-pino`.',
    '- Authorization and cookie headers are redacted.',
    '- Development uses `pino-pretty`; other environments use structured output.',
    '',
    '### Health checks',
    '',
    '- Terminus exposes the generated health endpoint through `HealthModule`.',
    '',
    '### Swagger installation and exposure',
    '',
    '- `@nestjs/swagger` is installed by the generated foundation.',
    '- Swagger is exposed at `/docs` only when validated `SWAGGER_ENABLED` is true.',
    '- `SWAGGER_ENABLED` is required by the Joi schema.',
    '- `.env.example` supplies `SWAGGER_ENABLED=true` as a starter example; Joi does not provide a runtime default.',
    '',
    '## Selected optional integrations',
    '',
    ...integrations,
    '## Generated starter feature',
    '',
    ...(dummyFeature
      ? [
          `- \`src/features/${strings.dasherize(dummyFeature)}/\` is the generated CQRS starter feature.`,
          '- It contains the generated module, controller, DTOs, entity, commands, queries, handlers, and enabled handler tests.',
        ]
      : ['No dummy CQRS feature was requested during initialization.']),
  ].join('\n');
}

function codebaseMapBlock({ selectedPresets, dummyFeature }) {
  const selected = new Set(selectedPresets);
  const appDescription = [
    'root module and global infrastructure registration',
    selected.has('database') ? 'environment-driven TypeORM registration' : undefined,
    selected.has('rate-limit') ? 'generated throttler registration' : undefined,
  ].filter(Boolean).join('; ');
  const lines = [
    '## Application entry points',
    '',
    '- `src/main.ts` — Fastify bootstrap, global validation, CORS, Swagger exposure, and listener startup.',
    `- \`src/app.module.ts\` — ${appDescription}.`,
    '',
    '## Shared infrastructure',
    '',
    '- `src/config/` — environment selection, Joi validation, typed configuration, and process-environment declarations.',
    '- `src/common/decorators/` — shared metadata decorators.',
    '- `src/common/filters/` — global error normalization.',
    '- `src/common/interceptors/` — successful response normalization.',
    '- `src/common/interfaces/` — shared API response models.',
    '- `src/common/pagination/` — pagination DTOs and result types.',
    `- \`src/health/\` — Terminus health module and controller${selected.has('database') ? ' with database health checking' : ', plus the foundation unit test'}.`,
    '',
  ];
  if (selected.has('migrations')) {
    lines.push(
      '## Database tooling',
      '',
      '- `src/database/data-source.ts` — TypeORM CLI data source.',
      '- `src/database/migrations/` — generated migration location.',
      '',
    );
  }
  if (dummyFeature) {
    lines.push(
      '## Generated features',
      '',
      `- \`src/features/${strings.dasherize(dummyFeature)}/\` — generated CQRS feature containing its module, controller, DTOs, entity, commands, queries, handlers, and enabled tests.`,
      '',
    );
  }
  lines.push(
    '## Tests and tooling',
    '',
    '- `test/app.e2e-spec.ts` — generated application E2E health test.',
    '- `vitest.config.ts` — unit-test configuration.',
    '- `vitest.config.e2e.ts` — E2E-test configuration.',
    '- `.env.example` — documented starter environment values.',
    '- `.nest-cqrs.json` — completed initializer manifest.',
  );
  return lines.join('\n');
}

function withManagedBlock(name, content) {
  const { start, end } = managedMarkers(name);
  return `${start}\n${content}\n${end}`;
}

export function renderGuidanceFiles({ packageManager, packageJson, selectedPresets = [], databaseType, dummyFeature }) {
  const commands = withManagedBlock('commands', commandBlock(packageManager, packageJson));
  const architecture = withManagedBlock('architecture', architectureBlock({ selectedPresets, databaseType, dummyFeature }));
  const codebaseMap = withManagedBlock('codebase-map', codebaseMapBlock({ selectedPresets, dummyFeature }));

  return {
    'AGENTS.md': markdown([
      '# Agent Instructions',
      '',
      '> Starter baseline generated by `nest-cqrs`. Keep this file concise and tool-neutral. It is the canonical source of coding-agent rules for this repository. Agent support for automatically discovering this file varies.',
      '',
      '## Instruction hierarchy',
      '',
      '- Follow this file as the canonical repository instruction source.',
      '- Consult [`agents/ARCHITECTURE.md`](agents/ARCHITECTURE.md) before changing application boundaries, infrastructure, configuration, or integrations.',
      '- Consult [`agents/PROJECT_CONTEXT.md`](agents/PROJECT_CONTEXT.md) when behavior depends on product, domain, business-rule, user, or role knowledge.',
      '- Consult [`agents/CODEBASE_MAP.md`](agents/CODEBASE_MAP.md) when locating entry points or changing project structure.',
      '- Consult [`agents/knowledge/INDEX.md`](agents/knowledge/INDEX.md) for durable feature or topic knowledge.',
      '- Read [`agents/README.md`](agents/README.md) when maintaining these references.',
      '',
      '## Engineering rules',
      '',
      '- Preserve the feature-first NestJS CQRS architecture and existing module boundaries.',
      '- Use strict TypeScript, ESM/NodeNext conventions, and `.js` suffixes in relative imports.',
      '- Read environment values through the typed, Joi-validated configuration layer. Do not introduce scattered direct environment access in application code.',
      '- Preserve DTO validation, the global validation pipe, response interception, exception handling, and structured Pino logging conventions.',
      '- Do not log credentials, tokens, connection strings, or other secrets.',
      '- Add or update proportionate Vitest coverage for behavior changes.',
      '- Keep linting, formatting, build, unit tests, and E2E tests passing when relevant to the task.',
      '',
      '## Project commands',
      '',
      commands,
      '',
      '## Task-end knowledge checkpoint',
      '',
      'At the end of each user-requested task:',
      '',
      '1. Review the verified findings and completed changes.',
      '2. Decide whether they established or changed durable project, architecture, structural, operational, domain, or feature knowledge.',
      '3. Update the relevant existing `agents/` reference or knowledge note when one already owns that subject.',
      '4. Create a new knowledge note only for a distinct recurring feature or topic with substantive verified information, then link it from [`agents/knowledge/INDEX.md`](agents/knowledge/INDEX.md).',
      '5. Update [`agents/CODEBASE_MAP.md`](agents/CODEBASE_MAP.md) after structural changes not maintained by the generator.',
      '6. Mark unresolved information `TODO` and `INCOMPLETE`; never guess.',
      '7. Do not store secrets, raw logs, command transcripts, temporary investigation notes, or speculative claims.',
      '8. Report which knowledge files changed and why. If no durable knowledge changed, report that and do not create a meaningless entry.',
    ]),
    'agents/README.md': markdown([
      '# AI Project Guidance',
      '',
      '> Starter baseline generated by `nest-cqrs`.',
      '',
      'Root [`AGENTS.md`](../AGENTS.md) is the canonical source of coding-agent instructions. This directory contains supporting project knowledge and does not define a second or competing policy.',
      '',
      'Files in `agents/` are reference material. Coding agents do not all discover or load them automatically, so `AGENTS.md` directs agents to the relevant file.',
      '',
      '## File hierarchy',
      '',
      '- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — verified generated foundation and selected integrations. Its marked generated block is maintained by `nest-cqrs add`.',
      '- [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) — verified product and domain context maintained by project contributors. Its product sections begin incomplete.',
      '- [`CODEBASE_MAP.md`](./CODEBASE_MAP.md) — important entry points and structural navigation. Its marked generated block is maintained by `nest-cqrs add`.',
      '- [`knowledge/INDEX.md`](./knowledge/INDEX.md) — index and format for future durable feature or topic notes.',
      '',
      '## Ownership',
      '',
      'Text inside `nest-cqrs:managed` markers is generator-owned. Do not place custom content inside those blocks because `nest-cqrs add` may replace it.',
      '',
      'Text outside managed blocks is project-owned. Generator updates preserve it byte-for-byte.',
      '',
      '## Keeping guidance accurate',
      '',
      'The generated scaffold baseline describes the architecture that exists; it is not incomplete. Product-specific context is incomplete until maintainers verify and record it.',
      '',
      '- Update the file that owns the affected information.',
      '- Keep facts concise and verifiable against code, tests, configuration, or an explicit project decision.',
      '- Prefer links to source locations over copying implementation details.',
      '- Mark unknown information `TODO` and `INCOMPLETE`.',
      '- Avoid duplicating the same fact across several files.',
      '',
      'Use the task-end knowledge checkpoint defined in [`AGENTS.md`](../AGENTS.md).',
    ]),
    'agents/ARCHITECTURE.md': markdown([
      '# Architecture',
      '',
      '> Starter architecture baseline generated by `nest-cqrs`.',
      '',
      'The managed section describes the generated foundation and integrations currently recorded by the initializer. Add project-specific architectural decisions outside the managed section.',
      '',
      architecture,
      '',
      '## Project-owned architectural decisions',
      '',
      'Add verified decisions made after initialization here. Do not repeat the generated baseline. Mark unresolved decisions `TODO` and `INCOMPLETE`.',
    ]),
    'agents/PROJECT_CONTEXT.md': markdown([
      '# Project Context',
      '',
      '> Starter baseline generated by `nest-cqrs`.',
      '>',
      '> Product-specific context is INCOMPLETE. The generated scaffold facts below are verified; the TODO sections require input from project maintainers.',
      '',
      '## Verified scaffold facts',
      '',
      '- This repository contains a NestJS application generated with the standalone `nest-cqrs init` workflow.',
      '- The application uses feature-first CQRS conventions.',
      '- Generated architecture and selected integrations are documented in [`ARCHITECTURE.md`](./ARCHITECTURE.md).',
      '- Important generated entry points are documented in [`CODEBASE_MAP.md`](./CODEBASE_MAP.md).',
      '',
      '## TODO: Product purpose — INCOMPLETE',
      '',
      'Document the verified purpose, intended outcomes, and product boundaries. Remove the TODO and INCOMPLETE labels only after this information is confirmed.',
      '',
      '## TODO: Domain concepts — INCOMPLETE',
      '',
      'Document confirmed domain terminology, aggregate or entity meanings, and relationships that future contributors must understand. Do not add speculative concepts.',
      '',
      '## TODO: Business rules — INCOMPLETE',
      '',
      'Document confirmed invariants, workflows, permissions, and constraints. Link to implementation or tests where practical.',
      '',
      '## TODO: Users and roles — INCOMPLETE',
      '',
      'Document confirmed user types, system actors, role meanings, and authorization boundaries. Do not infer roles from generic scaffold code.',
    ]),
    'agents/CODEBASE_MAP.md': markdown([
      '# Codebase Map',
      '',
      '> Starter codebase map generated by `nest-cqrs`.',
      '',
      'The managed section lists important generated paths that currently exist. Record later project-owned structural additions outside that section.',
      '',
      codebaseMap,
      '',
      '## Project-owned structural additions',
      '',
      'Add important entry points or directories introduced outside the generator. Keep this concise and remove entries when the corresponding structure is removed.',
    ]),
    'agents/knowledge/INDEX.md': markdown([
      '# Knowledge Index',
      '',
      '> Starter knowledge index generated by `nest-cqrs`.',
      '',
      'Root [`AGENTS.md`](../../AGENTS.md) defines when agents perform the task-end knowledge checkpoint. This file describes the format and links durable feature or topic notes.',
      '',
      '## When a knowledge note is appropriate',
      '',
      'Create a note only when a task establishes verified information that:',
      '',
      '- is likely to remain useful across future tasks;',
      '- belongs to a distinct recurring feature or technical topic;',
      '- is too specific for `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, or `CODEBASE_MAP.md`; and',
      '- contains substantive facts rather than a record of routine work.',
      '',
      'Do not create empty placeholder notes.',
      '',
      '## Note format',
      '',
      'Use `kebab-case.md` filenames and this structure:',
      '',
      '    # Topic name',
      '',
      '    Status: Verified | Partially verified',
      '    Last verified: YYYY-MM-DD',
      '',
      '    ## Scope',
      '',
      '    ## Verified facts',
      '',
      '    ## Important locations',
      '',
      '    ## Open questions',
      '',
      'Use `TODO` and `INCOMPLETE` for unresolved information. A partially verified note must clearly separate confirmed facts from open questions.',
      '',
      '## Knowledge notes',
      '',
      'No feature or topic notes have been created yet.',
    ]),
  };
}

export function replaceManagedBlock(source, desiredSource, name, path) {
  const { start, end } = managedMarkers(name);
  const count = (value, marker) => value.split(marker).length - 1;
  if (count(source, start) !== 1 || count(source, end) !== 1) {
    throw new Error(`Cannot update ${path}: managed block "${name}" must have exactly one start and one end marker.`);
  }
  if (count(desiredSource, start) !== 1 || count(desiredSource, end) !== 1) {
    throw new Error(`Cannot update ${path}: rendered managed block "${name}" is invalid.`);
  }
  const sourceStart = source.indexOf(start) + start.length;
  const sourceEnd = source.indexOf(end);
  const desiredStart = desiredSource.indexOf(start) + start.length;
  const desiredEnd = desiredSource.indexOf(end);
  if (sourceStart > sourceEnd || desiredStart > desiredEnd) {
    throw new Error(`Cannot update ${path}: managed block "${name}" markers are reversed or malformed.`);
  }
  const otherMarkers = source.match(/<!-- nest-cqrs:managed:[^>]+ -->/g) ?? [];
  if (otherMarkers.length !== 2 || otherMarkers[0] !== start || otherMarkers[1] !== end) {
    throw new Error(`Cannot update ${path}: managed block markers are nested, overlapping, or unexpected.`);
  }
  return source.slice(0, sourceStart)
    + desiredSource.slice(desiredStart, desiredEnd)
    + source.slice(sourceEnd);
}
