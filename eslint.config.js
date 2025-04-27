import { defineConfig } from 'eslint/config';
import globals from 'globals';
import pluginVue from 'eslint-plugin-vue';
import pluginOxlint from 'eslint-plugin-oxlint';
import eslintImport from 'eslint-plugin-import';

export default defineConfig([
  {
    name: 'app/files-to-lint',
    files: ['**/*.{js,vue}'],
  },

  {
    name: 'app/files-to-ignore',
    ignores: [
      '**/.local/**',
      '**/coverage/**',
      '**/dist-ssr/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/vendor/**',
    ],
  },

  pluginVue.configs['flat/essential'],
  ...pluginOxlint.configs['flat/recommended'],

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
      '@typescript-eslint/no-unused-vars': ['warn', { args: 'none' }],
      'comma-dangle': ['error', 'always-multiline'],
      'import/no-unresolved': ['off'],
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
      'indent': ['error', 2, { SwitchCase: 1 }],
      'no-constant-binary-expression': ['off'],
      'no-unused-vars': ['warn', { args: 'none' }],
      'quote-props': ['error', 'consistent-as-needed'],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
    },
  },
]);
