import {chain, Rule, SchematicContext, SchematicsException, Tree} from '@angular-devkit/schematics';
import {addDependency, addRootProvider, DependencyType, ExistingBehavior, InstallBehavior, readWorkspace} from '@schematics/angular/utility';

export interface NgAddOptions {
  project?: string;
  locale?: 'none' | 'fr' | 'en' | 'es' | 'de' | 'ar';
  skipInstall?: boolean;
}

const PACKAGE = '@sbourahla/ng-table';
/** Langues qui se lisent de droite à gauche parmi celles que la bibliothèque livre. */
const RTL_LOCALES = new Set(['ar']);

/** Version de `@angular/core` du projet (ex. `^22.0.0`) : `@angular/cdk` doit suivre la même majeure. */
function angularVersion(tree: Tree): string {
  const buffer = tree.read('package.json');
  if (!buffer) {
    throw new SchematicsException('package.json introuvable : lancez `ng add` à la racine du projet Angular.');
  }
  const json = JSON.parse(buffer.toString()) as {dependencies?: Record<string, string>; devDependencies?: Record<string, string>};
  const version = json.dependencies?.['@angular/core'] ?? json.devDependencies?.['@angular/core'];
  if (!version) {
    throw new SchematicsException('@angular/core est absent de package.json : ce n\'est pas un projet Angular.');
  }
  return version;
}

/** Pose `lang` et `dir="rtl"` sur la balise `<html>` de la page d'entrée. Renvoie `false` si la page n'a pas pu être modifiée. */
function setHtmlLanguage(tree: Tree, indexPath: string, locale: string): boolean {
  const buffer = tree.read(indexPath);
  if (!buffer) {
    return false;
  }
  const html = buffer.toString();
  const match = /<html\b([^>]*)>/i.exec(html);
  if (!match) {
    return false;
  }
  let attributes = match[1].replace(/\s(lang|dir)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  attributes += ` lang="${locale}"`;
  if (RTL_LOCALES.has(locale)) {
    attributes += ' dir="rtl"';
  }
  tree.overwrite(indexPath, html.replace(match[0], `<html${attributes}>`));
  return true;
}

export function ngAdd(options: NgAddOptions): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    const workspace = await readWorkspace(tree);
    const projectName =
      options.project ??
      [...workspace.projects.entries()].find(([, definition]) => definition.extensions['projectType'] === 'application')?.[0];
    if (!projectName || !workspace.projects.has(projectName)) {
      throw new SchematicsException(options.project ? `Projet « ${options.project} » introuvable.` : 'Aucune application trouvée dans angular.json.');
    }
    const locale = options.locale && options.locale !== 'none' ? options.locale : null;
    const install = options.skipInstall ? InstallBehavior.None : InstallBehavior.Auto;

    const rules: Rule[] = [
      // `@sbourahla/ng-table` est déjà ajouté par `ng add` ; son seul pair non installé par défaut est le CDK.
      addDependency('@angular/cdk', angularVersion(tree), {type: DependencyType.Default, existing: ExistingBehavior.Skip, install}),
    ];

    if (locale) {
      rules.push(
        addRootProvider(projectName, ({code, external}) => code`${external('provideNgTableLabels', PACKAGE)}(() => ${external('NG_TABLE_LOCALES', PACKAGE)}['${locale}'])`),
      );
      // index est omis de angular.json quand c'est la valeur par défaut (<sourceRoot>/index.html).
      const definition = workspace.projects.get(projectName);
      const configured = definition?.targets.get('build')?.options?.['index'];
      const indexPath = typeof configured === 'string' ? configured : `${definition?.sourceRoot ?? 'src'}/index.html`;
      rules.push((host: Tree) => {
        if (!setHtmlLanguage(host, indexPath, locale)) {
          context.logger.warn(`Ajoutez lang="${locale}"${RTL_LOCALES.has(locale) ? ' dir="rtl"' : ''} à la balise <html> de ${indexPath}.`);
        }
      });
    } else {
      context.logger.info('Textes en français par défaut. Pour une autre langue : provideNgTableLabels(() => NG_TABLE_LOCALES.en) (fr, en, es, de, ar).');
    }

    context.logger.info(`ng-table prêt dans « ${projectName} » : importez NgTableComponent dans un composant standalone.`);
    return chain(rules);
  };
}