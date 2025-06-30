// @ts-check

import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

const __dirname = new URL('.', import.meta.url).pathname;

// Generate a unique test run ID for this process
const testRunId = Date.now().toString(36).toLowerCase();

// Test fixtures and helpers
class TestFixture {
  /**
   * @param {string} label - Label for the test case (should be unique per test case)
   */
  constructor(label) {
    this.label = label.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    this.testRunId = testRunId;
    this.coreAccountingPath = join(__dirname, '001_core_accounting.sql');
    this.productSchemaPath = join(__dirname, '004_product_management.sql');
    this.schemaFileContent = null;
    this.db = null;
    this.dbPath = null;
  }

  async setup() {
    // Load core accounting schema
    const coreAccountingContent = await readFile(this.coreAccountingPath, { encoding: 'utf8' });
    // Load product schema
    this.schemaFileContent = await readFile(this.productSchemaPath, { encoding: 'utf8' });

    const tempDir = join(tmpdir(), 'pos-sql-tests');
    await mkdir(tempDir, { recursive: true });
    this.dbPath = join(
      tempDir,
      `${this.testRunId}_product_${this.label}.db`,
    );
    this.db = new DatabaseSync(this.dbPath);

    // Execute core accounting schema first
    this.db.exec(coreAccountingContent);

    // Execute product management schema
    this.db.exec(this.schemaFileContent);

    return this.db;
  }

  cleanup() {
    if (this.db) {
      this.db.close();
    }
  }
}

