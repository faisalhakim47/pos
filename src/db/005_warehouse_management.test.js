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
    this.db = null;
    this.dbPath = null;
  }

  async setup() {
    // Load schemas
    const coreAccountingContent = await readFile(this.coreAccountingPath, { encoding: 'utf8' });
    const productContent = await readFile(this.productSchemaPath, { encoding: 'utf8' });
    const warehouseContent = await readFile(this.warehouseSchemaPath, { encoding: 'utf8' });

    const tempDir = join(tmpdir(), 'pos-sql-tests');
    await mkdir(tempDir, { recursive: true });
    this.dbPath = join(
      tempDir,
      `${this.testRunId}_warehouse_${this.label}.db`,
    );
    this.db = new DatabaseSync(this.dbPath);

    // Execute schemas in order
    this.db.exec(coreAccountingContent);
    this.db.exec(productContent);
    this.db.exec(warehouseContent);

    return this.db;
  }

  cleanup() {
    if (this.db) {
      this.db.close();
    }
  }
}

await test('Warehouse Management Schema', async function (t) {
  await t.test('Schema tables are created properly', async function (t) {
    const fixture = new TestFixture('Schema tables are created properly');
    const db = await fixture.setup();

    // Check that all warehouse management tables exist
    const tables = [
      'warehouse',
      'warehouse_location',
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

  await t.test('Default warehouse is created', async function (t) {
    const fixture = new TestFixture('Default warehouse is created');
    const db = await fixture.setup();

    // Test default warehouse exists
    const warehouse = db.prepare('SELECT * FROM warehouse WHERE is_default = 1').get();
    t.assert.equal(Boolean(warehouse), true, 'Default warehouse should exist');
    t.assert.equal(String(warehouse.code), 'MAIN', 'Default warehouse should be MAIN');

    // Test warehouse locations exist
    const locations = db.prepare('SELECT COUNT(*) as count FROM warehouse_location WHERE warehouse_id = ?').get(warehouse.id);
    t.assert.equal(Number(locations.count) > 0, true, 'Warehouse locations should be populated');

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
      INSERT INTO warehouse (code, name, is_default, created_time)
      VALUES (?, ?, ?, ?)
    `).run('SECOND', 'Second Warehouse', 0, Math.floor(Date.now() / 1000));

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

  await t.test('Warehouse location management works', async function (t) {
    const fixture = new TestFixture('Warehouse location management works');
    const db = await fixture.setup();

    const warehouse = db.prepare('SELECT id FROM warehouse WHERE code = ?').get('MAIN');

    // Create a new warehouse location
    const locationId = db.prepare(`
      INSERT INTO warehouse_location (warehouse_id, code, name, zone, aisle, shelf, bin)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(warehouse.id, 'TEST-LOC', 'Test Location', 'TEST', '99', '99', '99').lastInsertRowid;

    // Verify location was created
    const location = db.prepare('SELECT * FROM warehouse_location WHERE id = ?').get(locationId);
    t.assert.equal(Boolean(location), true, 'Location should be created');
    t.assert.equal(String(location.code), 'TEST-LOC', 'Location code should match');
    t.assert.equal(String(location.zone), 'TEST', 'Zone should match');
    t.assert.equal(String(location.aisle), '99', 'Aisle should match');

    // Test unique constraint on warehouse_id + code
    t.assert.throws(function () {
      db.prepare(`
        INSERT INTO warehouse_location (warehouse_id, code, name)
        VALUES (?, ?, ?)
      `).run(warehouse.id, 'TEST-LOC', 'Duplicate Location');
    }, 'Should throw error for duplicate location code in same warehouse');

    fixture.cleanup();
  });

  await t.test('Physical inventory management works', async function (t) {
    const fixture = new TestFixture('Physical inventory management works');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('TEST-004', 'Test Product 4', category.id, 1000, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouse = db.prepare('SELECT id FROM warehouse WHERE code = ?').get('MAIN');

    // Create physical inventory count
    const physicalInventoryId = db.prepare(`
      INSERT INTO physical_inventory (
        count_number, count_date, warehouse_id, count_type, planned_time, started_time, planned_by_user
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('PI-001', Math.floor(Date.now() / 1000), warehouse.id, 'SPOT', Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000), 'test_user').lastInsertRowid;

    // Get a warehouse location
    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = ? LIMIT 1').get(warehouse.id);

    // Add count line
    const countId = db.prepare(`
      INSERT INTO physical_inventory_count (
        physical_inventory_id, product_id, warehouse_location_id,
        system_quantity, counted_quantity, unit_cost, pending_time, counted_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(physicalInventoryId, productId, warehouseLocation.id, 100, 95, 1000, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Verify physical inventory was created
    const physicalInventory = db.prepare('SELECT * FROM physical_inventory WHERE id = ?').get(physicalInventoryId);
    t.assert.equal(Boolean(physicalInventory), true, 'Physical inventory should be created');
    t.assert.equal(Boolean(physicalInventory.started_time), true, 'Should have started_time set');

    const count = db.prepare('SELECT * FROM physical_inventory_count WHERE id = ?').get(countId);
    t.assert.equal(Boolean(count), true, 'Physical inventory count should be created');
    t.assert.equal(Number(count.system_quantity), 100, 'System quantity should match');
    t.assert.equal(Number(count.counted_quantity), 95, 'Counted quantity should match');
    t.assert.equal(Number(count.variance_quantity), -5, 'Variance should be calculated correctly');

    fixture.cleanup();
  });

  await t.test('Physical inventory status tracking works', async function (t) {
    const fixture = new TestFixture('Physical inventory status tracking works');
    const db = await fixture.setup();

    const warehouse = db.prepare('SELECT id FROM warehouse WHERE code = ?').get('MAIN');
    const currentTime = Math.floor(Date.now() / 1000);

    // Create physical inventory with different status timestamps
    const physicalInventoryId = db.prepare(`
      INSERT INTO physical_inventory (
        count_number, count_date, warehouse_id, count_type, 
        planned_time, planned_by_user
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PI-STATUS-001', currentTime, warehouse.id, 'CYCLE', currentTime, 'test_user').lastInsertRowid;

    // Test planned status
    let inventory = db.prepare('SELECT * FROM physical_inventory WHERE id = ?').get(physicalInventoryId);
    t.assert.equal(Boolean(inventory.planned_time), true, 'Should have planned_time');
    t.assert.equal(inventory.started_time, null, 'Should not have started_time yet');

    // Start the inventory
    db.prepare(`
      UPDATE physical_inventory 
      SET started_time = ?, started_by_user = ?
      WHERE id = ?
    `).run(currentTime + 100, 'start_user', physicalInventoryId);

    // Test started status
    inventory = db.prepare('SELECT * FROM physical_inventory WHERE id = ?').get(physicalInventoryId);
    t.assert.equal(Boolean(inventory.started_time), true, 'Should have started_time');
    t.assert.equal(String(inventory.started_by_user), 'start_user', 'Should track who started');

    // Complete the inventory
    db.prepare(`
      UPDATE physical_inventory 
      SET completed_time = ?, completed_by_user = ?
      WHERE id = ?
    `).run(currentTime + 200, 'complete_user', physicalInventoryId);

    // Test completed status
    inventory = db.prepare('SELECT * FROM physical_inventory WHERE id = ?').get(physicalInventoryId);
    t.assert.equal(Boolean(inventory.completed_time), true, 'Should have completed_time');
    t.assert.equal(String(inventory.completed_by_user), 'complete_user', 'Should track who completed');

    fixture.cleanup();
  });

  await t.test('Physical inventory count variance calculations work', async function (t) {
    const fixture = new TestFixture('Physical inventory count variance calculations work');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('VARIANCE-001', 'Variance Test Product', category.id, 1500, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouse = db.prepare('SELECT id FROM warehouse WHERE code = ?').get('MAIN');
    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = ? LIMIT 1').get(warehouse.id);

    // Create physical inventory
    const physicalInventoryId = db.prepare(`
      INSERT INTO physical_inventory (
        count_number, count_date, warehouse_id, count_type, planned_time, planned_by_user
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PI-VAR-001', Math.floor(Date.now() / 1000), warehouse.id, 'SPOT', Math.floor(Date.now() / 1000), 'test_user').lastInsertRowid;

    // Test positive variance
    const positiveCountId = db.prepare(`
      INSERT INTO physical_inventory_count (
        physical_inventory_id, product_id, warehouse_location_id,
        system_quantity, counted_quantity, unit_cost, pending_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(physicalInventoryId, productId, warehouseLocation.id, 100, 110, 1500, Math.floor(Date.now() / 1000)).lastInsertRowid;

    const positiveCount = db.prepare('SELECT * FROM physical_inventory_count WHERE id = ?').get(positiveCountId);
    t.assert.equal(Number(positiveCount.variance_quantity), 10, 'Positive variance quantity should be 10');
    t.assert.equal(Number(positiveCount.variance_value), 15000, 'Positive variance value should be 15000 (10 * 1500)');

    // Test negative variance
    const negativeCountId = db.prepare(`
      INSERT INTO physical_inventory_count (
        physical_inventory_id, product_id, warehouse_location_id,
        system_quantity, counted_quantity, unit_cost, pending_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(physicalInventoryId, productId, warehouseLocation.id, 100, 85, 1500, Math.floor(Date.now() / 1000)).lastInsertRowid;

    const negativeCount = db.prepare('SELECT * FROM physical_inventory_count WHERE id = ?').get(negativeCountId);
    t.assert.equal(Number(negativeCount.variance_quantity), -15, 'Negative variance quantity should be -15');
    t.assert.equal(Number(negativeCount.variance_value), -22500, 'Negative variance value should be -22500 (-15 * 1500)');

    // Test zero variance
    const zeroCountId = db.prepare(`
      INSERT INTO physical_inventory_count (
        physical_inventory_id, product_id, warehouse_location_id,
        system_quantity, counted_quantity, unit_cost, pending_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(physicalInventoryId, productId, warehouseLocation.id, 100, 100, 1500, Math.floor(Date.now() / 1000)).lastInsertRowid;

    const zeroCount = db.prepare('SELECT * FROM physical_inventory_count WHERE id = ?').get(zeroCountId);
    t.assert.equal(Number(zeroCount.variance_quantity), 0, 'Zero variance quantity should be 0');
    t.assert.equal(Number(zeroCount.variance_value), 0, 'Zero variance value should be 0');

    fixture.cleanup();
  });

  await t.test('Warehouse location hierarchy works', async function (t) {
    const fixture = new TestFixture('Warehouse location hierarchy works');
    const db = await fixture.setup();

    const warehouse = db.prepare('SELECT id FROM warehouse WHERE code = ?').get('MAIN');

    // Test that default locations have proper hierarchy
    const locations = db.prepare(`
      SELECT code, name, zone, aisle, shelf, bin
      FROM warehouse_location 
      WHERE warehouse_id = ?
      ORDER BY code
    `).all(warehouse.id);

    t.assert.equal(locations.length > 0, true, 'Should have warehouse locations');

    // Find a specific location to test hierarchy
    const specificLocation = locations.find(loc => loc.code === 'A01-01-01');
    if (specificLocation) {
      t.assert.equal(String(specificLocation.zone), 'A', 'Zone should be A');
      t.assert.equal(String(specificLocation.aisle), '01', 'Aisle should be 01');
      t.assert.equal(String(specificLocation.shelf), '01', 'Shelf should be 01');
      t.assert.equal(String(specificLocation.bin), '01', 'Bin should be 01');
    }

    // Test special purpose locations
    const receivingLocation = locations.find(loc => loc.code === 'REC');
    t.assert.equal(Boolean(receivingLocation), true, 'Should have receiving location');
    t.assert.equal(String(receivingLocation.zone), 'RECEIVING', 'Receiving zone should be RECEIVING');

    const shippingLocation = locations.find(loc => loc.code === 'SHP');
    t.assert.equal(Boolean(shippingLocation), true, 'Should have shipping location');
    t.assert.equal(String(shippingLocation.zone), 'SHIPPING', 'Shipping zone should be SHIPPING');

    fixture.cleanup();
  });
});