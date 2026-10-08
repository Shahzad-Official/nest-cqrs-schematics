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
import { isEsmProject } from '@nestjs/schematics/dist/utils/source-root.helpers.js';

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
  const spec = options.spec !== false;

  const featurePath = `src/features/${feature}`;

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
          return spec || !path.endsWith('.spec.ts.template');
        }),
        template({ ...strings, feature, name, crud, spec }),
        renameTemplateFiles(),
        move(featurePath),
      ]),
    ),
  ]);
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
      isEsm: isEsmProject(tree),
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
