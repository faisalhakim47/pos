#!/usr/bin/env node
// @ts-check

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const __dirname = new URL('.', import.meta.url).pathname;

const db = new DatabaseSync(join(__dirname, '../src/assets/pos.db'));

db.exec(await readFile(join(__dirname, '../sqlite/001_core_accounting.sql'), { encoding: 'utf8' }));
db.exec(await readFile(join(__dirname, '../sqlite/002_foreign_exchange.sql'), { encoding: 'utf8' }));
db.exec(await readFile(join(__dirname, '../sqlite/003_asset_register.sql'), { encoding: 'utf8' }));
db.exec(await readFile(join(__dirname, '../sqlite/004_product_management.sql'), { encoding: 'utf8' }));
db.exec(await readFile(join(__dirname, '../sqlite/005_warehouse_management.sql'), { encoding: 'utf8' }));
db.exec(await readFile(join(__dirname, '../sqlite/006_inventory_tracking.sql'), { encoding: 'utf8' }));
db.exec(await readFile(join(__dirname, '../sqlite/007_inventory_transactions.sql'), { encoding: 'utf8' }));
db.exec(await readFile(join(__dirname, '../sqlite/008_inventory_accounting.sql'), { encoding: 'utf8' }));
db.exec(await readFile(join(__dirname, '../sqlite/009_inventory_control.sql'), { encoding: 'utf8' }));
db.exec(await readFile(join(__dirname, '../sqlite/010_tax_management.sql'), { encoding: 'utf8' }));
db.exec(await readFile(join(__dirname, '../sqlite/011_purchase_management.sql'), { encoding: 'utf8' }));
db.exec(await readFile(join(__dirname, '../sqlite/099_finance_reporting.sql'), { encoding: 'utf8' }));

db.close();

console.log('Base SQLite database updated successfully.');
