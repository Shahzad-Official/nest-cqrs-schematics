import { strings } from '@angular-devkit/core';
import {
  apply,
  chain,
  filter,
  mergeWith,
  move,
  renameTemplateFiles,
  template,
  url,
} from '@angular-devkit/schematics';
import { ModuleDeclarator } from '@nestjs/schematics/dist/utils/module.declarator.js';
import { ModuleFinder } from '@nestjs/schematics/dist/utils/module.finder.js';
import { ModuleMetadataDeclarator } from '@nestjs/schematics/dist/utils/module-metadata.declarator.js';

function singularize(value) {
  if (value.endsWith('ies')) return `${value.slice(0, -3)}y`;
  if (value.endsWith('sses')) return value.slice(0, -2);
  if (value.endsWith('s') && !value.endsWith('ss')) return value.slice(0, -1);
  return value;
}

export default function cqrsResource(options) {
  const feature = strings.dasherize(options.name.trim());
  const name = singularize(feature);
  const crud = options.crud !== false;

  const featurePath = `src/features/${feature}`;

  return (tree, context) => {
    const packageFile = tree.read('/package.json');
    const packageJson = packageFile ? JSON.parse(packageFile.toString()) : {};
    const packages = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const swagger = Boolean(packages['@nestjs/swagger']);
    const esm = usesEsmImports(tree);

    return chain([
      registerFeatureModule({ feature, featurePath }),
      mergeWith(
        apply(url('./files'), [
          filter((path) => {
            if (!crud) {
              return (
                path.includes('/entities/') || path.endsWith('.module.ts.template')
              );
            }
            return !path.endsWith('.spec.ts.template');
          }),
          template({ ...strings, feature, name, crud, spec: false, swagger }),
          renameTemplateFiles(),
          move(featurePath),
        ]),
      ),
      applyGeneratedImportStyle({ featurePath, esm }),
    ])(tree, context);
  };
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

function applyGeneratedImportStyle({ featurePath, esm }) {
  return (tree) => {
    if (!esm) return tree;
    const prefix = `/${featurePath}/`;
    const relativeImport = /((?:from\s+|import\s*)['"])(\.{1,2}\/[^'"]+?)(?<!\.js)(['"])/g;
    tree.visit((path) => {
      if (!path.startsWith(prefix) || !path.endsWith('.ts')) return;
      const content = tree.read(path)?.toString();
      if (content) tree.overwrite(path, content.replace(relativeImport, '$1$2.js$3'));
    });
    return tree;
  };
}

function registerFeatureModule({ feature, featurePath }) {
  return (tree) => {
    const parentModule = new ModuleFinder(tree).find({
      name: feature,
      path: featurePath,
    });
    if (!parentModule) return tree;

    const symbol = `${strings.classify(feature)}Module`;
    const options = {
      module: parentModule,
      path: featurePath,
      name: feature,
      type: 'module',
      metadata: 'imports',
      symbol,
      isEsm: usesEsmImports(tree),
    };
    const content = tree.read(parentModule).toString();
    const hasImport = new RegExp(
      `import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from`,
    ).test(content);
    const updated = hasImport
      ? new ModuleMetadataDeclarator().declare(content, options)
      : new ModuleDeclarator().declare(content, options);

    tree.overwrite(parentModule, updated);
    return tree;
  };
}
