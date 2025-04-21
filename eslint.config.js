import globals from 'globals';
import pluginVue from 'eslint-plugin-vue';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import oxlint from 'eslint-plugin-oxlint';
import eslintImport from 'eslint-plugin-import';

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  {
    name: 'app/files-to-ignore',
    ignores: [
      '**/.local/**',
      '**/coverage/**',
      '**/dist-ssr/**',
      '**/dist/**',
      '**/vendor/**',
    ],
  },

  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  ...oxlint.configs['flat/recommended'],

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
      'import/no-unresolved': ['off'], // off for it is problematic
      'indent': ['error', 2, { SwitchCase: 1 }],
      'no-constant-binary-expression': ['off'],
      'no-unused-vars': ['warn', { args: 'none' }],
      'quote-props': ['error', 'consistent-as-needed'],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
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
);
