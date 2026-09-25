// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'out-tsc/**', '.angular/**', 'node_modules/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // Le préfixe `ng` est historique pour cette lib (<ng-table>) : le renommer
      // casserait tous les consommateurs.
      '@angular-eslint/component-selector': ['error', {type: 'element', prefix: ['ng', 'app'], style: 'kebab-case'}],
      '@angular-eslint/directive-selector': ['error', {type: 'attribute', prefix: ['ngTable', 'app'], style: 'camelCase'}],
      // Typage générique en place (ROADMAP D1) : tout `any` restant doit être justifié
      // par un `eslint-disable` commenté.
      '@typescript-eslint/no-explicit-any': 'error',
      // Un paramètre préfixé `_` est volontairement ignoré (signature imposée par Material).
      '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
);
