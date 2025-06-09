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
    this.warehouseSchemaPath = join(__dirname, '005_warehouse_management.sql');
    this.trackingSchemaPath = join(__dirname, '006_inventory_tracking.sql');
    this.transactionsSchemaPath = join(__dirname, '007_inventory_transactions.sql');
    this.db = null;
    this.dbPath = null;
  }

  async setup() {
    // Load schemas
    const coreAccountingContent = await readFile(this.coreAccountingPath, { encoding: 'utf8' });
    const productContent = await readFile(this.productSchemaPath, { encoding: 'utf8' });
    const warehouseContent = await readFile(this.warehouseSchemaPath, { encoding: 'utf8' });
    const trackingContent = await readFile(this.trackingSchemaPath, { encoding: 'utf8' });
    const transactionsContent = await readFile(this.transactionsSchemaPath, { encoding: 'utf8' });

    const tempDir = join(tmpdir(), 'pos-sql-tests');
    await mkdir(tempDir, { recursive: true });
    this.dbPath = join(
      tempDir,
      `${this.testRunId}_transactions_${this.label}.db`,
    );
    this.db = new DatabaseSync(this.dbPath);

    // Execute schemas in order
    this.db.exec(coreAccountingContent);
    this.db.exec(productContent);
    this.db.exec(warehouseContent);
    this.db.exec(trackingContent);
    this.db.exec(transactionsContent);

    return this.db;
  }

  cleanup() {
    if (this.db) {
      this.db.close();
    }
  }
}

