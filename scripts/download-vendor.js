#!/usr/bin/env node

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const __dirname = new URL('.', import.meta.url).pathname;

const vendors = [
  { url: 'https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/sql-wasm-debug.wasm', path: join(__dirname, '../src/vendor/sql.js/dist/sql-wasm-debug.wasm') },
  { url: 'https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/sql-wasm.wasm', path: join(__dirname, '../src/vendor/sql.js/dist/sql-wasm.wasm') },
  { url: 'https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/worker.sql-wasm-debug.js', path: join(__dirname, '../src/vendor/sql.js/dist/sql-wasm-debug.js') },
  { url: 'https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/worker.sql-wasm.js', path: join(__dirname, '../src/vendor/sql.js/dist/sql-wasm.js') },
];

await Promise.all(vendors.map(async function (vendor) {
  const fileResp = await fetch(vendor.url);
  const fileContent = await fileResp.text();
  const fileDir = dirname(vendor.path);
  await mkdir(fileDir, { recursive: true });
  await writeFile(vendor.path, fileContent);
  console.info(`${vendor.path}`);
}));
