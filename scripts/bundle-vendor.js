// @ts-check

// import { join } from 'node:path';
// import { build } from 'esbuild';

// const __dirname = new URL('.', import.meta.url).pathname;

// await build({
//   entryPoints: [join(__dirname, '../webapp/vendor.ts')],
//   bundle: true,
//   outfile: join(__dirname, '../webapp/dist/vendor.js'),
//   platform: 'browser',
//   keepNames: true,
//   format: 'esm',
//   sourcemap: true,
//   minify: false,
//   treeShaking: true,
//   splitting: false,
// });

import { join } from 'node:path';
import { build } from 'rolldown';

const __dirname = new URL('.', import.meta.url).pathname;

await build({
  input: join(__dirname, '../vendor/solid.ts'),
  platform: 'browser',
  keepNames: true,
  treeshake: true,
  profilerNames: true,
  jsx: false,
  logLevel: 'debug',
  write: true,
  transform: {
    typescript: {
      declaration: {
        sourcemap: true,
      },
    },
  },
  output: {
    file: join(__dirname, '../vendor/solid.js'),
    format: 'esm',
    sourcemap: true,
    minify: false,
    esModule: true,
  },
});
