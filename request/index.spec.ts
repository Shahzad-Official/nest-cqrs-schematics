import { HostTree } from '@angular-devkit/schematics';
import { SchematicTestRunner } from '@angular-devkit/schematics/testing';
import { fileURLToPath } from 'node:url';

const collectionPath = fileURLToPath(new URL('../collection.json', import.meta.url));

function featureTree(type = 'module'): HostTree {
  const tree = new HostTree();
  tree.create('/package.json', JSON.stringify(type === 'module' ? { type } : {}));
  tree.create('/nest-cli.json', '{}');
  tree.create(
    '/src/features/orders/orders.module.ts',
    "import { Module } from '@nestjs/common';\n\n@Module({})\nexport class OrdersModule {}\n",
  );
  return tree;
}

describe('CQRS request schematics', () => {
  it('generates a command and registers its handler', async () => {
    const runner = new SchematicTestRunner('cqrs-schematics', collectionPath);
    const tree = await runner.runSchematic(
      'command',
      { name: 'cancel-order', feature: 'orders' },
      featureTree(),
    );

    expect(tree.files).toEqual(expect.arrayContaining([
      '/src/features/orders/commands/cancel-order/cancel-order.command.ts',
      '/src/features/orders/commands/cancel-order/cancel-order.handler.ts',
    ]));
    expect(tree.readContent('/src/features/orders/orders.module.ts')).toContain(
      "import { CancelOrderHandler } from './commands/cancel-order/cancel-order.handler.js';",
    );
    expect(tree.readContent('/src/features/orders/orders.module.ts')).toContain(
      'providers: [CancelOrderHandler]',
    );
    expect(tree.readContent('/src/features/orders/commands/cancel-order/cancel-order.handler.ts')).toContain(
      "from './cancel-order.command.js'",
    );
  });

  it('generates a query with extensionless CommonJS imports', async () => {
    const runner = new SchematicTestRunner('cqrs-schematics', collectionPath);
    const tree = await runner.runSchematic(
      'query',
      { name: 'find-order-query', feature: 'orders' },
      featureTree('commonjs'),
    );

    expect(tree.files).toContain(
      '/src/features/orders/queries/find-order/find-order.query.ts',
    );
    expect(tree.readContent('/src/features/orders/orders.module.ts')).toContain(
      "from './queries/find-order/find-order.handler'",
    );
    expect(tree.readContent('/src/features/orders/queries/find-order/find-order.handler.ts')).toContain(
      "from './find-order.query'",
    );
  });

  it('uses a source-relative path and registers with the nearest module', async () => {
    const runner = new SchematicTestRunner('cqrs-schematics', collectionPath);
    const tree = await runner.runSchematic(
      'query',
      { name: 'features/orders/list-all-orders' },
      featureTree(),
    );

    expect(tree.files).toContain(
      '/src/features/orders/queries/list-all-orders/list-all-orders.query.ts',
    );
    expect(tree.readContent('/src/features/orders/orders.module.ts')).toContain(
      'providers: [ListAllOrdersHandler]',
    );
  });

  it('generates below the source root when only a name is supplied', async () => {
    const runner = new SchematicTestRunner('cqrs-schematics', collectionPath);
    const input = featureTree();
    input.create(
      '/src/app.module.ts',
      "import { Module } from '@nestjs/common';\n\n@Module({})\nexport class AppModule {}\n",
    );
    const tree = await runner.runSchematic(
      'command',
      { name: 'rebuild-index' },
      input,
    );

    expect(tree.files).toContain(
      '/src/commands/rebuild-index/rebuild-index.command.ts',
    );
    expect(tree.readContent('/src/app.module.ts')).toContain(
      'providers: [RebuildIndexHandler]',
    );
  });

  it('refuses to overwrite an existing request', async () => {
    const runner = new SchematicTestRunner('cqrs-schematics', collectionPath);
    const first = await runner.runSchematic(
      'query',
      { name: 'find-order', feature: 'orders' },
      featureTree(),
    );
    await expect(runner.runSchematic(
      'query',
      { name: 'find-order', feature: 'orders' },
      first,
    )).rejects.toThrow('Refusing to overwrite existing file');
  });

  it('adds a handler to the handler array of a generated CQRS resource', async () => {
    const runner = new SchematicTestRunner('cqrs-schematics', collectionPath);
    const resource = await runner.runSchematic('cqrs-resource', { name: 'orders' });
    const tree = await runner.runSchematic(
      'command',
      { name: 'cancel-order', feature: 'orders' },
      resource,
    );
    const module = tree.readContent('/src/features/orders/orders.module.ts');

    expect(module).toContain('const handlers = [\n  CancelOrderHandler,');
    expect(module).toContain('providers: handlers');
  });
});
