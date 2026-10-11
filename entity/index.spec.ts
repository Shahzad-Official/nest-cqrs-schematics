import { HostTree } from '@angular-devkit/schematics';
import { SchematicTestRunner } from '@angular-devkit/schematics/testing';
import { fileURLToPath } from 'node:url';

const collectionPath = fileURLToPath(new URL('../collection.json', import.meta.url));

function project(database?: 'postgres' | 'mysql' | 'mongodb'): HostTree {
  const tree = new HostTree();
  tree.create('/nest-cli.json', JSON.stringify({ sourceRoot: 'src' }));
  tree.create('/package.json', JSON.stringify({ dependencies: database ? { typeorm: '^1', [database === 'postgres' ? 'pg' : database === 'mysql' ? 'mysql2' : 'mongodb']: '^1' } : {} }));
  if (database) tree.create('/.nest-cqrs.json', JSON.stringify({ presets: { database: { type: database } } }));
  return tree;
}

describe('entity schematic', () => {
  it('generates a UUID entity for a relational database', async () => {
    const runner = new SchematicTestRunner('cqrs-schematics', collectionPath);
    const tree = await runner.runSchematic('entity', {
      name: 'features/products/product',
    }, project('postgres'));
    const entity = tree.readContent('/src/features/products/entities/product.entity.ts');

    expect(entity).toContain("@Entity('products')");
    expect(entity).toContain("@PrimaryGeneratedColumn('uuid')");
    expect(entity).toContain('createdAt!: Date');
  });

  it('generates an ObjectId entity for MongoDB', async () => {
    const runner = new SchematicTestRunner('cqrs-schematics', collectionPath);
    const tree = await runner.runSchematic('entity', { name: 'product' }, project('mongodb'));
    const entity = tree.readContent('/src/entities/product.entity.ts');

    expect(entity).toContain("import { ObjectId } from 'mongodb'");
    expect(entity).toContain('@ObjectIdColumn()');
    expect(entity).toContain('_id!: ObjectId');
  });

  it('adds only explicitly requested fields', async () => {
    const runner = new SchematicTestRunner('cqrs-schematics', collectionPath);
    const tree = await runner.runSchematic('entity', {
      name: 'product',
      database: 'mysql',
      fields: 'name:string:unique,price:decimal,description?:text',
    }, project());
    const entity = tree.readContent('/src/entities/product.entity.ts');

    expect(entity).toContain('@Column({ unique: true })');
    expect(entity).toContain('name!: string');
    expect(entity).toContain("@Column({ type: 'decimal' })");
    expect(entity).toContain("@Column({ type: 'text', nullable: true })");
  });

  it('falls back to a plain entity when no database is configured', async () => {
    const runner = new SchematicTestRunner('cqrs-schematics', collectionPath);
    const tree = await runner.runSchematic('entity', { name: 'product' }, project());
    const entity = tree.readContent('/src/entities/product.entity.ts');

    expect(entity).toContain('id!: string');
    expect(entity).not.toContain('typeorm');
  });
});
