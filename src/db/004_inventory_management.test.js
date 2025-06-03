// @ts-check

import { test } from 'node:test';
import { join } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

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
    this.inventorySchemaPath = join(__dirname, '004_inventory_management.sql');
    this.schemaFileContent = null;
    this.db = null;
    this.dbPath = null;
  }

  async setup() {
    // Load core accounting schema
    const coreAccountingContent = await readFile(this.coreAccountingPath, { encoding: 'utf8' });
    // Load inventory schema
    this.schemaFileContent = await readFile(this.inventorySchemaPath, { encoding: 'utf8' });

    const tempDir = join(tmpdir(), 'pos-sql-tests');
    await mkdir(tempDir, { recursive: true });
    this.dbPath = join(
      tempDir,
      `${this.testRunId}_inventory_${this.label}.db`,
    );
    this.db = new DatabaseSync(this.dbPath);

    // Execute core accounting schema first
    this.db.exec(coreAccountingContent);

    // Execute inventory management schema
    this.db.exec(this.schemaFileContent);

    return this.db;
  }

  cleanup() {
    if (this.db) {
      this.db.close();
    }
  }
}

await test('Inventory Management Schema', async function (t) {
  await t.test('Schema tables are created properly', async function (t) {
    const fixture = new TestFixture('Schema tables are created properly');
    const db = await fixture.setup();

    // Check that all inventory tables exist
    const tables = [
      'product_category',
      'product',
      'product_variant',
      'warehouse',
      'warehouse_location',
      'inventory_stock',
      'inventory_lot',
      'inventory_serial',
      'inventory_transaction',
      'inventory_transaction_line',
      'inventory_cost_layer',
      'vendor',
      'vendor_product',
      'physical_inventory',
      'physical_inventory_count'
    ];

    for (const tableName of tables) {
      const table = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name=?
      `).get(tableName);
      t.assert.ok(table, `Table ${tableName} should exist`);
    }

    fixture.cleanup();
  });

  await t.test('Default data is populated correctly', async function (t) {
    const fixture = new TestFixture('Default data is populated correctly');
    const db = await fixture.setup();

    // Test default warehouse exists
    const warehouse = db.prepare('SELECT * FROM warehouse WHERE is_default = 1').get();
    t.assert.ok(warehouse, 'Default warehouse should exist');
    t.assert.equal(warehouse.code, 'MAIN', 'Default warehouse should be MAIN');

    // Test product categories exist
    const categories = db.prepare('SELECT COUNT(*) as count FROM product_category').get();
    t.assert.ok(categories.count > 0, 'Product categories should be populated');

    // Test default vendor exists
    const vendor = db.prepare('SELECT * FROM vendor WHERE vendor_code = ?').get('SUPPLIER001');
    t.assert.ok(vendor, 'Default vendor should exist');

    fixture.cleanup();
  });

  await t.test('Product creation works correctly', async function (t) {
    const fixture = new TestFixture('Product creation works correctly');
    const db = await fixture.setup();

    // Get a category ID for the test
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();

    // Create a test product
    const productId = db.prepare(`
      INSERT INTO product (
        sku, name, product_category_id, standard_cost, costing_method,
        inventory_account_code, cogs_account_code, sales_account_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('TEST-001', 'Test Product', category.id, 1000, 'FIFO', 10300, 50100, 40100).lastInsertRowid;

    // Verify product was created
    const product = db.prepare('SELECT * FROM product WHERE id = ?').get(productId);
    t.assert.ok(product, 'Product should be created');
    t.assert.equal(product.sku, 'TEST-001', 'Product SKU should match');
    t.assert.equal(product.standard_cost, 1000, 'Standard cost should match');
    t.assert.equal(product.costing_method, 'FIFO', 'Cost method should match');

    fixture.cleanup();
  });

  await t.test('Warehouse management constraints work', async function (t) {
    const fixture = new TestFixture('Warehouse management constraints work');
    const db = await fixture.setup();

    // Initially should have one default warehouse
    const initialDefaults = db.prepare('SELECT COUNT(*) as count FROM warehouse WHERE is_default = 1').get();
    t.assert.equal(initialDefaults.count, 1, 'Should start with one default warehouse');

    // Add new warehouse (not default)
    db.prepare(`
      INSERT INTO warehouse (code, name, is_default)
      VALUES (?, ?, ?)
    `).run('SECOND', 'Second Warehouse', 0);

    // Should still have only one default
    const stillOneDefault = db.prepare('SELECT COUNT(*) as count FROM warehouse WHERE is_default = 1').get();
    t.assert.equal(stillOneDefault.count, 1, 'Should still have only one default');

    // Change default to new warehouse
    const secondWarehouse = db.prepare('SELECT id FROM warehouse WHERE code = ?').get('SECOND');
    db.prepare('UPDATE warehouse SET is_default = 1 WHERE id = ?').run(secondWarehouse.id);

    // Should still have only one default, but now it's the second warehouse
    const finalDefaults = db.prepare('SELECT COUNT(*) as count FROM warehouse WHERE is_default = 1').get();
    t.assert.equal(finalDefaults.count, 1, 'Should still have only one default after change');

    const newDefault = db.prepare('SELECT code FROM warehouse WHERE is_default = 1').get();
    t.assert.equal(newDefault.code, 'SECOND', 'Second warehouse should now be default');

    fixture.cleanup();
  });

  await t.test('Inventory transactions can be created', async function (t) {
    const fixture = new TestFixture('Inventory transactions can be created');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost,
        inventory_account_code, cogs_account_code, sales_account_code)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('TEST-002', 'Test Product 2', category.id, 1500, 10300, 50100, 40100).lastInsertRowid;

    // Get warehouse location
    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    // Create inventory transaction
    const transactionId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user
      ) VALUES (?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'REC-001', Math.floor(Date.now() / 1000), 'Test receipt', 'test_user').lastInsertRowid;

    // Add transaction line
    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(transactionId, 1, productId, warehouseLocation.id, 100, 1200);

    // Verify transaction was created
    const transaction = db.prepare('SELECT * FROM inventory_transaction WHERE id = ?').get(transactionId);
    t.assert.ok(transaction, 'Transaction should be created');
    t.assert.equal(transaction.transaction_type_code, 'PURCHASE_RECEIPT', 'Transaction type should match');

    const transactionLine = db.prepare('SELECT * FROM inventory_transaction_line WHERE inventory_transaction_id = ?').get(transactionId);
    t.assert.ok(transactionLine, 'Transaction line should be created');
    t.assert.equal(transactionLine.quantity, 100, 'Quantity should match');
    t.assert.equal(transactionLine.unit_cost, 1200, 'Unit cost should match');

    fixture.cleanup();
  });

  await t.test('Vendor management works correctly', async function (t) {
    const fixture = new TestFixture('Vendor management works correctly');
    const db = await fixture.setup();

    // Create vendor
    const vendorId = db.prepare(`
      INSERT INTO vendor (vendor_code, name, contact_person, is_active)
      VALUES (?, ?, ?, ?)
    `).run('VEN-001', 'Test Vendor Inc.', 'John Smith', 1).lastInsertRowid;

    // Create product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('VEN-PROD-001', 'Vendor Product', category.id, 10300, 50100, 40100).lastInsertRowid;

    // Link vendor to product
    db.prepare(`
      INSERT INTO vendor_product (
        vendor_id, product_id, vendor_sku, unit_price,
        minimum_order_quantity, lead_time_days, is_preferred
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(vendorId, productId, 'VEN-SKU-001', 1500, 10, 7, 1);

    // Verify vendor-product relationship
    const vendorProduct = db.prepare(`
      SELECT vp.*, v.name as vendor_name, p.sku as product_sku
      FROM vendor_product vp
      JOIN vendor v ON v.id = vp.vendor_id
      JOIN product p ON p.id = vp.product_id
      WHERE vp.vendor_id = ? AND vp.product_id = ?
    `).get(vendorId, productId);

    t.assert.ok(vendorProduct, 'Vendor-product relationship should exist');
    t.assert.equal(vendorProduct.vendor_name, 'Test Vendor Inc.', 'Vendor name should match');
    t.assert.equal(vendorProduct.product_sku, 'VEN-PROD-001', 'Product SKU should match');
    t.assert.equal(vendorProduct.unit_price, 1500, 'Unit price should match');
    t.assert.equal(vendorProduct.is_preferred, 1, 'Should be preferred vendor');

    fixture.cleanup();
  });

  await t.test('Physical inventory management works', async function (t) {
    const fixture = new TestFixture('Physical inventory management works');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost, inventory_account_code, cogs_account_code, sales_account_code)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('TEST-004', 'Test Product 4', category.id, 1000, 10300, 50100, 40100).lastInsertRowid;

    const warehouse = db.prepare('SELECT id FROM warehouse WHERE code = ?').get('MAIN');

    // Create physical inventory count
    const physicalInventoryId = db.prepare(`
      INSERT INTO physical_inventory (
        count_number, count_date, warehouse_id, count_type, status, planned_by_user
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PI-001', Math.floor(Date.now() / 1000), warehouse.id, 'SPOT', 'IN_PROGRESS', 'test_user').lastInsertRowid;

    // Get a warehouse location
    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = ? LIMIT 1').get(warehouse.id);

    // Add count line
    const countId = db.prepare(`
      INSERT INTO physical_inventory_count (
        physical_inventory_id, product_id, warehouse_location_id,
        system_quantity, counted_quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(physicalInventoryId, productId, warehouseLocation.id, 100, 95, 1000).lastInsertRowid;

    // Verify physical inventory was created
    const physicalInventory = db.prepare('SELECT * FROM physical_inventory WHERE id = ?').get(physicalInventoryId);
    t.assert.ok(physicalInventory, 'Physical inventory should be created');
    t.assert.equal(physicalInventory.status, 'IN_PROGRESS', 'Status should match');

    const count = db.prepare('SELECT * FROM physical_inventory_count WHERE id = ?').get(countId);
    t.assert.ok(count, 'Physical inventory count should be created');
    t.assert.equal(count.system_quantity, 100, 'System quantity should match');
    t.assert.equal(count.counted_quantity, 95, 'Counted quantity should match');

    fixture.cleanup();
  });

  await t.test('Inventory views work correctly', async function (t) {
    const fixture = new TestFixture('Inventory views work correctly');
    const db = await fixture.setup();

    // Create test products with stock
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const product1Id = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost, reorder_point, inventory_account_code, cogs_account_code, sales_account_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('LOW-001', 'Low Stock Product', category.id, 1000, 10, 10300, 50100, 40100).lastInsertRowid;

    const product2Id = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost, reorder_point, inventory_account_code, cogs_account_code, sales_account_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('OK-001', 'Adequate Stock Product', category.id, 1200, 10, 10300, 50100, 40100).lastInsertRowid;

    const warehouse = db.prepare('SELECT id FROM warehouse WHERE code = ?').get('MAIN');

    // Get default warehouse location
    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = ? LIMIT 1').get(warehouse.id);

    // Add stock records
    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand,
        quantity_reserved, unit_cost
      ) VALUES (?, ?, ?, ?, ?)
    `).run(product1Id, warehouseLocation.id, 5, 0, 1000); // Below reorder point

    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand,
        quantity_reserved, unit_cost
      ) VALUES (?, ?, ?, ?, ?)
    `).run(product2Id, warehouseLocation.id, 50, 0, 1200); // Adequate stock

    // Test inventory summary view - filter for products with actual stock
    const summary = db.prepare(`
      SELECT * FROM inventory_summary
      WHERE product_id IN (?, ?)
        AND total_quantity_on_hand > 0
      ORDER BY product_id
    `).all(product1Id, product2Id);

    t.assert.equal(summary.length, 2, 'Should have 2 products in summary');
    t.assert.equal(summary[0].total_quantity_on_hand, 5, 'First product should have 5 on hand');
    t.assert.equal(summary[1].total_quantity_on_hand, 50, 'Second product should have 50 on hand');

    // Test inventory alerts view
    const alerts = db.prepare('SELECT * FROM inventory_alerts').all();
    t.assert.ok(alerts.length > 0, 'Should have low stock alerts');

    const lowStockAlert = alerts.find(alert => alert.product_id === product1Id);
    t.assert.ok(lowStockAlert, 'Should have alert for low stock product');
    t.assert.equal(lowStockAlert.alert_type, 'REORDER_NEEDED', 'Alert type should be REORDER_NEEDED');

    // Test inventory valuation view
    const valuation = db.prepare(`
      SELECT * FROM inventory_valuation
      WHERE product_id IN (?, ?)
      ORDER BY product_id
    `).all(product1Id, product2Id);

    t.assert.equal(valuation.length, 2, 'Should have 2 products in valuation');
    t.assert.ok(valuation[0].inventory_value > 0, 'First product should have inventory value');
    t.assert.ok(valuation[1].inventory_value > 0, 'Second product should have inventory value');

    fixture.cleanup();
  });

  await t.test('Data integrity constraints are enforced', async function (t) {
    const fixture = new TestFixture('Data integrity constraints are enforced');
    const db = await fixture.setup();

    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();

    // Test unique SKU constraint
    db.prepare(`
      INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('UNIQUE-001', 'Test Product', category.id, 10300, 50100, 40100);

    // This should throw due to unique constraint on SKU
    t.assert.throws(function () {
      db.prepare(`
        INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('UNIQUE-001', 'Duplicate SKU', category.id, 10300, 50100, 40100);
    }, 'Should throw error for duplicate SKU');

    // Test check constraint on standard_cost (should not allow negative)
    t.assert.throws(function () {
      db.prepare(`
        INSERT INTO product (sku, name, category_id, standard_cost)
        VALUES (?, ?, ?, ?)
      `).run('CHECK-001', 'Test Product', category.id, -100);
    }, 'Should throw error for negative standard cost');

    fixture.cleanup();
  });

  await t.test('Integration with accounting system works', async function (t) {
    const fixture = new TestFixture('Integration with accounting system works');
    const db = await fixture.setup();

    // Verify that key accounting accounts exist for inventory integration
    const inventoryAccount = db.prepare('SELECT * FROM account WHERE code = 10300').get();
    t.assert.ok(inventoryAccount, 'Inventory account (10300) should exist');
    t.assert.equal(inventoryAccount.name, 'Inventory', 'Inventory account name should match');

    const cogsAccount = db.prepare('SELECT * FROM account WHERE code = 50100').get();
    t.assert.ok(cogsAccount, 'COGS account (50100) should exist');
    t.assert.equal(cogsAccount.name, 'Cost of Goods Sold', 'COGS account name should match');

    const salesAccount = db.prepare('SELECT * FROM account WHERE code = 40100').get();
    t.assert.ok(salesAccount, 'Sales account (40100) should exist');
    t.assert.equal(salesAccount.name, 'Sales Revenue', 'Sales account name should match');

    // Test that we can create a journal entry and link it to inventory transaction
    db.exec('begin');

    const journalEntryId = db.prepare(`
      INSERT INTO journal_entry (ref, transaction_time, note)
      VALUES (?, ?, ?)
    `).run(100, Math.floor(Date.now() / 1000), 'Test inventory journal entry').lastInsertRowid;

    // Add journal entry lines for inventory purchase
    db.prepare(`
      INSERT INTO journal_entry_line_auto_number (
        journal_entry_ref, account_code, db, cr
      ) VALUES (?, ?, ?, ?)
    `).run(journalEntryId, 10300, 100000, 0); // DR Inventory $1,000

    db.prepare(`
      INSERT into journal_entry_line_auto_number (
        journal_entry_ref, account_code, db, cr
      ) VALUES (?, ?, ?, ?)
    `).run(journalEntryId, 20100, 0, 100000); // CR Accounts Payable $1,000

    db.exec('commit');

    // Post the journal entry
    db.prepare(`
      UPDATE journal_entry SET post_time = ? WHERE ref = ?
    `).run(Math.floor(Date.now() / 1000), journalEntryId);

    // Create inventory transaction linking to this journal entry
    const transactionId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date,
        notes, journal_entry_ref, created_by_user
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'PUR-999', Math.floor(Date.now() / 1000), 'Purchase receipt', journalEntryId, 'test_user').lastInsertRowid;

    // Verify the linkage
    const transaction = db.prepare('SELECT * FROM inventory_transaction WHERE id = ?').get(transactionId);
    t.assert.ok(transaction, 'Inventory transaction should be created');
    t.assert.equal(transaction.journal_entry_ref, journalEntryId, 'Journal entry reference should match');

    const journalEntry = db.prepare('SELECT * FROM journal_entry WHERE ref = ?').get(journalEntryId);
    t.assert.ok(journalEntry, 'Journal entry should exist');
    t.assert.ok(journalEntry.post_time, 'Journal entry should be posted');

    fixture.cleanup();
  });
});
