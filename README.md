# Nest CQRS Schematics

Set up a new NestJS application with a production-oriented Fastify and CQRS foundation, then generate feature-first CQRS resources from the command line.

This tool is designed to run **inside an existing NestJS project**. Create the Nest project first, enter its root directory, and then run `nest-cqrs init`.

Run `nest-cqrs --help` for colorized command, generator, and option tables. Main
commands support `i` (`init`), `a` (`add`), `g` (`generate`), and `r`
(`resource`). Generator aliases are `cmd`/`c`, `q`, and `e` for commands,
queries, and entities respectively. Common options also have short aliases shown
in the help table; set `NO_COLOR=1` to disable ANSI colors.

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
- coding-agent guidance in `AGENTS.md` and `.agents/`, including project-aware testing rules;
- optional database, migration, and rate-limit integrations.

The initializer preserves the Nest CLI starter's scripts, Jest/Vitest, Oxlint, and Prettier
dependencies and configuration, TypeScript configuration, and Nest CLI
configuration. The generated foundation retains a focused HTTP logging unit test but does not
create feature, E2E, or database-integration placeholder tests. The existing Jest or Vitest
`test` script receives `--passWithNoTests` so it also succeeds if no tests remain or match the
runner configuration; all other scripts are preserved. Existing dependency versions are
retained; the initializer only adds packages required by the generated foundation and selected
presets.
For Fastify Swagger UI, this includes the required `@fastify/static` runtime plugin.
Generated relative imports follow the existing project module type: ESM projects
receive `.js` suffixes, while CommonJS projects keep extensionless imports.

## Agent guidance and existing files

The guidance layout follows ContextRivet's project, instructions, and knowledge
folders. New projects receive:

```text
AGENTS.md                         Nest CQRS context routing
.agents/
  PROJECT.md                      product context and detected project commands
  ARCHITECTURE.md                  generated foundation and selected integrations
  CODEBASE_MAP.md                  generated entry points and directories
  README.md                       guidance ownership and maintenance
  instructions/
    bootstrap.md                  complete unknown product context
    engineering.md                implementation and verification rules
    stack.md                      NestJS and CQRS conventions
    testing.md                    existing runner and module format
    workflow.md                   task workflow and durable knowledge
    code-intelligence.md          conditional code investigation guidance
  knowledge/
    INDEX.md                      navigation to relevant feature notes
    decisions.md                  accepted decisions and evidence
  templates/
    feature.md                    template for actual feature knowledge
```

When a guidance file already exists, initialization preserves its existing
content and appends a clearly labelled **Nest CQRS generated guidance** section
at the bottom. The section is enclosed in markers such as:

```markdown
<!-- nest-cqrs:managed:guidance:start -->
## Nest CQRS generated guidance

...generated context routing...
<!-- nest-cqrs:managed:guidance:end -->
```

Each file has its own named block. Later preset additions update only that
generator-owned block, keeping it at the bottom even if custom text was added
after it. Text outside the markers is preserved byte-for-byte; place custom
instructions, product details, and knowledge entries outside the generated block.
Missing or malformed marker pairs are never repaired by guessing: partial,
duplicate, reversed, or nested Nest CQRS markers cause the operation to stop
before preset files are written. A file with no Nest CQRS markers receives a new
footer. Existing ContextRivet markers and canonical routing are preserved.

New `PROJECT.md` product fields start pending; scaffold facts and architecture
are supplied separately. Existing project readiness status and completed product
context are preserved. The generator does not install skills, register with
ContextRivet, or change its metadata, backups, or agent-specific configuration.
Each tool retains its own update and ownership rules.

Previously initialized projects with the older `agents/` layout keep their
original paths when presets are added. Their existing managed blocks are updated
as footers; there is no automatic folder migration or deletion of custom files.

Preview guidance changes together with application changes using
`nest-cqrs init --dry-run` or `nest-cqrs add <preset> --dry-run`. Existing guidance
without a generated block is reported as `APPEND`; existing blocks as `UPDATE`.

## Prerequisites

Install these before starting:

1. Node.js 24.15.0 or newer within Node 24 (recommended). The dependencies also
   support Node `^22.22.3` and `>=26.0.0`; Node 25 is not supported. This repository's
   `.nvmrc` selects Node 24. If you use nvm, run `nvm install` and `nvm use` here.