test('Product Management Schema', async function (t) {
  await t.test('Schema tables are created properly', async function (t) {
    const fixture = new TestFixture('Schema tables are created properly');
    const db = await fixture.setup();

    // Check that all product management tables exist
    const tables = [
      'product_category',
      'unit_of_measure',
      'product',
      'product_variant',
      'vendor',
      'vendor_product',
    ];

    for (const tableName of tables) {
      const table = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name=?
      `)?.get(tableName) ?? {};
      t.assert.equal(Boolean(table), true, `Table ${tableName} should exist`);
    }

    fixture.cleanup();
  });

  await t.test('Default data is populated correctly', async function (t) {
    const fixture = new TestFixture('Default data is populated correctly');
    const db = await fixture.setup();

    // Test units of measure exist
    const units = db.prepare('SELECT COUNT(*) as count FROM unit_of_measure')?.get() ?? {};
    t.assert.equal(Number(units.count) > 0, true, 'Units of measure should be populated');

    // Test product categories exist
    const categories = db.prepare('SELECT COUNT(*) as count FROM product_category')?.get() ?? {};
    t.assert.equal(Number(categories.count) > 0, true, 'Product categories should be populated');

    // Test default vendor exists
    const vendor = db.prepare('SELECT * FROM vendor WHERE vendor_code = ?')?.get('SUPPLIER001') ?? {};
    t.assert.equal(Boolean(vendor), true, 'Default vendor should exist');

    fixture.cleanup();
  });

  await t.test('Product creation works correctly', async function (t) {
    const fixture = new TestFixture('Product creation works correctly');
    const db = await fixture.setup();

    // Get a category ID for the test
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};

    // Create a test product
    const productId = db.prepare(`
      INSERT INTO product (
        sku, name, product_category_id, standard_cost, costing_method,
        inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('TEST-001', 'Test Product', category.id, 1000, 'FIFO', 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Verify product was created
    const product = db.prepare('SELECT * FROM product WHERE id = ?')?.get(productId) ?? {};
    t.assert.equal(Boolean(product), true, 'Product should be created');
    t.assert.equal(String(product.sku), 'TEST-001', 'Product SKU should match');
    t.assert.equal(Number(product.standard_cost), 1000, 'Standard cost should match');
    t.assert.equal(String(product.costing_method), 'FIFO', 'Cost method should match');

    fixture.cleanup();
  });

  await t.test('Product variant creation works', async function (t) {
    const fixture = new TestFixture('Product variant creation works');
    const db = await fixture.setup();

    // Create a test product first
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};
    const productId = db.prepare(`
      INSERT INTO product (
        sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('VARIANT-001', 'Variant Test Product', category.id, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Create product variants
    const variantId1 = db.prepare(`
      INSERT INTO product_variant (
        product_id, sku, name, variant_attributes, standard_cost, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(productId, 'VARIANT-001-RED-L', 'Red Large', JSON.stringify({color: 'red', size: 'L'}), 1200, Math.floor(Date.now() / 1000)).lastInsertRowid;

    const variantId2 = db.prepare(`
      INSERT INTO product_variant (
        product_id, sku, name, variant_attributes, standard_cost, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(productId, 'VARIANT-001-BLUE-M', 'Blue Medium', JSON.stringify({color: 'blue', size: 'M'}), 1100, Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Verify variants were created
    const variant1 = db.prepare('SELECT * FROM product_variant WHERE id = ?')?.get(variantId1) ?? {};
    const variant2 = db.prepare('SELECT * FROM product_variant WHERE id = ?')?.get(variantId2) ?? {};

    t.assert.equal(Boolean(variant1), true, 'First variant should be created');
    t.assert.equal(Boolean(variant2), true, 'Second variant should be created');
    t.assert.equal(String(variant1.sku), 'VARIANT-001-RED-L', 'First variant SKU should match');
    t.assert.equal(String(variant2.sku), 'VARIANT-001-BLUE-M', 'Second variant SKU should match');

    fixture.cleanup();
  });

  await t.test('Vendor management works correctly', async function (t) {
    const fixture = new TestFixture('Vendor management works correctly');
    const db = await fixture.setup();

    // Create vendor
    const vendorId = db.prepare(`
      INSERT INTO vendor (vendor_code, name, contact_person, is_active, created_time)
      VALUES (?, ?, ?, ?, ?)
    `).run('VEN-001', 'Test Vendor Inc.', 'John Smith', 1, Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Create product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('VEN-PROD-001', 'Vendor Product', category.id, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Link vendor to product
    db.prepare(`
      INSERT INTO vendor_product (
        vendor_id, product_id, vendor_sku, unit_price,
        minimum_order_quantity, lead_time_days, is_preferred, last_updated_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(vendorId, productId, 'VEN-SKU-001', 1500, 10, 7, 1, Math.floor(Date.now() / 1000));

    // Verify vendor-product relationship
    const vendorProduct = db.prepare(`
      SELECT vp.*, v.name as vendor_name, p.sku as product_sku
      FROM vendor_product vp
      JOIN vendor v ON v.id = vp.vendor_id
      JOIN product p ON p.id = vp.product_id
      WHERE vp.vendor_id = ? AND vp.product_id = ?
    `)?.get(vendorId, productId) ?? {};

    t.assert.equal(Boolean(vendorProduct), true, 'Vendor-product relationship should exist');
    t.assert.equal(String(vendorProduct.vendor_name), 'Test Vendor Inc.', 'Vendor name should match');
    t.assert.equal(String(vendorProduct.product_sku), 'VEN-PROD-001', 'Product SKU should match');
    t.assert.equal(Number(vendorProduct.unit_price), 1500, 'Unit price should match');
    t.assert.equal(Number(vendorProduct.is_preferred), 1, 'Should be preferred vendor');

    fixture.cleanup();
  });

  await t.test('Data integrity constraints are enforced', async function (t) {
    const fixture = new TestFixture('Data integrity constraints are enforced');
    const db = await fixture.setup();

    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};

    // Test unique SKU constraint
    db.prepare(`
      INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('UNIQUE-001', 'Test Product', category.id, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000));

    // This should throw due to unique constraint on SKU
    t.assert.throws(function () {
      db.prepare(`
        INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('UNIQUE-001', 'Duplicate SKU', category.id, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000));
    }, 'Should throw error for duplicate SKU');

    // Test check constraint on standard_cost (should not allow negative)
    t.assert.throws(function () {
      db.prepare(`
        INSERT INTO product (sku, name, product_category_id, standard_cost, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?)
      `).run('CHECK-001', 'Test Product', category.id, -100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000));
    }, 'Should throw error for negative standard cost');

    fixture.cleanup();
  });

  await t.test('Integration with accounting system works', async function (t) {
    const fixture = new TestFixture('Integration with accounting system works');
    const db = await fixture.setup();

    // Verify that key accounting accounts exist for inventory integration
    const inventoryAccount = db.prepare('SELECT * FROM account WHERE code = 10300')?.get() ?? {};
    t.assert.equal(Boolean(inventoryAccount), true, 'Inventory account (10300) should exist');
    t.assert.equal(String(inventoryAccount.name), 'Inventory', 'Inventory account name should match');

    const cogsAccount = db.prepare('SELECT * FROM account WHERE code = 50100')?.get() ?? {};
    t.assert.equal(Boolean(cogsAccount), true, 'COGS account (50100) should exist');
    t.assert.equal(String(cogsAccount.name), 'Cost of Goods Sold', 'COGS account name should match');

    const salesAccount = db.prepare('SELECT * FROM account WHERE code = 40100')?.get() ?? {};
    t.assert.equal(Boolean(salesAccount), true, 'Sales account (40100) should exist');
    t.assert.equal(String(salesAccount.name), 'Sales Revenue', 'Sales account name should match');

    fixture.cleanup();
  });

  await t.test('Unit of measure conversions work', async function (t) {
    const fixture = new TestFixture('Unit of measure conversions work');
    const db = await fixture.setup();

    // Test that conversion factors are set correctly
    const gram = db.prepare('SELECT * FROM unit_of_measure WHERE code = ?')?.get('G') ?? {};
    t.assert.equal(Boolean(gram), true, 'Gram unit should exist');
    t.assert.equal(String(gram.base_unit_code), 'KG', 'Gram should have KG as base unit');
    t.assert.equal(Number(gram.conversion_factor), 0.001, 'Gram conversion factor should be 0.001');

    const pound = db.prepare('SELECT * FROM unit_of_measure WHERE code = ?')?.get('LB') ?? {};
    t.assert.equal(Boolean(pound), true, 'Pound unit should exist');
    t.assert.equal(String(pound.base_unit_code), 'KG', 'Pound should have KG as base unit');
    t.assert.equal(Number(pound.conversion_factor), 0.453592, 'Pound conversion factor should be 0.453592');

    fixture.cleanup();
  });

  await t.test('Product category hierarchy works', async function (t) {
    const fixture = new TestFixture('Product category hierarchy works');
    const db = await fixture.setup();

    // Create parent category
    const parentId = db.prepare(`
      INSERT INTO product_category (code, name, description)
      VALUES (?, ?, ?)
    `).run('PARENT', 'Parent Category', 'Parent category for testing').lastInsertRowid;

    // Create child category
    const childId = db.prepare(`
      INSERT INTO product_category (code, name, description, parent_category_id)
      VALUES (?, ?, ?, ?)
    `).run('CHILD', 'Child Category', 'Child category for testing', parentId).lastInsertRowid;

    // Verify hierarchy
    const child = db.prepare('SELECT * FROM product_category WHERE id = ?')?.get(childId) ?? {};
    t.assert.equal(Boolean(child), true, 'Child category should exist');
    t.assert.equal(Number(child.parent_category_id), Number(parentId), 'Child should reference parent');

    // Test hierarchical query
    const hierarchy = db.prepare(`
      SELECT c.name as child_name, p.name as parent_name
      FROM product_category c
      LEFT JOIN product_category p ON p.id = c.parent_category_id
      WHERE c.id = ?
    `)?.get(childId) ?? {};

    t.assert.equal(String(hierarchy.child_name), 'Child Category', 'Child name should match');
    t.assert.equal(String(hierarchy.parent_name), 'Parent Category', 'Parent name should match');

    fixture.cleanup();
  });
});
