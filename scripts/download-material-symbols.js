#!/usr/bin/env node
// @ts-check

/**
 * Usage: node scripts/download-material-symbols.js <icon-name>
 * What it does:
 * 1. Downloads the SVG for the specified Material Symbol icon from the Google Material Icons repository.
 * 2. Adds `fill="currentColor"` to the SVG path to ensure it inherits the text color.
 * 3. Saves the SVG file in the `src/assets/material-symbols` directory.
 * 4. Updates the `src/assets/material-symbols.js` file to export the new icon.
 */

import { readdir, writeFile } from 'node:fs/promises';
import { EOL } from 'node:os';
import { join } from 'node:path';
import { argv } from 'node:process';

const __dirname = new URL('.', import.meta.url).pathname;

const [, , iconName] = argv;

if (!iconName) {
  throw new Error('Please provide an icon name as an argument.');
}

const svgResp = await fetch(`https://raw.githubusercontent.com/google/material-design-icons/refs/heads/master/symbols/web/${iconName}/materialsymbolsrounded/${iconName}_fill1_48px.svg`);

if (!svgResp.ok) {
  throw new Error(`Failed to fetch SVG for ${iconName}: ${svgResp.status} ${svgResp.statusText}`);
}

const svgText = await svgResp.text();

const svgTextWithColor = svgText.replace(
  '<path d="',
  '<path fill="currentColor" d="',
);

await writeFile(join(__dirname, '../src/assets/material-symbols', `${iconName}.svg`), svgTextWithColor);

console.info(`Downloaded and saved ${iconName} SVG.`);

let materialSymbolsJs = `// @ts-check${EOL}${EOL}`;

for (const downloadedSvgPath of await readdir(join(__dirname, '../src/assets/material-symbols'))) {
  if (!downloadedSvgPath.endsWith('.svg')) {
    continue; // Skip non-SVG files
  }
  const fileName = downloadedSvgPath.replace('.svg', '');
  const pascalCaseFileName = fileName
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  materialSymbolsJs += `export { default as MaterialSymbol${pascalCaseFileName}Url } from '@/src/assets/material-symbols/${downloadedSvgPath}?url';${EOL}`;
}

await writeFile(join(__dirname, '../src/assets/material-symbols.js'), materialSymbolsJs);

console.info('Updated material-symbols.js with new icon exports.');
