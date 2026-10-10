# Nest CQRS Schematics

Set up a new NestJS application with a production-oriented Fastify and CQRS foundation, then generate feature-first CQRS resources from the command line.

This tool is designed to run **inside an existing NestJS project**. Create the Nest project first, enter its root directory, and then run `nest-cqrs init`.

## What it adds

The initializer configures:

- Fastify as the NestJS HTTP platform;
- feature-first CQRS support;
- typed, Joi-validated environment configuration;
- global DTO validation;
- structured Pino logging;
- consistent success and error responses;
- health checks;
- Swagger/OpenAPI support controlled by configuration;
- E2E tests that use the Nest CLI starter's existing Jest or Vitest setup;
- coding-agent guidance in `AGENTS.md` and `agents/`;
- optional database, migration, and rate-limit integrations.

The initializer preserves the Nest CLI starter's scripts, Jest/Vitest, Oxlint, and Prettier
dependencies and configuration, TypeScript configuration, and Nest CLI
configuration. Existing dependency versions are retained; the initializer only
adds packages required by the generated foundation and selected presets.
Generated relative imports follow the existing project module type: ESM projects
receive `.js` suffixes, while CommonJS projects keep extensionless imports.

## Prerequisites

Install these before starting:

1. A current Node.js LTS release.
2. A package manager: pnpm, npm, or Yarn.
3. The Nest CLI:

   ```bash
   npm install --global @nestjs/cli
   ```

   You can verify it with:

   ```bash
   nest --version
   ```

The examples below use pnpm, but generated projects also support npm and Yarn. The initializer detects the project package manager from its lockfile. If it finds neither `pnpm-lock.yaml` nor `yarn.lock`, it uses npm.

## Install this generator locally

This package is currently marked private, so use it from a local checkout rather than trying to install it from the public npm registry.

Clone or open this repository, then install its dependencies:

```bash
cd /path/to/nest-cqrs-schematics
pnpm install
```

Link its `nest-cqrs` command globally:

```bash
pnpm link --global
```

Verify the command:

```bash
nest-cqrs --help
```

If you do not want a global link, invoke the executable directly:

```bash
node /path/to/nest-cqrs-schematics/bin/nest-cqrs.js --help
```

Use that full `node .../bin/nest-cqrs.js` command in place of `nest-cqrs` in the examples below.

## Quick start

### 1. Create a new NestJS project

Run the Nest CLI outside this generator repository:

```bash
nest new my-api --package-manager pnpm
cd my-api
```

The initializer expects to find these files in the current directory:

```text
package.json
nest-cli.json
tsconfig.json
```

It also verifies that `@nestjs/core` is installed.

### 2. Initialize the CQRS foundation

From the root of the newly created Nest project, run:

```bash
nest-cqrs init
```

The interactive prompts let you choose:

- a database integration;
- the initial database type;
- relational migration scripts;
- rate limiting;
- an optional dummy CQRS feature.

Review the generated `.env.example`, then create your local environment file:

```bash
cp .env.example .env
```

Update the values before starting the application. Do not commit real secrets.

### 3. Start the application

```bash
pnpm start:dev
```

The generated health endpoints use the configured API prefix. With the example configuration, they are available at:

```text
GET /api/health/live
GET /api/health/ready
```

Liveness checks only the application process. Readiness checks selected required integrations, such as the configured database.

Swagger is installed by the foundation. When `SWAGGER_ENABLED=true`, its UI is available at:

```text
/docs
```

## Non-interactive initialization

Use `--yes` to accept the non-optional defaults and skip confirmation prompts:

```bash
nest-cqrs init --yes
```

Initialize with PostgreSQL and migrations:

```bash
nest-cqrs init --database postgres --migrations --yes
```

Initialize with MySQL but no migrations:

```bash
nest-cqrs init --database mysql --no-migrations --yes
```

Initialize with MongoDB:

```bash
nest-cqrs init --database mongodb --yes
```

MongoDB cannot be combined with the generated TypeORM schema-migration scaffold.

Enable every compatible optional selection:

```bash
nest-cqrs init --all --database postgres --yes
```

`--all` requires an explicit database choice. Relational databases receive migrations unless `--no-migrations` is provided; MongoDB does not.

Generate a starter feature during initialization:

```bash
nest-cqrs init --dummy-feature examples --yes
```

Skip the dummy feature explicitly:

```bash
nest-cqrs init --no-dummy-feature --yes
```

## Preview changes safely

Use a dry run to see the planned file operations without writing anything:

```bash
nest-cqrs init --dry-run
```

The initializer collision-checks its complete plan before its first write. It refuses to overwrite existing non-replaceable files, including an existing `AGENTS.md` or generated `agents/` guidance file.

## Optional presets

The currently supported presets are:

| Preset | Purpose |
|---|---|
| `database` | Adds TypeORM, database configuration, drivers, and database health checking. |
| `migrations` | Adds TypeORM CLI data-source and relational migration commands. |
| `rate-limit` | Adds the generated Nest throttler configuration. |

You can select presets during `init` or add them later.

### Add a database later

```bash
nest-cqrs add database --database postgres
```

Short aliases are also supported:

```bash
nest-cqrs add postgres
nest-cqrs add mysql
nest-cqrs add mongodb
```

To add a relational database and migrations together:

