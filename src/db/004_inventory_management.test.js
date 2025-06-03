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
      'physical_inventory_count',
    ];

    for (const tableName of tables) {
      const table = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name=?
      `).get(tableName);
      t.assert.equal(Boolean(table), true, `Table ${tableName} should exist`);
    }

    fixture.cleanup();
  });

  await t.test('Default data is populated correctly', async function (t) {
    const fixture = new TestFixture('Default data is populated correctly');
    const db = await fixture.setup();

    // Test default warehouse exists
    const warehouse = db.prepare('SELECT * FROM warehouse WHERE is_default = 1').get();
    t.assert.equal(Boolean(warehouse), true, 'Default warehouse should exist');
    t.assert.equal(String(warehouse.code), 'MAIN', 'Default warehouse should be MAIN');

    // Test product categories exist
    const categories = db.prepare('SELECT COUNT(*) as count FROM product_category').get();
    t.assert.equal(Number(categories.count) > 0, true, 'Product categories should be populated');

    // Test default vendor exists
    const vendor = db.prepare('SELECT * FROM vendor WHERE vendor_code = ?').get('SUPPLIER001');
    t.assert.equal(Boolean(vendor), true, 'Default vendor should exist');

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
    t.assert.equal(Boolean(product), true, 'Product should be created');
    t.assert.equal(String(product.sku), 'TEST-001', 'Product SKU should match');
    t.assert.equal(Number(product.standard_cost), 1000, 'Standard cost should match');
    t.assert.equal(String(product.costing_method), 'FIFO', 'Cost method should match');

    fixture.cleanup();
  });

  await t.test('Warehouse management constraints work', async function (t) {
    const fixture = new TestFixture('Warehouse management constraints work');
    const db = await fixture.setup();

    // Initially should have one default warehouse
    const initialDefaults = db.prepare('SELECT COUNT(*) as count FROM warehouse WHERE is_default = 1').get();
    t.assert.equal(Number(initialDefaults.count), 1, 'Should start with one default warehouse');

    // Add new warehouse (not default)
    db.prepare(`
      INSERT INTO warehouse (code, name, is_default)
      VALUES (?, ?, ?)
    `).run('SECOND', 'Second Warehouse', 0);

    // Should still have only one default
    const stillOneDefault = db.prepare('SELECT COUNT(*) as count FROM warehouse WHERE is_default = 1').get();
    t.assert.equal(Number(stillOneDefault.count), 1, 'Should still have only one default');

    // Change default to new warehouse
    const secondWarehouse = db.prepare('SELECT id FROM warehouse WHERE code = ?').get('SECOND');
    db.prepare('UPDATE warehouse SET is_default = 1 WHERE id = ?').run(secondWarehouse.id);

    // Should still have only one default, but now it's the second warehouse
    const finalDefaults = db.prepare('SELECT COUNT(*) as count FROM warehouse WHERE is_default = 1').get();
    t.assert.equal(Number(finalDefaults.count), 1, 'Should still have only one default after change');

    const newDefault = db.prepare('SELECT code FROM warehouse WHERE is_default = 1').get();
    t.assert.equal(String(newDefault.code), 'SECOND', 'Second warehouse should now be default');

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
    t.assert.equal(Boolean(transaction), true, 'Transaction should be created');
    t.assert.equal(String(transaction.transaction_type_code), 'PURCHASE_RECEIPT', 'Transaction type should match');

    const transactionLine = db.prepare('SELECT * FROM inventory_transaction_line WHERE inventory_transaction_id = ?').get(transactionId);
    t.assert.equal(Boolean(transactionLine), true, 'Transaction line should be created');
    t.assert.equal(Number(transactionLine.quantity), 100, 'Quantity should match');
    t.assert.equal(Number(transactionLine.unit_cost), 1200, 'Unit cost should match');

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

    t.assert.equal(Boolean(vendorProduct), true, 'Vendor-product relationship should exist');
    t.assert.equal(String(vendorProduct.vendor_name), 'Test Vendor Inc.', 'Vendor name should match');
    t.assert.equal(String(vendorProduct.product_sku), 'VEN-PROD-001', 'Product SKU should match');
    t.assert.equal(Number(vendorProduct.unit_price), 1500, 'Unit price should match');
    t.assert.equal(Number(vendorProduct.is_preferred), 1, 'Should be preferred vendor');

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
    t.assert.equal(Boolean(physicalInventory), true, 'Physical inventory should be created');
    t.assert.equal(String(physicalInventory.status), 'IN_PROGRESS', 'Status should match');

    const count = db.prepare('SELECT * FROM physical_inventory_count WHERE id = ?').get(countId);
    t.assert.equal(Boolean(count), true, 'Physical inventory count should be created');
    t.assert.equal(Number(count.system_quantity), 100, 'System quantity should match');
    t.assert.equal(Number(count.counted_quantity), 95, 'Counted quantity should match');

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
    t.assert.equal(Number(summary[0].total_quantity_on_hand), 5, 'First product should have 5 on hand');
    t.assert.equal(Number(summary[1].total_quantity_on_hand), 50, 'Second product should have 50 on hand');

    // Test inventory alerts view
    const alerts = db.prepare('SELECT * FROM inventory_alerts').all();
    t.assert.equal(alerts.length > 0, true, 'Should have low stock alerts');

    const lowStockAlert = alerts.find(alert => alert.product_id === product1Id);
    t.assert.equal(Boolean(lowStockAlert), true, 'Should have alert for low stock product');
    t.assert.equal(String(lowStockAlert.alert_type), 'REORDER_NEEDED', 'Alert type should be REORDER_NEEDED');

    // Test inventory valuation view
    const valuation = db.prepare(`
      SELECT * FROM inventory_valuation
      WHERE product_id IN (?, ?)
      ORDER BY product_id
    `).all(product1Id, product2Id);

    t.assert.equal(valuation.length, 2, 'Should have 2 products in valuation');
    t.assert.equal(Number(valuation[0].inventory_value) > 0, true, 'First product should have inventory value');
    t.assert.equal(Number(valuation[1].inventory_value) > 0, true, 'Second product should have inventory value');

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
    t.assert.equal(Boolean(inventoryAccount), true, 'Inventory account (10300) should exist');
    t.assert.equal(String(inventoryAccount.name), 'Inventory', 'Inventory account name should match');

    const cogsAccount = db.prepare('SELECT * FROM account WHERE code = 50100').get();
    t.assert.equal(Boolean(cogsAccount), true, 'COGS account (50100) should exist');
    t.assert.equal(String(cogsAccount.name), 'Cost of Goods Sold', 'COGS account name should match');

    const salesAccount = db.prepare('SELECT * FROM account WHERE code = 40100').get();
    t.assert.equal(Boolean(salesAccount), true, 'Sales account (40100) should exist');
    t.assert.equal(String(salesAccount.name), 'Sales Revenue', 'Sales account name should match');

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
    t.assert.equal(Boolean(transaction), true, 'Inventory transaction should be created');
    t.assert.equal(Number(transaction.journal_entry_ref), Number(journalEntryId), 'Journal entry reference should match');

    const journalEntry = db.prepare('SELECT * FROM journal_entry WHERE ref = ?').get(journalEntryId);
    t.assert.equal(Boolean(journalEntry), true, 'Journal entry should exist');
    t.assert.equal(Boolean(journalEntry.post_time), true, 'Journal entry should be posted');

    fixture.cleanup();
  });

  await t.test('Cost layer management and FIFO costing works', async function (t) {
    const fixture = new TestFixture('Cost layer management and FIFO costing works');
    const db = await fixture.setup();

    // Create test product with FIFO costing
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost, costing_method,
        inventory_account_code, cogs_account_code, sales_account_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('FIFO-001', 'FIFO Test Product', category.id, 1000, 'FIFO', 10300, 50100, 40100).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    // Create first receipt transaction (older, cheaper)
    const transaction1Id = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user
      ) VALUES (?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'REC-FIFO-001', Math.floor(Date.now() / 1000) - 86400, 'First receipt', 'test_user').lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(transaction1Id, 1, productId, warehouseLocation.id, 100, 1000);

    // Post first transaction
    db.prepare('UPDATE inventory_transaction SET status = ? WHERE id = ?').run('POSTED', transaction1Id);

    // Create second receipt transaction (newer, more expensive)
    const transaction2Id = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user
      ) VALUES (?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'REC-FIFO-002', Math.floor(Date.now() / 1000), 'Second receipt', 'test_user').lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(transaction2Id, 1, productId, warehouseLocation.id, 50, 1500);

    // Verify inventory stock
    const stock = db.prepare(`
      SELECT * FROM inventory_stock
      WHERE product_id = ? AND warehouse_location_id = ?
    `).get(productId, warehouseLocation.id);

    t.assert.equal(Number(stock.quantity_on_hand), 100, 'Total quantity should be 100 after first transaction');

    // Post second transaction
    db.prepare('UPDATE inventory_transaction SET status = ? WHERE id = ?').run('POSTED', transaction2Id);

    // Verify final stock after both transactions
    const finalStock = db.prepare(`
      SELECT * FROM inventory_stock
      WHERE product_id = ? AND warehouse_location_id = ?
    `).get(productId, warehouseLocation.id);

    t.assert.equal(Number(finalStock.quantity_on_hand), 150, 'Total quantity should be 150 after both transactions');
    t.assert.equal(Number(stock.total_value) > 0, true, 'Total value should be calculated');

    fixture.cleanup();
  });

  await t.test('Lot tracking validation works correctly', async function (t) {
    const fixture = new TestFixture('Lot tracking validation works correctly');
    const db = await fixture.setup();

    // Create lot-tracked product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, is_lot_tracked, shelf_life_days,
        inventory_account_code, cogs_account_code, sales_account_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('LOT-001', 'Lot Tracked Product', category.id, 1, 30, 10300, 50100, 40100).lastInsertRowid;

    // Create lot
    const lotId = db.prepare(`
      INSERT INTO inventory_lot (product_id, lot_number, expiration_date)
      VALUES (?, ?, ?)
    `).run(productId, 'LOT-20250601', Math.floor(Date.now() / 1000) + (30 * 24 * 3600)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    // Create transaction
    const transactionId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user
      ) VALUES (?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'REC-LOT-001', Math.floor(Date.now() / 1000), 'Lot receipt', 'test_user').lastInsertRowid;

    // Valid transaction line with lot ID
    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        lot_id, quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(transactionId, 1, productId, warehouseLocation.id, lotId, 100, 1200);

    // Should succeed when posting
    db.prepare('UPDATE inventory_transaction SET status = ? WHERE id = ?').run('POSTED', transactionId);

    // Verify lot expiration view
    const expiringLots = db.prepare('SELECT * FROM lot_expiration_alert WHERE product_id = ?').all(productId);
    t.assert.equal(expiringLots.length > 0, true, 'Should have lot expiration tracking');

    fixture.cleanup();
  });

  await t.test('Serial number tracking validation works', async function (t) {
    const fixture = new TestFixture('Serial number tracking validation works');
    const db = await fixture.setup();

    // Create serialized product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, is_serialized,
        inventory_account_code, cogs_account_code, sales_account_code)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('SERIAL-001', 'Serialized Product', category.id, 1, 10300, 50100, 40100).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    // Create transaction
    const transactionId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user
      ) VALUES (?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'REC-SERIAL-001', Math.floor(Date.now() / 1000), 'Serial receipt', 'test_user').lastInsertRowid;

    // Valid transaction line with serial numbers matching quantity
    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost, serial_numbers
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(transactionId, 1, productId, warehouseLocation.id, 2, 1500, JSON.stringify(['SN001', 'SN002']));

    // Should succeed when posting
    db.prepare('UPDATE inventory_transaction SET status = ? WHERE id = ?').run('POSTED', transactionId);

    // Verify stock was updated
    const stock = db.prepare(`
      SELECT * FROM inventory_stock
      WHERE product_id = ? AND warehouse_location_id = ?
    `).get(productId, warehouseLocation.id);

    t.assert.equal(Number(stock.quantity_on_hand), 2, 'Should have 2 units in stock');

    fixture.cleanup();
  });

  await t.test('Inventory valuation by costing method accuracy', async function (t) {
    const fixture = new TestFixture('Inventory valuation by costing method accuracy');
    const db = await fixture.setup();

    // Test weighted average costing
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost, costing_method,
        inventory_account_code, cogs_account_code, sales_account_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('WA-001', 'Weighted Average Product', category.id, 1000, 'WEIGHTED_AVERAGE', 10300, 50100, 40100).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    // Add stock with different costs
    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand, unit_cost
      ) VALUES (?, ?, ?, ?)
    `).run(productId, warehouseLocation.id, 100, 1000);

    db.prepare(`
      UPDATE inventory_stock SET
        quantity_on_hand = quantity_on_hand + 50,
        unit_cost = ((quantity_on_hand * unit_cost) + (50 * 1200)) / (quantity_on_hand + 50)
      WHERE product_id = ? AND warehouse_location_id = ?
    `).run(productId, warehouseLocation.id);

    // Test inventory valuation view
    const valuation = db.prepare(`
      SELECT * FROM inventory_valuation WHERE product_id = ?
    `).get(productId);

    t.assert.equal(Boolean(valuation), true, 'Should have valuation record');
    t.assert.equal(Number(valuation.total_quantity), 150, 'Should have 150 total quantity');
    t.assert.equal(Number(valuation.inventory_value) > 0, true, 'Should have calculated inventory value');

    // Test ABC analysis view
    const abcAnalysis = db.prepare(`
      SELECT * FROM inventory_abc_analysis WHERE product_id = ?
    `).get(productId);

    t.assert.equal(Boolean(abcAnalysis), true, 'Should appear in ABC analysis');
    t.assert.equal(['A', 'B', 'C'].includes(String(abcAnalysis.abc_category)), true, 'Should have valid ABC category');

    fixture.cleanup();
  });

  await t.test('Inventory movement audit trail works', async function (t) {
    const fixture = new TestFixture('Inventory movement audit trail works');
    const db = await fixture.setup();

    // Create test scenario with multiple movements
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('AUDIT-001', 'Audit Trail Product', category.id, 10300, 50100, 40100).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    // Receipt transaction
    const receiptId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user
      ) VALUES (?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'REC-AUDIT-001', Math.floor(Date.now() / 1000), 'Test receipt', 'test_user').lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(receiptId, 1, productId, warehouseLocation.id, 100, 1000);

    db.prepare('UPDATE inventory_transaction SET status = ? WHERE id = ?').run('POSTED', receiptId);

    // Issue transaction
    const issueId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user
      ) VALUES (?, ?, ?, ?, ?)
    `).run('SALES_ISSUE', 'ISS-AUDIT-001', Math.floor(Date.now() / 1000), 'Test issue', 'test_user').lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(issueId, 1, productId, warehouseLocation.id, -30, 1000);

    db.prepare('UPDATE inventory_transaction SET status = ? WHERE id = ?').run('POSTED', issueId);

    // Test audit trail view
    const auditTrail = db.prepare(`
      SELECT * FROM inventory_movement_audit
      WHERE product_id = ?
      ORDER BY transaction_date
    `).all(productId);

    t.assert.equal(auditTrail.length, 2, 'Should have 2 audit trail entries');
    t.assert.equal(String(auditTrail[0].transaction_type_code), 'PURCHASE_RECEIPT', 'First should be receipt');
    t.assert.equal(String(auditTrail[1].transaction_type_code), 'SALES_ISSUE', 'Second should be issue');
    t.assert.equal(Number(auditTrail[0].quantity), 100, 'Receipt quantity should be 100');
    t.assert.equal(Number(auditTrail[1].quantity), -30, 'Issue quantity should be -30');

    // Test cost layer summary
    const costSummary = db.prepare(`
      SELECT * FROM cost_layer_summary WHERE sku = ?
    `).get('AUDIT-001');

    t.assert.equal(Boolean(costSummary), true, 'Should have cost layer summary');
    t.assert.equal(Number(costSummary.total_quantity_in_layers), 70, 'Should have 70 remaining in layers after issue');

    fixture.cleanup();
  });

  await t.test('Reserved quantity validation works', async function (t) {
    const fixture = new TestFixture('Reserved quantity validation works');
    const db = await fixture.setup();

    // Create test product and stock
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('RESERVE-001', 'Reserve Test Product', category.id, 10300, 50100, 40100).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    // Add stock
    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand, unit_cost
      ) VALUES (?, ?, ?, ?)
    `).run(productId, warehouseLocation.id, 100, 1000);

    // Valid reservation
    db.prepare(`
      UPDATE inventory_stock SET quantity_reserved = 50
      WHERE product_id = ? AND warehouse_location_id = ?
    `).run(productId, warehouseLocation.id);

    const stock = db.prepare(`
      SELECT * FROM inventory_stock
      WHERE product_id = ? AND warehouse_location_id = ?
    `).get(productId, warehouseLocation.id);

    t.assert.equal(Number(stock.quantity_reserved), 50, 'Should allow valid reservation');
    t.assert.equal(Number(stock.quantity_available), 50, 'Available should be calculated correctly');

    // Test that over-reservation should fail
    t.assert.throws(function () {
      db.prepare(`
        UPDATE inventory_stock SET quantity_reserved = 150
        WHERE product_id = ? AND warehouse_location_id = ?
      `).run(productId, warehouseLocation.id);
    }, 'Should prevent over-reservation');

    fixture.cleanup();
  });
});
