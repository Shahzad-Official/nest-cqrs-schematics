import { generatorAliases, parseArgs, printHelp } from './nest-cqrs.js';

describe('nest-cqrs CLI', () => {
  it('prints structured help and its version', () => {
    const output: string[] = [];
    const log = console.log;
    console.log = (value = '') => output.push(String(value));
    try {
      printHelp();
    } finally {
      console.log = log;
    }
    const help = output.join('\n');

    expect(help).toContain('Commands:');
    expect(help).toContain('Generators:');
    expect(help).toContain('generate <type> <path/name>');
    expect(help).toContain('cmd, c');
    expect(help).toContain('g c features/products/create-product');
    expect(help).toContain('g e product -b mongodb -d');
  });

  it('accepts generator and option aliases', () => {
    const options = parseArgs([
      'g', 'e', 'catalog/product', '-b', 'postgres', '-F', 'name:string', '-d',
    ]);

    expect(options).toMatchObject({
      name: 'g',
      generator: 'e',
      requestName: 'catalog/product',
      databaseType: 'postgres',
      fields: 'name:string',
      dryRun: true,
    });
    expect(generatorAliases.e).toBe('entity');
    expect(generatorAliases.q).toBe('query');
    expect(generatorAliases.c).toBe('command');
  });
});