2. npm or pnpm. npm is included with Node.js; pnpm must be installed separately.
3. The Nest CLI:

   ```bash
   npm install --global @nestjs/cli
   ```

   You can verify it with:

   ```bash
   nest --version
   ```

The generator repository supports both npm and pnpm; choose one setup below.
Generated projects also support Yarn. Initialization,
preset installation, and standard resource generation detect the target project's
package manager from its lockfile. If neither `pnpm-lock.yaml` nor `yarn.lock`
exists, they use npm. The generator's own package manager does not determine the
target project's package manager.

The target application must use Nest 11 or 12. CQRS, the Fastify adapter, and
Swagger are selected to match its existing `@nestjs/core` major. Existing
versions are preserved; incompatible Nest package majors stop generation with
an explanation before files are written. This check covers core, common,
testing, CQRS, the Fastify adapter, and Swagger. Use explicit versions such as
`^11.0.0` or `^12.0.0` rather than ambiguous ranges or tags.

## Install this generator

This package is currently marked private in `package.json`, so installation uses
the GitHub source rather than the public npm registry. On macOS or Linux, choose
the one-command download below or install from your own checkout.

### One-command installation (no manual clone)

Install a supported Node.js and npm or pnpm first. Node 24.15+ within Node 24 is
recommended. With nvm and no checkout, use `nvm install 24` and `nvm use 24`.

For npm, paste this command into your terminal from any directory:

```bash
sh -c 'installer=$(curl -fsSL https://raw.githubusercontent.com/Shahzad-Official/nest-cqrs-schematics/main/install.sh) && [ -n "$installer" ] && printf "%s\n" "$installer" | sh -s -- npm'
```

For pnpm:

```bash
sh -c 'installer=$(curl -fsSL https://raw.githubusercontent.com/Shahzad-Official/nest-cqrs-schematics/main/install.sh) && [ -n "$installer" ] && printf "%s\n" "$installer" | sh -s -- pnpm'
```

The command downloads the installer completely before running it. The installer
then downloads a GitHub source archive, installs locked dependencies, and
registers `nest-cqrs` globally. Git is not required, and your current directory
and any Nest project in it are left unchanged. GitHub archives contain a source
snapshot rather than Git history. [GitHub archive documentation](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives)

Installed files stay under
`${XDG_DATA_HOME:-$HOME/.local/share}/nest-cqrs-schematics/install.XXXXXX/source`.
This persistent copy is needed by the global command. The installer prints the
exact source and log paths, keeps terminal output short on success, and shows
the captured error log on failure. Reinstalling creates a separate copy and
registers the command again; existing copies and user files are preserved.

These anonymous download commands require public access to the installer and
archive. Maintainers must commit and push `install.sh`, the application files,
and both lockfiles to `main` before sharing the commands. Private repositories
need authenticated access; use an authenticated checkout with the local setup
below instead.

After installation, run `nest-cqrs --help`, then run `nest-cqrs init` inside an
existing Nest project. The download installer does not initialize or launch an
application automatically.

### Setup from your own checkout

Clone or open this repository to work from your own source copy.

If you use nvm, select the repository's Node version before installing:

```bash
cd /path/to/nest-cqrs-schematics
nvm install
nvm use
```

#### Automatic checkout setup

On macOS or Linux, run one command from the cloned generator repository:

```bash
./install.sh
```

This defaults to npm. To use pnpm instead:

```bash
./install.sh pnpm
```

