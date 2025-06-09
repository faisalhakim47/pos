// @ts-check

import { fileURLToPath, URL } from 'node:url';

import vitePluginVue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import vitePluginVueDevTools from 'vite-plugin-vue-devtools';

export default defineConfig({
  appType: 'spa',
  plugins: [
    vitePluginVue(),
    vitePluginVueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  build: {
    assetsDir: '.',
    cssMinify: false,
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    target: 'esnext',
  },
});