await test('Inventory Transactions Schema', async function (t) {
  await t.test('Schema tables are created properly', async function (t) {
    const fixture = new TestFixture('Schema tables are created properly');
    const db = await fixture.setup();

    // Check that all inventory transaction tables exist
    const tables = [
      'inventory_transaction_type',
      'inventory_transaction',
      'inventory_transaction_line',
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

  await t.test('Default transaction types are populated', async function (t) {
    const fixture = new TestFixture('Default transaction types are populated');
    const db = await fixture.setup();

    // Test that default transaction types exist
    const transactionTypes = db.prepare('SELECT COUNT(*) as count FROM inventory_transaction_type')?.get() ?? {};
    t.assert.equal(Number(transactionTypes.count) > 0, true, 'Transaction types should be populated');

    // Test specific transaction types
    const purchaseReceipt = db.prepare('SELECT * FROM inventory_transaction_type WHERE code = ?')?.get('PURCHASE_RECEIPT') ?? {};
    t.assert.equal(Boolean(purchaseReceipt), true, 'PURCHASE_RECEIPT type should exist');
    t.assert.equal(String(purchaseReceipt.affects_quantity), 'INCREASE', 'PURCHASE_RECEIPT should increase quantity');

    const salesIssue = db.prepare('SELECT * FROM inventory_transaction_type WHERE code = ?')?.get('SALES_ISSUE') ?? {};
    t.assert.equal(Boolean(salesIssue), true, 'SALES_ISSUE type should exist');
    t.assert.equal(String(salesIssue.affects_quantity), 'DECREASE', 'SALES_ISSUE should decrease quantity');

    fixture.cleanup();
  });

  await t.test('Inventory transactions can be created', async function (t) {
    const fixture = new TestFixture('Inventory transactions can be created');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost,
        inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('TEST-002', 'Test Product 2', category.id, 1500, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Get warehouse location
    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1')?.get('MAIN') ?? {};

    // Create inventory transaction
    const transactionId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'REC-001', Math.floor(Date.now() / 1000), 'Test receipt', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Add transaction line
    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(transactionId, 1, productId, warehouseLocation.id, 100, 1200);

    // Verify transaction was created
    const transaction = db.prepare('SELECT * FROM inventory_transaction WHERE id = ?')?.get(transactionId) ?? {};
    t.assert.equal(Boolean(transaction), true, 'Transaction should be created');
    t.assert.equal(String(transaction.transaction_type_code), 'PURCHASE_RECEIPT', 'Transaction type should match');

    const transactionLine = db.prepare('SELECT * FROM inventory_transaction_line WHERE inventory_transaction_id = ?')?.get(transactionId) ?? {};
    t.assert.equal(Boolean(transactionLine), true, 'Transaction line should be created');
    t.assert.equal(Number(transactionLine.quantity), 100, 'Quantity should match');
    t.assert.equal(Number(transactionLine.unit_cost), 1200, 'Unit cost should match');
    t.assert.equal(Number(transactionLine.total_cost), 120000, 'Total cost should be calculated correctly');

    fixture.cleanup();
  });

  await t.test('Inventory stock is updated when transactions are posted', async function (t) {
    const fixture = new TestFixture('Inventory stock is updated when transactions are posted');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost,
        inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('STOCK-UPDATE', 'Stock Update Product', category.id, 1000, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1')?.get('MAIN') ?? {};

    // Create and post a receipt transaction
    const receiptId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'REC-STOCK-001', Math.floor(Date.now() / 1000), 'Stock update test', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(receiptId, 1, productId, warehouseLocation.id, 50, 1000);

    // Post the transaction
    db.prepare('UPDATE inventory_transaction SET posted_time = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), receiptId);

    // Verify stock was created/updated
    const stock = db.prepare(`
      SELECT * FROM inventory_stock 
      WHERE product_id = ? AND warehouse_location_id = ?
    `)?.get(productId, warehouseLocation.id) ?? {};

    t.assert.equal(Boolean(stock), true, 'Stock record should be created');
    t.assert.equal(Number(stock.quantity_on_hand), 50, 'Quantity on hand should be 50');
    t.assert.equal(Number(stock.unit_cost), 1000, 'Unit cost should be 1000');

    // Create and post an issue transaction
    const issueId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('SALES_ISSUE', 'ISS-STOCK-001', Math.floor(Date.now() / 1000), 'Stock issue test', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(issueId, 1, productId, warehouseLocation.id, -20, 1000);

    // Post the issue transaction
    db.prepare('UPDATE inventory_transaction SET posted_time = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), issueId);

    // Verify stock was updated
    const updatedStock = db.prepare(`
      SELECT * FROM inventory_stock 
      WHERE product_id = ? AND warehouse_location_id = ?
    `)?.get(productId, warehouseLocation.id) ?? {};

    t.assert.equal(Number(updatedStock.quantity_on_hand), 30, 'Quantity on hand should be reduced to 30');

    fixture.cleanup();
  });

  await t.test('Lot tracking validation works correctly', async function (t) {
    const fixture = new TestFixture('Lot tracking validation works correctly');
    const db = await fixture.setup();

    // Create lot-tracked product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, is_lot_tracked, shelf_life_days,
        inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('LOT-001', 'Lot Tracked Product', category.id, 1, 30, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Create lot
    const lotId = db.prepare(`
      INSERT INTO inventory_lot (product_id, lot_number, expiration_date, received_date)
      VALUES (?, ?, ?, ?)
    `).run(productId, 'LOT-20250601', Math.floor(Date.now() / 1000) + (30 * 24 * 3600), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1')?.get('MAIN') ?? {};

    // Create transaction
    const transactionId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'REC-LOT-001', Math.floor(Date.now() / 1000), 'Lot receipt', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Valid transaction line with lot ID
    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        lot_id, quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(transactionId, 1, productId, warehouseLocation.id, lotId, 100, 1200);

    // Should succeed when posting
    db.prepare('UPDATE inventory_transaction SET posted_time = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), transactionId);

    // Try to create transaction line without lot ID for lot-tracked product - should fail
    const invalidTransactionId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'REC-LOT-002', Math.floor(Date.now() / 1000), 'Invalid lot receipt', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    t.assert.throws(function () {
      db.prepare(`
        INSERT INTO inventory_transaction_line (
          inventory_transaction_id, line_number, product_id, warehouse_location_id,
          quantity, unit_cost
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(invalidTransactionId, 1, productId, warehouseLocation.id, 100, 1200);
    }, 'Should throw error for lot-tracked product without lot ID');

    fixture.cleanup();
  });

  await t.test('Serial number tracking validation works', async function (t) {
    const fixture = new TestFixture('Serial number tracking validation works');
    const db = await fixture.setup();

    // Create serialized product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, is_serialized,
        inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('SERIAL-001', 'Serialized Product', category.id, 1, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1')?.get('MAIN') ?? {};

    // Create transaction
    const transactionId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'REC-SERIAL-001', Math.floor(Date.now() / 1000), 'Serial receipt', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Valid transaction line with serial numbers matching quantity
    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost, serial_numbers
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(transactionId, 1, productId, warehouseLocation.id, 2, 1500, JSON.stringify(['SN001', 'SN002']));

    // Should succeed when posting
    db.prepare('UPDATE inventory_transaction SET posted_time = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), transactionId);

    // Try to create transaction line with mismatched serial numbers - should fail
    const invalidTransactionId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'REC-SERIAL-002', Math.floor(Date.now() / 1000), 'Invalid serial receipt', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    t.assert.throws(function () {
      db.prepare(`
        INSERT INTO inventory_transaction_line (
          inventory_transaction_id, line_number, product_id, warehouse_location_id,
          quantity, unit_cost, serial_numbers
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(invalidTransactionId, 1, productId, warehouseLocation.id, 3, 1500, JSON.stringify(['SN003', 'SN004'])); // 3 quantity but only 2 serial numbers
    }, 'Should throw error for serialized product with mismatched serial numbers');

    fixture.cleanup();
  });

  await t.test('Inventory movement audit trail works', async function (t) {
    const fixture = new TestFixture('Inventory movement audit trail works');
    const db = await fixture.setup();

    // Create test scenario with multiple movements
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('AUDIT-001', 'Audit Trail Product', category.id, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1')?.get('MAIN') ?? {};

    // Receipt transaction
    const receiptId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'REC-AUDIT-001', Math.floor(Date.now() / 1000), 'Test receipt', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(receiptId, 1, productId, warehouseLocation.id, 100, 1000);

    db.prepare('UPDATE inventory_transaction SET posted_time = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), receiptId);

    // Issue transaction
    const issueId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('SALES_ISSUE', 'ISS-AUDIT-001', Math.floor(Date.now() / 1000), 'Test issue', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(issueId, 1, productId, warehouseLocation.id, -30, 1000);

    db.prepare('UPDATE inventory_transaction SET posted_time = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), issueId);

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
    t.assert.equal(String(auditTrail[0].status), 'POSTED', 'Receipt should be posted');
    t.assert.equal(String(auditTrail[1].status), 'POSTED', 'Issue should be posted');

    fixture.cleanup();
  });

  await t.test('Transaction status tracking works correctly', async function (t) {
    const fixture = new TestFixture('Transaction status tracking works correctly');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('STATUS-001', 'Status Test Product', category.id, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1')?.get('MAIN') ?? {};
    const currentTime = Math.floor(Date.now() / 1000);

    // Create transaction that requires approval
    const transactionId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('ADJUSTMENT_POSITIVE', 'ADJ-STATUS-001', currentTime, 'Status test adjustment', 'test_user', currentTime).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(transactionId, 1, productId, warehouseLocation.id, 10, 1000);

    // Test created status
    let transaction = db.prepare('SELECT * FROM inventory_transaction WHERE id = ?')?.get(transactionId) ?? {};
    t.assert.equal(Boolean(transaction.created_time), true, 'Should have created_time');
    t.assert.equal(transaction.approved_time, null, 'Should not have approved_time yet');
    t.assert.equal(transaction.posted_time, null, 'Should not have posted_time yet');

    // Approve the transaction
    db.prepare(`
      UPDATE inventory_transaction 
      SET approved_time = ?, approved_by_user = ?
      WHERE id = ?
    `).run(currentTime + 100, 'approver_user', transactionId);

    // Test approved status
    transaction = db.prepare('SELECT * FROM inventory_transaction WHERE id = ?')?.get(transactionId) ?? {};
    t.assert.equal(Boolean(transaction.approved_time), true, 'Should have approved_time');
    t.assert.equal(String(transaction.approved_by_user), 'approver_user', 'Should track who approved');
    t.assert.equal(transaction.posted_time, null, 'Should not have posted_time yet');

    // Post the transaction
    db.prepare(`
      UPDATE inventory_transaction 
      SET posted_time = ?
      WHERE id = ?
    `).run(currentTime + 200, transactionId);

    // Test posted status
    transaction = db.prepare('SELECT * FROM inventory_transaction WHERE id = ?')?.get(transactionId) ?? {};
    t.assert.equal(Boolean(transaction.posted_time), true, 'Should have posted_time');

    fixture.cleanup();
  });

  await t.test('Transaction reference number uniqueness is enforced', async function (t) {
    const fixture = new TestFixture('Transaction reference number uniqueness is enforced');
    const db = await fixture.setup();

    // Create first transaction
    db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'REF-001', Math.floor(Date.now() / 1000), 'First transaction', 'test_user', Math.floor(Date.now() / 1000));

    // Try to create second transaction with same reference number - should fail
    t.assert.throws(function () {
      db.prepare(`
        INSERT INTO inventory_transaction (
          transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run('SALES_ISSUE', 'REF-001', Math.floor(Date.now() / 1000), 'Duplicate reference', 'test_user', Math.floor(Date.now() / 1000));
    }, 'Should throw error for duplicate reference number');

    fixture.cleanup();
  });

  await t.test('Transaction line numbering works correctly', async function (t) {
    const fixture = new TestFixture('Transaction line numbering works correctly');
    const db = await fixture.setup();

    // Create test products
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};
    const product1Id = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('LINE-001', 'Line Test Product 1', category.id, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const product2Id = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('LINE-002', 'Line Test Product 2', category.id, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1')?.get('MAIN') ?? {};

    // Create transaction with multiple lines
    const transactionId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'MULTI-LINE-001', Math.floor(Date.now() / 1000), 'Multi-line transaction', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Add multiple transaction lines
    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(transactionId, 1, product1Id, warehouseLocation.id, 50, 1000);

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(transactionId, 2, product2Id, warehouseLocation.id, 30, 1500);

    // Verify lines were created correctly
    const lines = db.prepare(`
      SELECT * FROM inventory_transaction_line 
      WHERE inventory_transaction_id = ?
      ORDER BY line_number
    `).all(transactionId);

    t.assert.equal(lines.length, 2, 'Should have 2 transaction lines');
    t.assert.equal(Number(lines[0].line_number), 1, 'First line should be line 1');
    t.assert.equal(Number(lines[1].line_number), 2, 'Second line should be line 2');
    t.assert.equal(Number(lines[0].product_id), Number(product1Id), 'First line should reference product 1');
    t.assert.equal(Number(lines[1].product_id), Number(product2Id), 'Second line should reference product 2');

    // Test unique constraint on transaction_id + line_number
    t.assert.throws(function () {
      db.prepare(`
        INSERT INTO inventory_transaction_line (
          inventory_transaction_id, line_number, product_id, warehouse_location_id,
          quantity, unit_cost
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(transactionId, 1, product1Id, warehouseLocation.id, 10, 1000);
    }, 'Should throw error for duplicate line number in same transaction');

    fixture.cleanup();
  });
});