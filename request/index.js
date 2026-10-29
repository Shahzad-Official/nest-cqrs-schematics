import { strings } from '@angular-devkit/core';
import { apply, chain, mergeWith, move, renameTemplateFiles, template, url } from '@angular-devkit/schematics';
import { ModuleDeclarator } from '@nestjs/schematics/dist/utils/module.declarator.js';

function normalizeName(value, kind) {
  const name = strings.dasherize(value.trim());
  const suffix = `-${kind}`;
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

function sourceRoot(tree) {
  try {
    return strings.dasherize(
      JSON.parse(tree.read('/nest-cli.json')?.toString() ?? '{}').sourceRoot || 'src',
    );
  } catch {
    return 'src';
  }
}

function requestLocation(tree, options, kind) {
  if (options.feature) {
    const feature = strings.dasherize(options.feature.trim());
    return {
      name: normalizeName(options.name, kind),
      ownerPath: `${sourceRoot(tree)}/features/${feature}`,
    };
  }

  const parts = options.name.trim().replace(/\\/g, '/').split('/').filter(Boolean);
  const rawName = parts.pop();
  if (!rawName) throw new Error(`${kind} name is required.`);
  return {
    name: normalizeName(rawName, kind),
    ownerPath: [sourceRoot(tree), ...parts.map(strings.dasherize)].join('/'),
  };
}

function findNearestModule(tree, ownerPath) {
  const files = [];
  tree.visit((path) => files.push(path));
  const candidates = files
    .filter((path) => path.endsWith('.module.ts'))
    .filter((path) => {
      const directory = path.slice(1, path.lastIndexOf('/'));
      return ownerPath === directory || ownerPath.startsWith(`${directory}/`);
    })
    .sort((left, right) => right.lastIndexOf('/') - left.lastIndexOf('/'));
  return candidates[0];
}

function usesEsmImports(tree) {
  try {
    const packageJson = JSON.parse(tree.read('/package.json')?.toString() ?? '{}');
    if (packageJson.type === 'module') return true;
    const tsconfig = JSON.parse(tree.read('/tsconfig.json')?.toString() ?? '{}');
    const moduleKind = String(tsconfig.compilerOptions?.module ?? '').toLowerCase();
    const moduleResolution = String(tsconfig.compilerOptions?.moduleResolution ?? '').toLowerCase();
    return moduleResolution !== 'bundler'
      && ['es2015', 'es2020', 'es2022', 'es6', 'esnext'].includes(moduleKind);
  } catch {
    return false;
  }
}

function generate(kind, options) {
  return (tree, context) => {
    const { name, ownerPath } = requestLocation(tree, options, kind);
    const directory = kind === 'query' ? 'queries' : 'commands';
    const requestPath = `${ownerPath}/${directory}/${name}`;
    const modulePath = findNearestModule(tree, ownerPath);
    const symbol = `${strings.classify(name)}Handler`;
    const generatedPaths = [
      `/${requestPath}/${name}.${kind}.ts`,
      `/${requestPath}/${name}.handler.ts`,
    ];
    const collision = generatedPaths.find((path) => tree.exists(path));
    if (collision) throw new Error(`Refusing to overwrite existing file: ${collision}`);

    const esm = usesEsmImports(tree);
    return chain([
      mergeWith(apply(url(`./files/${kind}`), [
        template({ ...strings, name, kind, esm }),
        renameTemplateFiles(),
        move(requestPath),
      ])),
      (updatedTree) => {
        if (!modulePath) return updatedTree;
        const content = updatedTree.read(modulePath)?.toString();
        if (!content) throw new Error(`Unable to read feature module: ${modulePath}`);
        let updated = new ModuleDeclarator().declare(content, {
          module: modulePath,
          path: requestPath,
          name: `${name}.handler${esm ? '.js' : ''}`,
          className: symbol,
          metadata: 'providers',
          symbol,
        });
        if (/const\s+handlers\s*=\s*\[/.test(content)) {
          updated = updated.replace(
            /const\s+handlers\s*=\s*\[/,
            (opening) => `${opening}\n  ${symbol},`,
          );
        }
        updatedTree.overwrite(modulePath, updated);
        return updatedTree;
      },
    ])(tree, context);
  };
}

export const command = (options) => generate('command', options);
export const query = (options) => generate('query', options);
