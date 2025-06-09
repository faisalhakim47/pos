// @ts-check

import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

const __dirname = new URL('.', import.meta.url).pathname;
const testRunId = Date.now().toString(36).toLowerCase();

class TestFixture {
  /**
   * @param {string} label
   */
  constructor(label) {
    this.label = label.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    this.testRunId = testRunId;
    this.coreAccountingPath = join(__dirname, '001_core_accounting.sql');
    this.productSchemaPath = join(__dirname, '004_product_management.sql');
    this.taxSchemaPath = join(__dirname, '010_tax_management.sql');
    this.db = null;
    this.dbPath = null;
  }

  async setup() {
    const coreAccountingContent = await readFile(this.coreAccountingPath, { encoding: 'utf8' });
    const productContent = await readFile(this.productSchemaPath, { encoding: 'utf8' });
    const taxContent = await readFile(this.taxSchemaPath, { encoding: 'utf8' });
    const tempDir = join(tmpdir(), 'pos-sql-tests');
    await mkdir(tempDir, { recursive: true });
    this.dbPath = join(tempDir, `${this.testRunId}_tax_${this.label}.db`);
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(coreAccountingContent);
    this.db.exec(productContent);
    this.db.exec(taxContent);
    return this.db;
  }

  close() {
    if (this.db) this.db.close();
  }
}

test('Tax code and rate creation', async function (t) {
  const fx = new TestFixture('tax_code_and_rate_creation');
  const db = await fx.setup();
  db.exec('insert into tax_code (code, name) values (\'vat\', \'Value Added Tax\');');
  db.exec('insert into tax_rate (tax_code_code, rate_percent, valid_from) values (\'vat\', 10.0, 1700000000);');
  const row = db.prepare('select * from tax_rate where tax_code_code = \'vat\'')?.get() ?? {};
  t.assert.equal(row.rate_percent, 10.0);
  fx.close();
});

test('Product taxability matrix', async function (t) {
  const fx = new TestFixture('product_taxability');
  const db = await fx.setup();
  // Insert a product with required fields
  const category = db.prepare('select id from product_category limit 1')?.get() ?? {};
  const now = Math.floor(Date.now() / 1000);
  const productId = db.prepare('insert into product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) values (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('P1', 'Test Product', category.id, 10300, 50100, 40100, now, now).lastInsertRowid;
  db.exec('insert into tax_code (code, name) values (\'gst\', \'Goods and Services Tax\');');
  db.exec(`insert into product_taxability (product_id, tax_code_code, is_taxable) values (${productId}, 'gst', 1);`);
  const row = db.prepare('select * from product_taxability where product_id = ?')?.get(productId) ?? {};
  t.assert.equal(row.is_taxable, 1);
  fx.close();
});

test('Tax jurisdiction and exemption', async function (t) {
  const fx = new TestFixture('tax_jurisdiction_exemption');
  const db = await fx.setup();
  db.exec('insert into tax_jurisdiction (name, region_code, country_code) values (\'Jakarta\', \'JK\', \'ID\');');
  db.exec('insert into tax_code (code, name) values (\'ppn\', \'Pajak Pertambahan Nilai\');');
  db.exec('insert into entity_tax_exemption (entity_type, entity_id, tax_code_code, jurisdiction_id, exemption_reason, valid_from, is_active) values (\'customer\', 123, \'ppn\', 1, \'Non-profit\', 1700000000, 1);');
  const row = db.prepare('select * from entity_tax_exemption where entity_id = 123')?.get() ?? {};
  t.assert.equal(row.exemption_reason, 'Non-profit');
  fx.close();
});