The installer checks that Node.js and the selected package manager are available,
installs dependencies from that manager's lockfile with strict Node engine
checks, and registers `nest-cqrs` globally. It uses `npm link` for npm, `pnpm link
--global` for pnpm 10, and `pnpm add --global .` for pnpm 11 and newer. These are
the respective package managers' documented registration commands:
[npm linking](https://docs.npmjs.com/cli/v11/commands/npm-link/) and
[pnpm global registration](https://pnpm.io/cli/link#add-a-binary-globally).

Node.js and your selected package manager must already be installed. Unsupported
Node versions stop installation; with nvm, use `nvm install` and `nvm use` above.
If pnpm's global command directory is not configured, run `pnpm setup`, reopen
the terminal, then rerun `./install.sh pnpm`. If a global command directory is
missing from `PATH`, the installer prints the directory to add.

The installer operates in its own checkout, even when called from another
directory with `sh /path/to/nest-cqrs-schematics/install.sh`. It does not install
Node.js, change shell configuration, initialize a Nest project, or start an
application. `npm ci` alone continues to install dependencies only; global
registration happens when you explicitly run this installer or the manual link
command below.

After installation, verify manually:

```bash
nest-cqrs --help
```

Then follow [Quick start](#quick-start) to create or enter a Nest project and run
`nest-cqrs init`. Use `./install.sh --help` for installer usage.

#### Manual setup with npm

```bash
cd /path/to/nest-cqrs-schematics
npm ci
npm link
nest-cqrs --help
```

`npm ci` installs this generator's dependencies from `package-lock.json` into
its local `node_modules`. It does not register the `nest-cqrs` command globally
or initialize a Nest application. `npm link` registers the command; run it once
after installation, without `--global`. No build step is needed.

`npm install` (or `npm i`) also works, and is used when updating dependencies.
After cloning this repository on another machine, use `npm ci` again, then
`npm link` if you want the global command on that machine.

#### Manual setup with pnpm

```bash
cd /path/to/nest-cqrs-schematics
pnpm install --frozen-lockfile
pnpm add --global .
nest-cqrs --help
```

`pnpm install --frozen-lockfile` installs this generator's dependencies from
`pnpm-lock.yaml`. `pnpm install` also works when updating dependencies. With
pnpm 11, `pnpm add --global .` registers the command globally.

With pnpm 10, use `pnpm link --global` instead. If pnpm reports that its global
bin directory is missing, run `pnpm setup` and reopen your terminal first.

### Use without global registration

After `npm ci` or `pnpm install --frozen-lockfile`, you can invoke the executable
directly from any Nest project:

```bash
node /path/to/nest-cqrs-schematics/bin/nest-cqrs.js --help
```

Use that full `node .../bin/nest-cqrs.js` command in place of `nest-cqrs` in the examples below.

### Install as a dependency inside a Nest project

To keep the generator in a Nest project's `devDependencies`, first create a
local package archive from this repository:

```bash
cd /path/to/nest-cqrs-schematics
npm pack
```

This creates `retail-pos-schematics-0.1.0.tgz`. From your existing Nest project's
root, choose the matching package manager:

| Task | npm | pnpm |
|---|---|---|
| Install the generator | `npm install --save-dev /path/to/nest-cqrs-schematics/retail-pos-schematics-0.1.0.tgz` | `pnpm add --save-dev /path/to/nest-cqrs-schematics/retail-pos-schematics-0.1.0.tgz` |
| Show help | `npx nest-cqrs --help` | `pnpm exec nest-cqrs --help` |
| Initialize the project | `npx nest-cqrs init` | `pnpm exec nest-cqrs init` |

No global registration is needed for this option. Use `npx nest-cqrs` or
`pnpm exec nest-cqrs` in place of `nest-cqrs` in the remaining examples.
The dependency and its archive location are saved in the target project's
`package.json` and lockfile. Keep the archive available at that location for
future installations and on other machines, or use a shared archive location.
The package cannot be published with the current `"private": true` setting.

### Lockfiles and switching package managers

Both `package-lock.json` and `pnpm-lock.yaml` are kept in the repository. Use one
package manager per checkout's `node_modules`. When switching managers, remove
only `node_modules` first, then run `npm ci` or `pnpm install --frozen-lockfile`.
Keep both lockfiles. When changing dependencies, update both with
`npm install --package-lock-only` and `pnpm install --lockfile-only`.

## Quick start

### 1. Create a new NestJS project

Run the Nest CLI outside this generator repository. Choose one:

npm:

```bash
nest new my-api --package-manager npm
cd my-api
```

pnpm:

```bash
nest new my-api --package-manager pnpm
cd my-api
```

The Nest CLI installs the new project's starter dependencies with the selected
package manager.

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

The initializer adds the foundation's required packages to the Nest project's
`package.json`, then runs `npm install` or `pnpm install` in that project based
on its lockfile. It also runs formatting after installation. You do not need to
install those generated dependencies separately. `--skip-install` generates
files without installing or formatting; install dependencies manually afterward
with your project's package manager.

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

| npm | pnpm |
|---|---|
| `npm run start:dev` | `pnpm start:dev` |

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

On startup, the application logger prints the listening URL, the API base URL
including the configured prefix, and the Swagger UI URL when Swagger is enabled.

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

During interactive initialization, every yes/no option defaults to yes. Press Enter to accept it. The default starter feature name is `users`.

Generate a starter feature during initialization:

```bash
nest-cqrs init --dummy-feature users --yes
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

The initializer checks its complete plan before its first write. Existing agent
guidance receives a marked footer as described above. Collisions with other
non-replaceable files still stop initialization before any application files are
written. Guidance paths must be regular files and directories; symlinks are
rejected rather than followed.

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

For projects created by the current initializer, `nest-cqrs add` refreshes the
generated footer in `.agents/PROJECT.md`, `.agents/ARCHITECTURE.md`, and
`.agents/CODEBASE_MAP.md` when commands, integrations, or paths change. Other
guidance footers are retained or updated as needed; existing content outside
the Nest CQRS markers is preserved.

## Generate application resources

Run `nest-cqrs` with a feature name:

```bash
nest-cqrs orders
```

The command asks whether to generate a standard Nest resource or a CQRS resource.

Generate a CQRS CRUD feature without prompts:

```bash
nest-cqrs orders --structure cqrs --crud
```

This creates a feature-first structure under:

```text
src/features/orders/
```

It includes the feature module, controller, request DTOs, endpoint-specific response DTOs, entity, commands, queries, and handlers. The feature module is registered in the nearest Nest module. Tests are intentionally not generated; `.agents/instructions/testing.md` guides coding agents when tests are requested later.

Success response contracts live in the feature's `responses/` directory. Each generated endpoint uses its own named response class in the controller, CQRS command or query, handler return type, and Swagger envelope schema. Swagger derives controller grouping automatically; the generator does not add `@ApiTags` or repetitive `@ApiOperation` summaries.

This generated feature is an **illustrative CQRS scaffold**. Its handlers return placeholder values to show the request flow; they are not production business logic or a persistence-backed reference implementation.

Generate only the CQRS module and entity:

```bash
nest-cqrs orders --structure cqrs --no-crud
```

To use Nest's standard resource generator instead:

```bash
nest-cqrs orders --structure standard
```

### Generate individual commands and queries

Generate a command and handler at a source-relative path:

```bash
nest-cqrs generate command features/orders/cancel-order
```

Add a query and handler:

```bash
nest-cqrs generate query features/orders/find-order
```

The shorter `g` alias is also supported. The generator creates the request and
handler below the supplied path under the configured Nest `sourceRoot`. With
only a name, it generates under `src/commands` or `src/queries`. It registers
the handler in the nearest module when one exists. The older `--feature orders`
form remains available as a shortcut. Use `--dry-run` to preview either operation.

### Generate database-aware entities

Generate an entity at a source-relative path:

```bash
nest-cqrs generate entity features/products/product
```

The generator reads the selected database from `.nest-cqrs.json`. PostgreSQL and
MySQL entities receive a UUID primary key; MongoDB entities receive an
`ObjectId`. Database entities also include created and updated timestamp columns.
When no database is configured, the generator creates a plain class and prints
a warning. Override detection when needed with `--database postgres`, `mysql`,
`mongodb`, or `plain`.

Domain fields are optional and are generated only when explicitly supplied:

```bash
nest-cqrs g entity features/products/product \
  --fields "name:string:unique,price:decimal,description?:text"
```

Supported field types are `string`, `text`, `integer`, `number`, `decimal`,
`boolean`, and `date`. Append `?` to the field name for a nullable field and use
the optional `unique` modifier for a unique column.

## Generated project commands

Initialization preserves and uses the scripts already supplied by the Nest CLI starter, such as:

| Task | npm | pnpm |
|---|---|---|
| Build | `npm run build` | `pnpm build` |
| Format | `npm run format` | `pnpm format` |
| Lint | `npm run lint` | `pnpm lint` |
| Unit tests | `npm test` | `pnpm test` |
| Watch tests | `npm run test:watch` | `pnpm test:watch` |
| Test coverage | `npm run test:cov` | `pnpm test:cov` |
| E2E tests | `npm run test:e2e` | `pnpm test:e2e` |
| Start | `npm start` | `pnpm start` |
| Start with watch | `npm run start:dev` | `pnpm start:dev` |
| Start with debugger | `npm run start:debug` | `pnpm start:debug` |
| Start production build | `npm run start:prod` | `pnpm start:prod` |

The existing format script is used after dependency installation when test source files remain. When initialization removes the obsolete Nest starter tests and no test sources remain, the initializer runs the existing Prettier executable against `src/**/*.ts` directly so the starter script's unmatched `test/**/*.ts` glob cannot fail. Dry runs and operations using `--skip-install` do not run formatting.

The initializer appends `--passWithNoTests` to the existing Jest or Vitest `test`
script. The generated HTTP logging unit test runs immediately after generation,
and the option keeps the command successful if that test is later removed or no
tests match the runner configuration. Other test scripts and runner configuration
are unchanged.

When migrations are enabled, the project also receives:

| npm | pnpm |
|---|---|
| `npm run migration:create` | `pnpm migration:create` |
| `npm run migration:generate` | `pnpm migration:generate` |
| `npm run migration:show` | `pnpm migration:show` |
| `npm run migration:run` | `pnpm migration:run` |
| `npm run migration:revert` | `pnpm migration:revert` |
| `npm run migration:run:prod` | `pnpm migration:run:prod` |

Use only scripts present in your generated project's `package.json`. For Yarn,
use `yarn <script>`.

The foundation generates one focused unit test for its HTTP logging policy. It does not generate feature, E2E, or database-integration placeholder tests and does not add test scripts. The generated `.agents/instructions/testing.md` records the detected runner and module format so an AI agent can add deliberate, compatible tests when requested.

## Environment configuration

The generated application uses one runtime environment selector:

```dotenv
NODE_ENV="development"
```

It loads `.env.<NODE_ENV>` first and then `.env`. Supported values are:

- `development`
- `staging`
- `production`

All required values are validated with Joi. The configuration factory uses Joi's
normalized values, so `PORT` and `DB_PORT` are numbers and boolean flags accept
both `true`/`false` and `TRUE`/`FALSE`. Raw `process.env` values remain strings.
Application code consumes the typed configuration through Nest's `ConfigService`.

The global exception filter preserves the original exception and stack in
the request log's `err` field. HTTP 4xx responses log at `warn`, HTTP 5xx at
`error`, and successful requests stay silent. Unexpected error details remain
in server logs while the response uses the normalized error envelope.

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

### `EBADENGINE` during installation

Check `node --version`. Node 25 does not satisfy the installed Angular DevKit and
Nest schematics engine requirements. Switch to the supported Node version above
(with nvm: `nvm install` then `nvm use` in this repository), then reinstall using
your chosen package manager. Do not suppress the warning with `--force`.

### `ELINKGLOBAL: link should never be --global`

From this generator repository, use `npm link`, without `--global`. npm and pnpm
use different commands for global registration; follow the matching setup above.

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

| npm | pnpm |
|---|---|
| `npm run format` | `pnpm format` |

Fix the reported issue, then use `nest-cqrs init --resume` if initialization is still pending.

## Developing this generator

Install dependencies and run the test suite with either package manager:

```bash
npm ci
npm test
```

Or:

```bash
pnpm install --frozen-lockfile
pnpm test
```

CI installs and runs the unit suite with both npm and pnpm on Node 24. The
generated-application acceptance suite runs in the pnpm job.

The tests cover foundation generation, optional presets, resource generation, dry runs, collisions, recovery, managed guidance updates, and formatting behavior.

### Remove previously tracked dependencies from Git

`.gitignore` prevents new dependency files from being tracked; it does not
untrack files already committed. From this repository's root, remove only
`node_modules` from Git's index:

```bash
git rm -r --cached -- node_modules
git add .gitignore
```

`--cached` preserves the local files. Git stages their removal from the
repository; commit those removals together with `.gitignore`. Keep both
`package-lock.json` and `pnpm-lock.yaml` tracked so other machines can install
dependencies with `npm ci` or `pnpm install --frozen-lockfile`.
