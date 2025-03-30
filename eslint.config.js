// @ts-check

import globals from 'globals';
import eslintJs from '@eslint/js';
import eslintImport from 'eslint-plugin-import';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      '**/.local/**',
      '**/webapp/vendor.js',
    ],
  },
  eslintJs.configs.recommended,
  eslintImport.flatConfigs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'comma-dangle': ['error', 'always-multiline'],
      'indent': ['error', 2, { SwitchCase: 1 }],
      'no-unused-vars': ['warn', { args: 'none' }],
      'no-constant-binary-expression': ['off'],
      'semi': ['error', 'always'],
      'quotes': ['error', 'single'],
      'quote-props': ['error', 'consistent-as-needed'],
      'import/no-unresolved': ['off'], // off for it is problematic
      'import/order': ['error', {
        'groups': [
          'builtin',
          'external',
          'parent',
          'sibling',
          'index',
        ],
        'newlines-between': 'always',
      }],
    },
  },
];