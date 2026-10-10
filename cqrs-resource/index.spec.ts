import { HostTree } from '@angular-devkit/schematics';
import { SchematicTestRunner } from '@angular-devkit/schematics/testing';
import { fileURLToPath } from 'node:url';

const collectionPath = fileURLToPath(
  new URL('../collection.json', import.meta.url),
);

describe('cqrs-resource schematic', () => {
  function nestProjectTree(appModule = ''): HostTree {
    const tree = new HostTree();
    tree.create('/package.json', JSON.stringify({ type: 'module' }));
    tree.create('/nest-cli.json', JSON.stringify({ sourceRoot: 'src' }));
    tree.create(
      '/src/app.module.ts',
      appModule ||
        "import { Module } from '@nestjs/common';\n\n@Module({})\nexport class AppModule {}\n",
    );
    return tree;
  }

  it('generates the complete CQRS CRUD scaffold', async () => {
    const runner = new SchematicTestRunner('project-schematics', collectionPath);
    const tree = await runner.runSchematic('cqrs-resource', {
      name: 'stock-items',
    });
    const root = '/src/features/stock-items';

    expect(tree.files).toHaveLength(21);
    expect(tree.files).toEqual(
      expect.arrayContaining([
        `${root}/stock-items.module.ts`,
        `${root}/controllers/stock-items.controller.ts`,
        `${root}/dtos/create-stock-item.dto.ts`,
        `${root}/dtos/update-stock-item.dto.ts`,
        `${root}/dtos/stock-item-params.dto.ts`,
        `${root}/entities/stock-item.entity.ts`,
        `${root}/commands/create-stock-item/create-stock-item.command.ts`,
        `${root}/commands/create-stock-item/create-stock-item.handler.ts`,
        `${root}/commands/create-stock-item/create-stock-item.handler.spec.ts`,
        `${root}/commands/update-stock-item/update-stock-item.command.ts`,
        `${root}/commands/delete-stock-item/delete-stock-item.command.ts`,
        `${root}/queries/get-stock-item/get-stock-item.query.ts`,
        `${root}/queries/list-stock-items/list-stock-items.query.ts`,
      ]),
    );

    const module = tree.readContent(`${root}/stock-items.module.ts`);
    expect(module).toContain('export class StockItemsModule');
    expect(module).toContain('CreateStockItemHandler');
    expect(module).toContain('ListStockItemsHandler');

    const controller = tree.readContent(
      `${root}/controllers/stock-items.controller.ts`,
    );
    expect(controller).toContain("@Controller('stock-items')");
    expect(controller).toContain('private readonly commandBus: CommandBus');
    expect(controller).toContain('private readonly queryBus: QueryBus');
    expect(controller).toContain('new CreateStockItemCommand(createStockItemDto)');
    expect(controller).toContain("from '../dtos/create-stock-item.dto'");

    const paramsDto = tree.readContent(
      `${root}/dtos/stock-item-params.dto.ts`,
    );
    expect(paramsDto).toContain('@IsUUID()');
  });

  it('omits handler specs when tests are disabled', async () => {
    const runner = new SchematicTestRunner('cqrs-schematics', collectionPath);
    const tree = await runner.runSchematic('cqrs-resource', {
      name: 'orders',
      spec: false,
    });

    expect(tree.files).toHaveLength(16);
    expect(tree.files.some((file) => file.endsWith('.spec.ts'))).toBe(false);
    expect(tree.files).toContain('/src/features/orders/orders.module.ts');
  });

  it('generates only a module and entity when CRUD is disabled', async () => {
    const runner = new SchematicTestRunner('cqrs-schematics', collectionPath);
    const tree = await runner.runSchematic('cqrs-resource', {
      name: 'orders',
      crud: false,
    });

    expect(tree.files).toEqual([
      '/src/features/orders/orders.module.ts',
      '/src/features/orders/entities/order.entity.ts',
    ]);
    expect(tree.readContent('/src/features/orders/orders.module.ts')).toContain(
      'export class OrdersModule',
    );
  });

  it('registers a CRUD feature module in AppModule with an ESM import', async () => {
    const runner = new SchematicTestRunner('cqrs-schematics', collectionPath);
    const tree = await runner.runSchematic(
      'cqrs-resource',
      { name: 'stock-items' },
      nestProjectTree(),
    );
    const appModule = tree.readContent('/src/app.module.ts');

    expect(appModule).toContain(
      "import { StockItemsModule } from './features/stock-items/stock-items.module.js';",
    );
    expect(appModule).toContain('imports: [StockItemsModule]');
    expect(
      tree.readContent('/src/features/stock-items/controllers/stock-items.controller.ts'),
    ).toContain("from '../dtos/create-stock-item.dto.js'");
  });

  it('keeps extensionless imports in a CommonJS project', async () => {
    const runner = new SchematicTestRunner('cqrs-schematics', collectionPath);
    const input = nestProjectTree();
    input.overwrite('/package.json', JSON.stringify({}));
    const tree = await runner.runSchematic(
      'cqrs-resource',
      { name: 'orders' },
      input,
    );

    expect(tree.readContent('/src/app.module.ts')).toContain(
      "from './features/orders/orders.module';",
    );
    expect(
      tree.readContent('/src/features/orders/controllers/orders.controller.ts'),
    ).toContain("from '../dtos/create-order.dto'");
  });

  it('adds OpenAPI metadata when Swagger is installed in the app', async () => {
    const runner = new SchematicTestRunner('cqrs-schematics', collectionPath);
    const input = nestProjectTree();
    input.overwrite(
      '/package.json',
      JSON.stringify({ type: 'module', dependencies: { '@nestjs/swagger': '^12.0.0' } }),
    );
    const tree = await runner.runSchematic(
      'cqrs-resource',
      { name: 'orders' },
      input,
    );

    const controller = tree.readContent('/src/features/orders/controllers/orders.controller.ts');
    const createDto = tree.readContent('/src/features/orders/dtos/create-order.dto.ts');
    expect(controller).toContain("@ApiTags('orders')");
    expect(controller).toContain("@ApiOperation({ summary: 'Create order' })");
    expect(controller).toContain('@ApiSuccessEnvelope({ status: 201');
    expect(controller).toContain("@ApiErrorEnvelope(400, 'Invalid request body')");
    expect(createDto).toContain("import { ApiProperty } from '@nestjs/swagger'");
    expect(createDto).toContain("@ApiProperty({ example: 'Example' })");
  });

  it('registers a no-CRUD feature without duplicating an existing import', async () => {
    const runner = new SchematicTestRunner('cqrs-schematics', collectionPath);
    const existingModule = `import { Module } from '@nestjs/common';
import { OrdersModule } from './features/orders/orders.module.js';

@Module({})
export class AppModule {}
`;
    const tree = await runner.runSchematic(
      'cqrs-resource',
      { name: 'orders', crud: false },
      nestProjectTree(existingModule),
    );
    const appModule = tree.readContent('/src/app.module.ts');

    expect(appModule.match(/import \{ OrdersModule \}/g)).toHaveLength(1);
    expect(appModule).toContain('imports: [OrdersModule]');
  });
});
