import { strings } from '@angular-devkit/core';

const supportedTypes = new Map([
  ['string', { ts: 'string' }],
  ['text', { ts: 'string', sql: 'text' }],
  ['integer', { ts: 'number', sql: 'int' }],
  ['number', { ts: 'number' }],
  ['decimal', { ts: 'number', sql: 'decimal' }],
  ['boolean', { ts: 'boolean' }],
  ['date', { ts: 'Date' }],
]);

function readJson(tree, path) {
  try {
    return JSON.parse(tree.read(path)?.toString() ?? '{}');
  } catch {
    return {};
  }
}

function sourceRoot(tree) {
  return strings.dasherize(readJson(tree, '/nest-cli.json').sourceRoot || 'src');
}

function detectDatabase(tree, override) {
  if (override) return override;
  const configured = readJson(tree, '/.nest-cqrs.json').presets?.database?.type;
  if (configured) return configured;
  const dependencies = {
    ...readJson(tree, '/package.json').dependencies,
    ...readJson(tree, '/package.json').devDependencies,
  };
  if (dependencies.mongodb) return 'mongodb';
  if (dependencies.pg) return 'postgres';
  if (dependencies.mysql2) return 'mysql';
  return 'plain';
}

function location(tree, options) {
  if (options.feature) {
    return {
      name: strings.dasherize(options.name.replace(/-entity$/i, '')),
      owner: `${sourceRoot(tree)}/features/${strings.dasherize(options.feature)}`,
    };
  }
  const parts = options.name.trim().replace(/\\/g, '/').split('/').filter(Boolean);
  const rawName = parts.pop();
  if (!rawName) throw new Error('Entity name is required.');
  return {
    name: strings.dasherize(rawName.replace(/-entity$/i, '')),
    owner: [sourceRoot(tree), ...parts.map(strings.dasherize)].join('/'),
  };
}

function parseFields(value) {
  if (!value?.trim()) return [];
  return value.split(',').map((definition) => {
    const [rawName, rawType, ...modifiers] = definition.trim().split(':');
    const optional = rawName?.endsWith('?');
    const name = optional ? rawName.slice(0, -1) : rawName;
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name ?? '')) {
      throw new Error(`Invalid entity field name: ${rawName || definition}`);
    }
    const type = rawType?.toLowerCase();
    if (!supportedTypes.has(type)) {
      throw new Error(`Unsupported type for ${name}: ${rawType || '(missing)'}. Supported: ${[...supportedTypes.keys()].join(', ')}.`);
    }
    const unknownModifier = modifiers.find((modifier) => modifier !== 'unique');
    if (unknownModifier) throw new Error(`Unsupported modifier for ${name}: ${unknownModifier}.`);
    return { name, optional, unique: modifiers.includes('unique'), ...supportedTypes.get(type) };
  });
}

function columnOptions(field, database) {
  const options = [];
  if (database !== 'mongodb' && field.sql) options.push(`type: '${field.sql}'`);
  if (field.unique) options.push('unique: true');
  if (field.optional) options.push('nullable: true');
  return options.length ? `{ ${options.join(', ')} }` : '';
}

function renderTypeOrm(name, database, fields) {
  const mongo = database === 'mongodb';
  const imports = mongo
    ? ['Column', 'CreateDateColumn', 'Entity', 'ObjectIdColumn', 'UpdateDateColumn']
    : ['Column', 'CreateDateColumn', 'Entity', 'PrimaryGeneratedColumn', 'UpdateDateColumn'];
  const id = mongo
    ? '  @ObjectIdColumn()\n  _id!: ObjectId;'
    : "  @PrimaryGeneratedColumn('uuid')\n  id!: string;";
  const fieldLines = fields.map((field) => {
    const options = columnOptions(field, database);
    return `  @Column(${options})\n  ${field.name}${field.optional ? '?' : '!'}: ${field.ts};`;
  });
  const table = name.endsWith('s') ? name : `${name}s`;
  return `import { ${imports.join(', ')} } from 'typeorm';\n${mongo ? "import { ObjectId } from 'mongodb';\n" : ''}\n@Entity('${table}')\nexport class ${strings.classify(name)} {\n${id}\n${fieldLines.length ? `\n${fieldLines.join('\n\n')}\n` : ''}\n  @CreateDateColumn()\n  createdAt!: Date;\n\n  @UpdateDateColumn()\n  updatedAt!: Date;\n}\n`;
}

function renderPlain(name, fields) {
  const fieldLines = fields.map((field) => `  ${field.name}${field.optional ? '?' : '!'}: ${field.ts};`);
  return `export class ${strings.classify(name)} {\n  id!: string;\n${fieldLines.length ? `\n${fieldLines.join('\n')}\n` : ''}\n  createdAt!: Date;\n  updatedAt!: Date;\n}\n`;
}

export default function entity(options) {
  return (tree, context) => {
    const { name, owner } = location(tree, options);
    const database = detectDatabase(tree, options.database);
    const fields = parseFields(options.fields);
    const path = `/${owner}/entities/${name}.entity.ts`;
    if (tree.exists(path)) throw new Error(`Refusing to overwrite existing entity: ${path}`);
    if (database === 'plain') {
      context.logger.warn('No configured database was detected; generating a plain entity. Use --database to select a persistence template.');
    } else if (database === 'mongodb') {
      context.logger.info('Using MongoDB ObjectId for the entity primary key.');
    } else {
      context.logger.info(`Using a UUID primary key for the ${database} entity.`);
    }
    tree.create(path, database === 'plain' ? renderPlain(name, fields) : renderTypeOrm(name, database, fields));
    return tree;
  };
}
