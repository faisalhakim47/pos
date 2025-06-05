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
    this.productSchemaPath = join(__dirname, '004_product_management.sql');
    this.warehouseSchemaPath = join(__dirname, '005_warehouse_management.sql');
    this.trackingSchemaPath = join(__dirname, '006_inventory_tracking.sql');
    this.db = null;
    this.dbPath = null;
  }

  async setup() {
    // Load schemas
    const coreAccountingContent = await readFile(this.coreAccountingPath, { encoding: 'utf8' });
    const productContent = await readFile(this.productSchemaPath, { encoding: 'utf8' });
    const warehouseContent = await readFile(this.warehouseSchemaPath, { encoding: 'utf8' });
    const trackingContent = await readFile(this.trackingSchemaPath, { encoding: 'utf8' });

    const tempDir = join(tmpdir(), 'pos-sql-tests');
    await mkdir(tempDir, { recursive: true });
    this.dbPath = join(
      tempDir,
      `${this.testRunId}_tracking_${this.label}.db`,
    );
    this.db = new DatabaseSync(this.dbPath);

    // Execute schemas in order
    this.db.exec(coreAccountingContent);
    this.db.exec(productContent);
    this.db.exec(warehouseContent);
    this.db.exec(trackingContent);

    return this.db;
  }

  cleanup() {
    if (this.db) {
      this.db.close();
    }
  }
}