```bash
nest-cqrs add database --database postgres --migrations
```

### Add migrations later

The project must already have a PostgreSQL or MySQL database preset:

```bash
nest-cqrs add migrations
```

### Add rate limiting later

```bash
nest-cqrs add rate-limit
```

Preview any preset addition with `--dry-run`:

```bash
nest-cqrs add rate-limit --dry-run
```

For projects created by the current initializer, `nest-cqrs add` also refreshes the generator-managed sections of `AGENTS.md`, `agents/ARCHITECTURE.md`, and `agents/CODEBASE_MAP.md`. Text outside the managed markers is preserved.

## Generate application resources

Run `nest-cqrs` with a feature name:

```bash
nest-cqrs orders
```

The command asks whether to generate a standard Nest resource or a CQRS resource.

Generate a CQRS CRUD feature without prompts:

```bash
nest-cqrs orders --structure cqrs --crud --tests
```

This creates a feature-first structure under:

```text
src/features/orders/
```

It includes the feature module, controller, DTOs, entity, commands, queries, handlers, and optional handler tests. The feature module is registered in the nearest Nest module.

This generated feature is an **illustrative CQRS scaffold**. Its handlers return placeholder values to show the request flow; they are not production business logic or a persistence-backed reference implementation.

Generate only the CQRS module and entity:

```bash
nest-cqrs orders --structure cqrs --no-crud
```

Generate without test files:

```bash
nest-cqrs orders --structure cqrs --no-tests
```

To use Nest's standard resource generator instead:

```bash
nest-cqrs orders --structure standard
```

## Generated project commands

Initialization adds these scripts to the application:

```bash
pnpm build
pnpm format
pnpm lint
pnpm test
pnpm test:watch
pnpm test:cov
pnpm test:e2e
pnpm start
pnpm start:dev
pnpm start:debug
pnpm start:prod
```

The format script runs Prettier across the full project. A normal `init` or `add` operation runs it after dependency installation and generation. Dry runs and operations using `--skip-install` do not run formatting.

When migrations are enabled, the project also receives:

```bash
pnpm migration:create
pnpm migration:generate
pnpm migration:show
pnpm migration:run
pnpm migration:revert
pnpm migration:run:prod
```

Replace `pnpm` with `npm run` or `yarn` when using another package manager.

Database-enabled projects also receive a separate `test:integration` command. Fast scaffold E2E tests do not connect to a database. Real database integration tests run only when explicitly requested with `RUN_DATABASE_INTEGRATION=true` and complete `DB_*` connection variables:

```bash
RUN_DATABASE_INTEGRATION=true pnpm test:integration
```

## Environment configuration

The generated application uses one runtime environment selector:

```dotenv
NODE_ENV="development"
```

It loads `.env.<NODE_ENV>` first and then `.env`. Supported values are:

- `development`
- `staging`
- `production`

All required values are validated with Joi. Application code consumes the typed configuration through Nest's `ConfigService`.

When the database preset is enabled, these database types are supported:

- `postgres`
- `mysql`
- `mongodb`

Database connection settings are read from the environment, so update `DB_TYPE` and the related `DB_*` values together.

## Interrupted initialization and resume

During initialization, recovery metadata is stored in:

```text
.nest-cqrs.pending.json
```

If installation or formatting fails, fix the underlying problem and resume:

```bash
nest-cqrs init --resume
```

Resume verifies that the project and saved generation plan have not drifted. On success, the pending file is removed and the completed manifest is written to:

```text
.nest-cqrs.json
```

Running `init` again after successful initialization is intentionally rejected.

### pnpm ignored build scripts

If pnpm reports `ERR_PNPM_IGNORED_BUILDS`, the initializer runs:

```bash
pnpm approve-builds --all
```

It records the approved build configuration in the recovery checkpoint and retries installation.

## Useful options

```text
--database <postgres|mysql|mongodb>
--migrations / --no-migrations
--dummy-feature <name>
--no-dummy-feature
--structure <standard|cqrs>
--crud / --no-crud
--tests / --no-tests
--dry-run
--resume
--skip-install
--all
--yes
--help
```

Run the built-in help at any time:

```bash
nest-cqrs --help
```

## Common problems

### “Run nest-cqrs from the root of a Nest project”

Change into the directory created by `nest new`. Confirm that `package.json`, `nest-cli.json`, and `tsconfig.json` are present.

### “This project is already initialized”

The `.nest-cqrs.json` manifest already exists. Use `nest-cqrs add <preset>` to add a supported integration instead of running `init` again.

### A file collision is reported

The initializer will not overwrite user-owned files. Move, rename, or intentionally reconcile the reported file before trying again. Use `--dry-run` first to review the complete plan.

### The database does not connect

Check `DB_TYPE`, host, port, credentials, database name, and SSL setting in the active environment file. Confirm that the database is running and accessible to the configured user.

### Formatting fails

Run the generated format command directly to see the formatter output:

```bash
pnpm format
```

Fix the reported issue, then use `nest-cqrs init --resume` if initialization is still pending.

## Developing this generator

Install dependencies and run the test suite:

```bash
pnpm install
pnpm test
```

The tests cover foundation generation, optional presets, resource generation, dry runs, collisions, recovery, managed guidance updates, and formatting behavior.
