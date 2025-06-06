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
    this.transactionsSchemaPath = join(__dirname, '007_inventory_transactions.sql');
    this.accountingSchemaPath = join(__dirname, '008_inventory_accounting.sql');
    this.controlSchemaPath = join(__dirname, '009_inventory_control.sql');
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
    const accountingContent = await readFile(this.accountingSchemaPath, { encoding: 'utf8' });
    const controlContent = await readFile(this.controlSchemaPath, { encoding: 'utf8' });

    const tempDir = join(tmpdir(), 'pos-sql-tests');
    await mkdir(tempDir, { recursive: true });
    this.dbPath = join(
      tempDir,
      `${this.testRunId}_control_${this.label}.db`,
    );
    this.db = new DatabaseSync(this.dbPath);

    // Execute schemas in order
    this.db.exec(coreAccountingContent);
    this.db.exec(productContent);
    this.db.exec(warehouseContent);
    this.db.exec(trackingContent);
    this.db.exec(transactionsContent);
    this.db.exec(accountingContent);
    this.db.exec(controlContent);

    return this.db;
  }

  cleanup() {
    if (this.db) {
      this.db.close();
    }
  }
}

await test('Inventory Control Schema', async function (t) {
  await t.test('Schema tables are created properly', async function (t) {
    const fixture = new TestFixture('Schema tables are created properly');
    const db = await fixture.setup();

    // Check that all inventory control tables exist
    const tables = [
      'inventory_cutoff_control',
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

  await t.test('Cutoff control management works', async function (t) {
    const fixture = new TestFixture('Cutoff control management works');
    const db = await fixture.setup();

    const warehouse = db.prepare('SELECT id FROM warehouse WHERE code = ?').get('MAIN');
    const currentTime = Math.floor(Date.now() / 1000);

    // Create cutoff control record
    const cutoffId = db.prepare(`
      INSERT INTO inventory_cutoff_control (
        cutoff_date, warehouse_id, last_receipt_number, last_shipment_number,
        last_adjustment_number, cutoff_performed_by, cutoff_time, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(currentTime, warehouse.id, 'REC-001', 'SHP-001', 'ADJ-001', 'test_user', currentTime, 'Period-end cutoff').lastInsertRowid;

    // Verify cutoff control was created
    const cutoff = db.prepare('SELECT * FROM inventory_cutoff_control WHERE id = ?').get(cutoffId);
    t.assert.equal(Boolean(cutoff), true, 'Cutoff control should be created');
    t.assert.equal(String(cutoff.last_receipt_number), 'REC-001', 'Last receipt number should match');
    t.assert.equal(String(cutoff.last_shipment_number), 'SHP-001', 'Last shipment number should match');
    t.assert.equal(String(cutoff.cutoff_performed_by), 'test_user', 'Cutoff performer should match');

    fixture.cleanup();
  });

  await t.test('Physical inventory adjustment automation works', async function (t) {
    const fixture = new TestFixture('Physical inventory adjustment automation works');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost,
        inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('CONTROL-001', 'Control Test Product', category.id, 1000, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouse = db.prepare('SELECT id FROM warehouse WHERE code = ?').get('MAIN');
    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = ? LIMIT 1').get(warehouse.id);

    // Create physical inventory
    const physicalInventoryId = db.prepare(`
      INSERT INTO physical_inventory (
        count_number, count_date, warehouse_id, count_type, planned_time, planned_by_user
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PI-CONTROL-001', Math.floor(Date.now() / 1000), warehouse.id, 'SPOT', Math.floor(Date.now() / 1000), 'test_user').lastInsertRowid;

    // Add initial inventory stock
    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand, unit_cost, last_movement_time
      ) VALUES (?, ?, ?, ?, ?)
    `).run(productId, warehouseLocation.id, 100, 1000, Math.floor(Date.now() / 1000));

    // Create physical inventory count with variance
    const countId = db.prepare(`
      INSERT INTO physical_inventory_count (
        physical_inventory_id, product_id, warehouse_location_id,
        system_quantity, counted_quantity, unit_cost, pending_time, counted_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(physicalInventoryId, productId, warehouseLocation.id, 100, 95, 1000, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Trigger adjustment by setting adjusted_time
    db.prepare(`
      UPDATE physical_inventory_count 
      SET adjusted_time = ?, verified_by_user = ?
      WHERE id = ?
    `).run(Math.floor(Date.now() / 1000), 'verifier_user', countId);

    // Verify that inventory transaction was created automatically
    const adjustmentTransaction = db.prepare(`
      SELECT * FROM inventory_transaction 
      WHERE reference_number LIKE 'PI-ADJ-%'
      ORDER BY created_time DESC
      LIMIT 1
    `).get();

    t.assert.equal(Boolean(adjustmentTransaction), true, 'Adjustment transaction should be created automatically');
    t.assert.equal(String(adjustmentTransaction.transaction_type_code), 'PHYSICAL_COUNT', 'Should be physical count transaction type');
    t.assert.equal(Boolean(adjustmentTransaction.posted_time), true, 'Should be posted automatically');

    // Verify transaction line was created
    const transactionLine = db.prepare(`
      SELECT * FROM inventory_transaction_line 
      WHERE inventory_transaction_id = ?
    `).get(adjustmentTransaction.id);

    t.assert.equal(Boolean(transactionLine), true, 'Transaction line should be created');
    t.assert.equal(Number(transactionLine.quantity), -5, 'Quantity should match variance (-5)');
    t.assert.equal(Number(transactionLine.product_id), Number(productId), 'Product ID should match');

    // Verify journal entry was created
    t.assert.equal(Boolean(adjustmentTransaction.journal_entry_ref), true, 'Journal entry should be linked');

    const journalEntry = db.prepare(`
      SELECT * FROM journal_entry 
      WHERE ref = ?
    `).get(adjustmentTransaction.journal_entry_ref);

    t.assert.equal(Boolean(journalEntry), true, 'Journal entry should be created');
    t.assert.equal(Boolean(journalEntry.post_time), true, 'Journal entry should be posted');

    fixture.cleanup();
  });

  await t.test('Comprehensive journal entry automation works', async function (t) {
    const fixture = new TestFixture('Comprehensive journal entry automation works');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost,
        inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('JOURNAL-001', 'Journal Test Product', category.id, 1000, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    // Test PURCHASE_RECEIPT journal entry automation
    const receiptId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'REC-JOURNAL-001', Math.floor(Date.now() / 1000), 'Journal test receipt', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(receiptId, 1, productId, warehouseLocation.id, 100, 1000);

    // Post the transaction to trigger journal entry creation
    db.prepare('UPDATE inventory_transaction SET posted_time = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), receiptId);

    // Verify journal entry was created and linked
    const receiptTransaction = db.prepare('SELECT * FROM inventory_transaction WHERE id = ?').get(receiptId);
    t.assert.equal(Boolean(receiptTransaction.journal_entry_ref), true, 'Journal entry should be linked to receipt');

    const receiptJournalEntry = db.prepare('SELECT * FROM journal_entry WHERE ref = ?').get(receiptTransaction.journal_entry_ref);
    t.assert.equal(Boolean(receiptJournalEntry), true, 'Journal entry should be created for receipt');
    t.assert.equal(Boolean(receiptJournalEntry.post_time), true, 'Journal entry should be posted');

    // Verify journal entry lines
    const receiptJournalLines = db.prepare('SELECT * FROM journal_entry_line WHERE journal_entry_ref = ? ORDER BY account_code').all(receiptTransaction.journal_entry_ref);
    t.assert.equal(receiptJournalLines.length, 2, 'Should have 2 journal entry lines for receipt');

    // Test SALES_ISSUE journal entry automation
    const issueId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('SALES_ISSUE', 'ISS-JOURNAL-001', Math.floor(Date.now() / 1000), 'Journal test issue', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(issueId, 1, productId, warehouseLocation.id, -30, 1000);

    // Post the issue transaction
    db.prepare('UPDATE inventory_transaction SET posted_time = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), issueId);

    // Verify journal entry was created for issue
    const issueTransaction = db.prepare('SELECT * FROM inventory_transaction WHERE id = ?').get(issueId);
    t.assert.equal(Boolean(issueTransaction.journal_entry_ref), true, 'Journal entry should be linked to issue');

    const issueJournalEntry = db.prepare('SELECT * FROM journal_entry WHERE ref = ?').get(issueTransaction.journal_entry_ref);
    t.assert.equal(Boolean(issueJournalEntry), true, 'Journal entry should be created for issue');
    t.assert.equal(Boolean(issueJournalEntry.post_time), true, 'Journal entry should be posted');

    fixture.cleanup();
  });

  await t.test('Adjustment journal entries work correctly', async function (t) {
    const fixture = new TestFixture('Adjustment journal entries work correctly');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost,
        inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('ADJ-001', 'Adjustment Test Product', category.id, 1000, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    // Test positive adjustment
    const positiveAdjId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('ADJUSTMENT_POSITIVE', 'ADJ-POS-001', Math.floor(Date.now() / 1000), 'Positive adjustment test', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(positiveAdjId, 1, productId, warehouseLocation.id, 10, 1000);

    // Post positive adjustment
    db.prepare('UPDATE inventory_transaction SET posted_time = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), positiveAdjId);

    // Verify positive adjustment journal entry
    const positiveAdj = db.prepare('SELECT * FROM inventory_transaction WHERE id = ?').get(positiveAdjId);
    t.assert.equal(Boolean(positiveAdj.journal_entry_ref), true, 'Positive adjustment should have journal entry');

    const positiveJournalLines = db.prepare('SELECT * FROM journal_entry_line WHERE journal_entry_ref = ? ORDER BY account_code').all(positiveAdj.journal_entry_ref);
    t.assert.equal(positiveJournalLines.length, 2, 'Positive adjustment should have 2 journal lines');

    // Test negative adjustment
    const negativeAdjId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('ADJUSTMENT_NEGATIVE', 'ADJ-NEG-001', Math.floor(Date.now() / 1000), 'Negative adjustment test', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(negativeAdjId, 1, productId, warehouseLocation.id, -5, 1000);

    // Post negative adjustment
    db.prepare('UPDATE inventory_transaction SET posted_time = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), negativeAdjId);

    // Verify negative adjustment journal entry
    const negativeAdj = db.prepare('SELECT * FROM inventory_transaction WHERE id = ?').get(negativeAdjId);
    t.assert.equal(Boolean(negativeAdj.journal_entry_ref), true, 'Negative adjustment should have journal entry');

    const negativeJournalLines = db.prepare('SELECT * FROM journal_entry_line WHERE journal_entry_ref = ? ORDER BY account_code').all(negativeAdj.journal_entry_ref);
    t.assert.equal(negativeJournalLines.length, 2, 'Negative adjustment should have 2 journal lines');

    fixture.cleanup();
  });

  await t.test('Manufacturing transaction journal entries work', async function (t) {
    const fixture = new TestFixture('Manufacturing transaction journal entries work');
    const db = await fixture.setup();

    // Create test products
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const rawMaterialId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost,
        inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('RAW-001', 'Raw Material', category.id, 500, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const finishedGoodId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost,
        inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('FG-001', 'Finished Good', category.id, 1500, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    // Add initial stock for raw materials
    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand, unit_cost, last_movement_time
      ) VALUES (?, ?, ?, ?, ?)
    `).run(rawMaterialId, warehouseLocation.id, 50, 500, Math.floor(Date.now() / 1000));

    // Test manufacturing issue (raw materials to WIP)
    const mfgIssueId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('MANUFACTURING_ISSUE', 'MFG-ISS-001', Math.floor(Date.now() / 1000), 'Manufacturing issue test', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(mfgIssueId, 1, rawMaterialId, warehouseLocation.id, -10, 500);

    // Post manufacturing issue
    db.prepare('UPDATE inventory_transaction SET posted_time = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), mfgIssueId);

    // Verify manufacturing issue journal entry
    const mfgIssue = db.prepare('SELECT * FROM inventory_transaction WHERE id = ?').get(mfgIssueId);
    t.assert.equal(Boolean(mfgIssue.journal_entry_ref), true, 'Manufacturing issue should have journal entry');

    // Test manufacturing receipt (WIP to finished goods)
    const mfgReceiptId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('MANUFACTURING_RECEIPT', 'MFG-REC-001', Math.floor(Date.now() / 1000), 'Manufacturing receipt test', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(mfgReceiptId, 1, finishedGoodId, warehouseLocation.id, 5, 1500);

    // Post manufacturing receipt
    db.prepare('UPDATE inventory_transaction SET posted_time = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), mfgReceiptId);

    // Verify manufacturing receipt journal entry
    const mfgReceipt = db.prepare('SELECT * FROM inventory_transaction WHERE id = ?').get(mfgReceiptId);
    t.assert.equal(Boolean(mfgReceipt.journal_entry_ref), true, 'Manufacturing receipt should have journal entry');

    fixture.cleanup();
  });

  await t.test('Write-off transaction journal entries work', async function (t) {
    const fixture = new TestFixture('Write-off transaction journal entries work');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost,
        inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('WRITEOFF-001', 'Write-off Test Product', category.id, 1000, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    // Add initial stock for write-offs
    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand, unit_cost, last_movement_time
      ) VALUES (?, ?, ?, ?, ?)
    `).run(productId, warehouseLocation.id, 50, 1000, Math.floor(Date.now() / 1000));

    // Test obsolescence write-off
    const obsolescenceId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('OBSOLESCENCE_WRITEOFF', 'OBS-001', Math.floor(Date.now() / 1000), 'Obsolescence write-off test', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(obsolescenceId, 1, productId, warehouseLocation.id, -10, 1000);

    // Post obsolescence write-off
    db.prepare('UPDATE inventory_transaction SET posted_time = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), obsolescenceId);

    // Verify obsolescence write-off journal entry
    const obsolescence = db.prepare('SELECT * FROM inventory_transaction WHERE id = ?').get(obsolescenceId);
    t.assert.equal(Boolean(obsolescence.journal_entry_ref), true, 'Obsolescence write-off should have journal entry');

    // Test damage write-off
    const damageId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('DAMAGE_WRITEOFF', 'DMG-001', Math.floor(Date.now() / 1000), 'Damage write-off test', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(damageId, 1, productId, warehouseLocation.id, -5, 1000);

    // Post damage write-off
    db.prepare('UPDATE inventory_transaction SET posted_time = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), damageId);

    // Verify damage write-off journal entry
    const damage = db.prepare('SELECT * FROM inventory_transaction WHERE id = ?').get(damageId);
    t.assert.equal(Boolean(damage.journal_entry_ref), true, 'Damage write-off should have journal entry');

    fixture.cleanup();
  });

  await t.test('Journal entry posting automation works', async function (t) {
    const fixture = new TestFixture('Journal entry posting automation works');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost,
        inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('AUTO-POST-001', 'Auto Post Test Product', category.id, 1000, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    // Create transaction
    const transactionId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'AUTO-POST-001', Math.floor(Date.now() / 1000), 'Auto posting test', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(transactionId, 1, productId, warehouseLocation.id, 100, 1000);

    const postTime = Math.floor(Date.now() / 1000);

    // Post the transaction
    db.prepare('UPDATE inventory_transaction SET posted_time = ? WHERE id = ?').run(postTime, transactionId);

    // Verify journal entry was created and posted automatically
    const transaction = db.prepare('SELECT * FROM inventory_transaction WHERE id = ?').get(transactionId);
    t.assert.equal(Boolean(transaction.journal_entry_ref), true, 'Journal entry should be linked');

    const journalEntry = db.prepare('SELECT * FROM journal_entry WHERE ref = ?').get(transaction.journal_entry_ref);
    t.assert.equal(Boolean(journalEntry), true, 'Journal entry should be created');
    t.assert.equal(Boolean(journalEntry.post_time), true, 'Journal entry should be posted automatically');
    t.assert.equal(Number(journalEntry.post_time), postTime, 'Journal entry post time should match transaction post time');

    // Verify journal entry lines were created
    const journalLines = db.prepare('SELECT COUNT(*) as count FROM journal_entry_line WHERE journal_entry_ref = ?').get(transaction.journal_entry_ref);
    t.assert.equal(Number(journalLines.count) >= 2, true, 'Should have at least 2 journal entry lines');

    fixture.cleanup();
  });

  await t.test('Transaction types that do not create journal entries are handled correctly', async function (t) {
    const fixture = new TestFixture('Transaction types that do not create journal entries are handled correctly');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1').get();
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost,
        inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('NO-JOURNAL-001', 'No Journal Test Product', category.id, 1000, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1').get('MAIN');

    // Add initial stock for transfer
    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand, unit_cost, last_movement_time
      ) VALUES (?, ?, ?, ?, ?)
    `).run(productId, warehouseLocation.id, 50, 1000, Math.floor(Date.now() / 1000));

    // Create transfer out transaction (should not create journal entry)
    const transferOutId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('TRANSFER_OUT', 'XFER-OUT-001', Math.floor(Date.now() / 1000), 'Transfer out test', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(transferOutId, 1, productId, warehouseLocation.id, -10, 1000);

    // Post the transfer out transaction
    db.prepare('UPDATE inventory_transaction SET posted_time = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), transferOutId);

    // Verify no journal entry was created
    const transferOut = db.prepare('SELECT * FROM inventory_transaction WHERE id = ?').get(transferOutId);
    t.assert.equal(transferOut.journal_entry_ref, null, 'Transfer out should not have journal entry');

    fixture.cleanup();
  });
});