await test('Inventory Tracking Schema', async function (t) {
  await t.test('Schema tables are created properly', async function (t) {
    const fixture = new TestFixture('Schema tables are created properly');
    const db = await fixture.setup();

    // Check that all inventory tracking tables exist
    const tables = [
      'inventory_lot',
      'inventory_serial',
      'inventory_stock',
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

  await t.test('Inventory views are created properly', async function (t) {
    const fixture = new TestFixture('Inventory views are created properly');
    const db = await fixture.setup();

    // Check that all inventory tracking views exist
    const views = [
      'inventory_summary',
      'inventory_alerts',
      'lot_expiration_alert',
    ];

    for (const viewName of views) {
      const view = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='view' AND name=?
      `).get(viewName);
      t.assert.equal(Boolean(view), true, `View ${viewName} should exist`);
    }

    fixture.cleanup();
  });

  await t.test('Inventory stock management works', async function (t) {
    const fixture = new TestFixture('Inventory stock management works');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('STOCK-001', 'Stock Test Product', category.id, 1000, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    // Create inventory stock record
    const stockId = db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand, quantity_reserved, unit_cost, last_movement_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(productId, warehouseLocation.id, 100, 20, 1000, Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Verify stock was created and calculated fields work
    const stock = db.prepare('SELECT * FROM inventory_stock WHERE id = ?').get(stockId);
    t.assert.equal(Boolean(stock), true, 'Stock record should be created');
    t.assert.equal(Number(stock.quantity_on_hand), 100, 'Quantity on hand should be 100');
    t.assert.equal(Number(stock.quantity_reserved), 20, 'Quantity reserved should be 20');
    t.assert.equal(Number(stock.quantity_available), 80, 'Quantity available should be calculated as 80');
    t.assert.equal(Number(stock.total_value), 100000, 'Total value should be calculated as 100000 (100 * 1000)');

    fixture.cleanup();
  });

  await t.test('Lot tracking works correctly', async function (t) {
    const fixture = new TestFixture('Lot tracking works correctly');
    const db = await fixture.setup();

    // Create lot-tracked product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, is_lot_tracked, shelf_life_days, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('LOT-001', 'Lot Tracked Product', category.id, 1, 30, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Create lot
    const lotId = db.prepare(`
      INSERT INTO inventory_lot (product_id, lot_number, expiration_date, received_date)
      VALUES (?, ?, ?, ?)
    `).run(productId, 'LOT-20250601', Math.floor(Date.now() / 1000) + (30 * 24 * 3600), Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Verify lot was created
    const lot = db.prepare('SELECT * FROM inventory_lot WHERE id = ?').get(lotId);
    t.assert.equal(Boolean(lot), true, 'Lot should be created');
    t.assert.equal(String(lot.lot_number), 'LOT-20250601', 'Lot number should match');
    t.assert.equal(Number(lot.product_id), Number(productId), 'Product ID should match');

    // Test unique constraint on product_id + lot_number
    t.assert.throws(function () {
      db.prepare(`
        INSERT INTO inventory_lot (product_id, lot_number, received_date)
        VALUES (?, ?, ?)
      `).run(productId, 'LOT-20250601', Math.floor(Date.now() / 1000));
    }, 'Should throw error for duplicate lot number for same product');

    fixture.cleanup();
  });

  await t.test('Serial number tracking works correctly', async function (t) {
    const fixture = new TestFixture('Serial number tracking works correctly');
    const db = await fixture.setup();

    // Create serialized product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, is_serialized, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('SERIAL-001', 'Serialized Product', category.id, 1, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    // Create serial number records
    const serial1Id = db.prepare(`
      INSERT INTO inventory_serial (
        product_id, serial_number, warehouse_location_id, received_time
      ) VALUES (?, ?, ?, ?)
    `).run(productId, 'SN001', warehouseLocation.id, Math.floor(Date.now() / 1000)).lastInsertRowid;

    const serial2Id = db.prepare(`
      INSERT INTO inventory_serial (
        product_id, serial_number, warehouse_location_id, received_time
      ) VALUES (?, ?, ?, ?)
    `).run(productId, 'SN002', warehouseLocation.id, Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Verify serial numbers were created
    const serial1 = db.prepare('SELECT * FROM inventory_serial WHERE id = ?').get(serial1Id);
    const serial2 = db.prepare('SELECT * FROM inventory_serial WHERE id = ?').get(serial2Id);

    t.assert.equal(Boolean(serial1), true, 'First serial should be created');
    t.assert.equal(Boolean(serial2), true, 'Second serial should be created');
    t.assert.equal(String(serial1.serial_number), 'SN001', 'First serial number should match');
    t.assert.equal(String(serial2.serial_number), 'SN002', 'Second serial number should match');

    // Test unique constraint on product_id + serial_number
    t.assert.throws(function () {
      db.prepare(`
        INSERT INTO inventory_serial (product_id, serial_number, received_time)
        VALUES (?, ?, ?)
      `).run(productId, 'SN001', Math.floor(Date.now() / 1000));
    }, 'Should throw error for duplicate serial number for same product');

    fixture.cleanup();
  });

  await t.test('Reserved quantity validation works', async function (t) {
    const fixture = new TestFixture('Reserved quantity validation works');
    const db = await fixture.setup();

    // Create test product and stock
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('RESERVE-001', 'Reserve Test Product', category.id, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    // Add stock
    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand, unit_cost, last_movement_time
      ) VALUES (?, ?, ?, ?, ?)
    `).run(productId, warehouseLocation.id, 100, 1000, Math.floor(Date.now() / 1000));

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

  await t.test('Inventory summary view works correctly', async function (t) {
    const fixture = new TestFixture('Inventory summary view works correctly');
    const db = await fixture.setup();

    // Create test products with stock
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const product1Id = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost, reorder_point, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('LOW-001', 'Low Stock Product', category.id, 1000, 10, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const product2Id = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost, reorder_point, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('OK-001', 'Adequate Stock Product', category.id, 1200, 10, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouse = db.prepare('SELECT id FROM warehouse WHERE code = ?').get('MAIN');

    // Get default warehouse location
    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = ? LIMIT 1').get(warehouse.id);

    // Add stock records
    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand,
        quantity_reserved, unit_cost, last_movement_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(product1Id, warehouseLocation.id, 5, 0, 1000, Math.floor(Date.now() / 1000)); // Below reorder point

    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand,
        quantity_reserved, unit_cost, last_movement_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(product2Id, warehouseLocation.id, 50, 0, 1200, Math.floor(Date.now() / 1000)); // Adequate stock

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
    t.assert.equal(String(summary[0].stock_status), 'REORDER', 'First product should need reorder');
    t.assert.equal(String(summary[1].stock_status), 'ADEQUATE', 'Second product should be adequate');

    fixture.cleanup();
  });

  await t.test('Inventory alerts view works correctly', async function (t) {
    const fixture = new TestFixture('Inventory alerts view works correctly');
    const db = await fixture.setup();

    // Create test products with different stock levels
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const lowStockProductId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, minimum_stock_level, reorder_point, reorder_quantity, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('ALERT-LOW', 'Low Stock Alert Product', category.id, 10, 20, 50, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const outOfStockProductId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, minimum_stock_level, reorder_point, reorder_quantity, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('ALERT-OUT', 'Out of Stock Product', category.id, 5, 10, 25, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    // Add stock - low stock (below reorder point)
    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand, unit_cost, last_movement_time
      ) VALUES (?, ?, ?, ?, ?)
    `).run(lowStockProductId, warehouseLocation.id, 15, 1000, Math.floor(Date.now() / 1000));

    // Add stock - out of stock
    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand, unit_cost, last_movement_time
      ) VALUES (?, ?, ?, ?, ?)
    `).run(outOfStockProductId, warehouseLocation.id, 0, 1000, Math.floor(Date.now() / 1000));

    // Test inventory alerts view
    const alerts = db.prepare('SELECT * FROM inventory_alerts ORDER BY alert_type, sku').all();
    t.assert.equal(alerts.length >= 2, true, 'Should have at least 2 alerts');

    const outOfStockAlert = alerts.find(alert => alert.product_id === outOfStockProductId);
    const lowStockAlert = alerts.find(alert => alert.product_id === lowStockProductId);

    t.assert.equal(Boolean(outOfStockAlert), true, 'Should have out of stock alert');
    t.assert.equal(String(outOfStockAlert.alert_type), 'OUT_OF_STOCK', 'Alert type should be OUT_OF_STOCK');

    t.assert.equal(Boolean(lowStockAlert), true, 'Should have low stock alert');
    t.assert.equal(String(lowStockAlert.alert_type), 'REORDER_NEEDED', 'Alert type should be REORDER_NEEDED');

    fixture.cleanup();
  });

  await t.test('Lot expiration alert view works correctly', async function (t) {
    const fixture = new TestFixture('Lot expiration alert view works correctly');
    const db = await fixture.setup();

    // Create lot-tracked product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, is_lot_tracked, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('EXPIRY-001', 'Expiry Test Product', category.id, 1, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    const currentTime = Math.floor(Date.now() / 1000);

    // Create lots with different expiration dates
    const expiredLotId = db.prepare(`
      INSERT INTO inventory_lot (product_id, lot_number, expiration_date, received_date)
      VALUES (?, ?, ?, ?)
    `).run(productId, 'EXPIRED-LOT', currentTime - (24 * 3600), currentTime - (30 * 24 * 3600)).lastInsertRowid;

    const expiringLotId = db.prepare(`
      INSERT INTO inventory_lot (product_id, lot_number, expiration_date, received_date)
      VALUES (?, ?, ?, ?)
    `).run(productId, 'EXPIRING-LOT', currentTime + (3 * 24 * 3600), currentTime - (27 * 24 * 3600)).lastInsertRowid;

    // Add stock for these lots
    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, lot_id, quantity_on_hand, unit_cost, last_movement_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(productId, warehouseLocation.id, expiredLotId, 10, 1000, currentTime);

    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, lot_id, quantity_on_hand, unit_cost, last_movement_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(productId, warehouseLocation.id, expiringLotId, 20, 1000, currentTime);

    // Test lot expiration alert view
    const alerts = db.prepare('SELECT * FROM lot_expiration_alert ORDER BY expiration_date').all();
    t.assert.equal(alerts.length >= 2, true, `Should have at least 2 expiration alerts, but got ${alerts.length}`);

    const expiredAlert = alerts.find(alert => alert.lot_number === 'EXPIRED-LOT');
    const expiringAlert = alerts.find(alert => alert.lot_number === 'EXPIRING-LOT');

    t.assert.equal(Boolean(expiredAlert), true, 'Should have expired lot alert');
    t.assert.equal(String(expiredAlert.expiration_status), 'EXPIRED', 'Status should be EXPIRED');

    t.assert.equal(Boolean(expiringAlert), true, 'Should have expiring lot alert');
    t.assert.equal(String(expiringAlert.expiration_status), 'EXPIRES_THIS_WEEK', 'Status should be EXPIRES_THIS_WEEK');

    fixture.cleanup();
  });

  await t.test('Inventory stock unique constraints work correctly', async function (t) {
    const fixture = new TestFixture('Inventory stock unique constraints work correctly');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('UNIQUE-001', 'Unique Test Product', category.id, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    // Create first stock record (no variant, no lot)
    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand, unit_cost, last_movement_time
      ) VALUES (?, ?, ?, ?, ?)
    `).run(productId, warehouseLocation.id, 100, 1000, Math.floor(Date.now() / 1000));

    // Try to create duplicate - should fail
    t.assert.throws(function () {
      db.prepare(`
        INSERT INTO inventory_stock (
          product_id, warehouse_location_id, quantity_on_hand, unit_cost, last_movement_time
        ) VALUES (?, ?, ?, ?, ?)
      `).run(productId, warehouseLocation.id, 50, 1000, Math.floor(Date.now() / 1000));
    }, 'Should throw error for duplicate stock record');

    // Create lot and add stock with lot - should succeed
    const lotId = db.prepare(`
      INSERT INTO inventory_lot (product_id, lot_number, received_date)
      VALUES (?, ?, ?)
    `).run(productId, 'LOT-001', Math.floor(Date.now() / 1000)).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, lot_id, quantity_on_hand, unit_cost, last_movement_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(productId, warehouseLocation.id, lotId, 50, 1000, Math.floor(Date.now() / 1000));

    // Verify both records exist
    const stockRecords = db.prepare(`
      SELECT COUNT(*) as count FROM inventory_stock 
      WHERE product_id = ? AND warehouse_location_id = ?
    `).get(productId, warehouseLocation.id);

    t.assert.equal(Number(stockRecords.count), 2, 'Should have 2 stock records (one without lot, one with lot)');

    fixture.cleanup();
  });
});