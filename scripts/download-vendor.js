#!/usr/bin/env node

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const __dirname = new URL('.', import.meta.url).pathname;

const vendors = [
  { url: 'https://cdn.jsdelivr.net/npm/@antonz/sqlean@3.47.1-rc1/dist/sqlean.d.ts', path: join(__dirname, '../src/vendor/@antonz/sqlean/dist/sqlean.d.ts') },
  { url: 'https://cdn.jsdelivr.net/npm/@antonz/sqlean@3.47.1-rc1/dist/sqlean.dev.mjs', path: join(__dirname, '../src/vendor/@antonz/sqlean/dist/sqlean.js') },
  { url: 'https://cdn.jsdelivr.net/npm/@antonz/sqlean@3.47.1-rc1/dist/sqlean.wasm', path: join(__dirname, '../src/vendor/@antonz/sqlean/dist/sqlean.wasm') },
];

await Promise.all(vendors.map(async function (vendor) {
  const fileResp = await fetch(vendor.url);
  const fileContent = await fileResp.text();
  const fileDir = dirname(vendor.path);
  await mkdir(fileDir, { recursive: true });
  await writeFile(vendor.path, fileContent);
  console.info(`${vendor.path}`);
}));
