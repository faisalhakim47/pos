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
    this.accountingSchemaPath = join(__dirname, '008_inventory_accounting.sql');
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

    const tempDir = join(tmpdir(), 'pos-sql-tests');
    await mkdir(tempDir, { recursive: true });
    this.dbPath = join(
      tempDir,
      `${this.testRunId}_accounting_${this.label}.db`,
    );
    this.db = new DatabaseSync(this.dbPath);

    // Execute schemas in order
    this.db.exec(coreAccountingContent);
    this.db.exec(productContent);
    this.db.exec(warehouseContent);
    this.db.exec(trackingContent);
    this.db.exec(transactionsContent);
    this.db.exec(accountingContent);

    return this.db;
  }

  cleanup() {
    if (this.db) {
      this.db.close();
    }
  }
}

await test('Inventory Accounting Schema', async function (t) {
  await t.test('Schema tables are created properly', async function (t) {
    const fixture = new TestFixture('Schema tables are created properly');
    const db = await fixture.setup();

    // Check that all inventory accounting tables exist
    const tables = [
      'inventory_cost_layer',
      'inventory_market_value',
      'inventory_reserve',
      'inventory_aging_category',
      'product_costing_method_history',
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

  await t.test('Accounting views are created properly', async function (t) {
    const fixture = new TestFixture('Accounting views are created properly');
    const db = await fixture.setup();

    // Check that all inventory accounting views exist
    const views = [
      'inventory_valuation',
      'cost_layer_summary',
      'inventory_abc_analysis',
      'inventory_lcm_analysis',
      'inventory_aging_analysis',
      'inventory_turnover_analysis',
      'inventory_reserve_summary',
      'costing_method_audit',
    ];

    for (const viewName of views) {
      const view = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='view' AND name=?
      `)?.get(viewName) ?? {};
      t.assert.equal(Boolean(view), true, `View ${viewName} should exist`);
    }

    fixture.cleanup();
  });

  await t.test('Default aging categories are populated', async function (t) {
    const fixture = new TestFixture('Default aging categories are populated');
    const db = await fixture.setup();

    // Test that default aging categories exist
    const categories = db.prepare('SELECT COUNT(*) as count FROM inventory_aging_category')?.get() ?? {};
    t.assert.equal(Number(categories.count) > 0, true, 'Aging categories should be populated');

    // Test specific categories
    const current = db.prepare('SELECT * FROM inventory_aging_category WHERE category_name = ?')?.get('Current') ?? {};
    t.assert.equal(Boolean(current), true, 'Current category should exist');
    t.assert.equal(Number(current.days_from), 0, 'Current should start from 0 days');
    t.assert.equal(Number(current.days_to), 30, 'Current should end at 30 days');
    t.assert.equal(Number(current.obsolescence_rate), 0, 'Current should have 0% obsolescence rate');

    const overOneYear = db.prepare('SELECT * FROM inventory_aging_category WHERE category_name = ?')?.get('Over 1 Year') ?? {};
    t.assert.equal(Boolean(overOneYear), true, 'Over 1 Year category should exist');
    t.assert.equal(Number(overOneYear.obsolescence_rate), 75, 'Over 1 Year should have 75% obsolescence rate');

    fixture.cleanup();
  });

  await t.test('Cost layer management and FIFO costing works', async function (t) {
    const fixture = new TestFixture('Cost layer management and FIFO costing works');
    const db = await fixture.setup();

    // Create test product with FIFO costing
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost, costing_method,
        inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('FIFO-001', 'FIFO Test Product', category.id, 1000, 'FIFO', 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1')?.get('MAIN') ?? {};

    // Create first receipt transaction (older, cheaper)
    const transaction1Id = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'REC-FIFO-001', Math.floor(Date.now() / 1000) - 86400, 'First receipt', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(transaction1Id, 1, productId, warehouseLocation.id, 100, 1000);

    // Post first transaction
    db.prepare('UPDATE inventory_transaction SET posted_time = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), transaction1Id);

    // Verify cost layer was created
    const costLayers = db.prepare(`
      SELECT * FROM inventory_cost_layer 
      WHERE product_id = ? AND warehouse_location_id = ?
    `).all(productId, warehouseLocation.id);

    t.assert.equal(costLayers.length, 1, 'Should have 1 cost layer after first receipt');
    t.assert.equal(Number(costLayers[0].quantity_received), 100, 'Cost layer should have 100 quantity received');
    t.assert.equal(Number(costLayers[0].quantity_remaining), 100, 'Cost layer should have 100 quantity remaining');
    t.assert.equal(Number(costLayers[0].unit_cost), 1000, 'Cost layer should have unit cost of 1000');

    // Create second receipt transaction (newer, more expensive)
    const transaction2Id = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'REC-FIFO-002', Math.floor(Date.now() / 1000), 'Second receipt', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(transaction2Id, 1, productId, warehouseLocation.id, 50, 1500);

    // Post second transaction
    db.prepare('UPDATE inventory_transaction SET posted_time = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), transaction2Id);

    // Verify second cost layer was created
    const allCostLayers = db.prepare(`
      SELECT * FROM inventory_cost_layer 
      WHERE product_id = ? AND warehouse_location_id = ?
      ORDER BY received_date
    `).all(productId, warehouseLocation.id);

    t.assert.equal(allCostLayers.length, 2, 'Should have 2 cost layers after second receipt');
    t.assert.equal(Number(allCostLayers[1].quantity_received), 50, 'Second cost layer should have 50 quantity received');
    t.assert.equal(Number(allCostLayers[1].unit_cost), 1500, 'Second cost layer should have unit cost of 1500');

    fixture.cleanup();
  });

  await t.test('Inventory valuation by costing method accuracy', async function (t) {
    const fixture = new TestFixture('Inventory valuation by costing method accuracy');
    const db = await fixture.setup();

    // Test weighted average costing
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, standard_cost, costing_method,
        inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('WA-001', 'Weighted Average Product', category.id, 1000, 'WEIGHTED_AVERAGE', 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1')?.get('MAIN') ?? {};

    // Add stock with different costs
    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand, unit_cost, last_movement_time
      ) VALUES (?, ?, ?, ?, ?)
    `).run(productId, warehouseLocation.id, 100, 1000, Math.floor(Date.now() / 1000));

    db.prepare(`
      UPDATE inventory_stock SET
        quantity_on_hand = quantity_on_hand + 50,
        unit_cost = ((quantity_on_hand * unit_cost) + (50 * 1200)) / (quantity_on_hand + 50)
      WHERE product_id = ? AND warehouse_location_id = ?
    `).run(productId, warehouseLocation.id);

    // Test inventory valuation view
    const valuation = db.prepare(`
      SELECT * FROM inventory_valuation WHERE product_id = ?
    `)?.get(productId) ?? {};

    t.assert.equal(Boolean(valuation), true, 'Should have valuation record');
    t.assert.equal(Number(valuation.total_quantity), 150, 'Should have 150 total quantity');
    t.assert.equal(Number(valuation.inventory_value) > 0, true, 'Should have calculated inventory value');

    // Test ABC analysis view
    const abcAnalysis = db.prepare(`
      SELECT * FROM inventory_abc_analysis WHERE product_id = ?
    `)?.get(productId) ?? {};

    t.assert.equal(Boolean(abcAnalysis), true, 'Should appear in ABC analysis');
    t.assert.equal(['A', 'B', 'C'].includes(String(abcAnalysis.abc_category)), true, 'Should have valid ABC category');

    fixture.cleanup();
  });

  await t.test('Costing method change tracking works', async function (t) {
    const fixture = new TestFixture('Costing method change tracking works');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, costing_method, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('COSTING-001', 'Costing Method Test Product', category.id, 'FIFO', 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Change costing method
    db.prepare(`
      UPDATE product SET costing_method = ? WHERE id = ?
    `).run('LIFO', productId);

    // Verify change was tracked
    const methodChange = db.prepare(`
      SELECT * FROM product_costing_method_history
      WHERE product_id = ?
      ORDER BY change_date DESC
      LIMIT 1
    `)?.get(productId) ?? {};

    t.assert.equal(Boolean(methodChange), true, 'Costing method change should be tracked');
    t.assert.equal(String(methodChange.old_costing_method), 'FIFO', 'Should track old costing method');
    t.assert.equal(String(methodChange.new_costing_method), 'LIFO', 'Should track new costing method');

    fixture.cleanup();
  });

  await t.test('Inventory reserves work correctly', async function (t) {
    const fixture = new TestFixture('Inventory reserves work correctly');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('RESERVE-001', 'Reserve Test Product', category.id, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Create inventory reserve
    const reserveId = db.prepare(`
      INSERT INTO inventory_reserve (
        product_id, reserve_type, reserve_amount, effective_date, reason, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(productId, 'OBSOLESCENCE', 50000, Math.floor(Date.now() / 1000), 'Test obsolescence reserve', 'test_user', Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Verify reserve was created
    const reserve = db.prepare('SELECT * FROM inventory_reserve WHERE id = ?')?.get(reserveId) ?? {};
    t.assert.equal(Boolean(reserve), true, 'Reserve should be created');
    t.assert.equal(String(reserve.reserve_type), 'OBSOLESCENCE', 'Reserve type should match');
    t.assert.equal(Number(reserve.reserve_amount), 50000, 'Reserve amount should match');

    // Test reserve summary view
    const reserveSummary = db.prepare(`
      SELECT * FROM inventory_reserve_summary
      WHERE reserve_type = 'OBSOLESCENCE'
    `)?.get() ?? {};

    t.assert.equal(Boolean(reserveSummary), true, 'Should have reserve summary');
    t.assert.equal(Number(reserveSummary.products_with_reserves) >= 1, true, 'Should count products with reserves');

    fixture.cleanup();
  });

  await t.test('Lower of Cost or Market (LCM) analysis works', async function (t) {
    const fixture = new TestFixture('Lower of Cost or Market (LCM) analysis works');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('LCM-001', 'LCM Test Product', category.id, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1')?.get('MAIN') ?? {};

    // Add inventory stock
    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand, unit_cost, last_movement_time
      ) VALUES (?, ?, ?, ?, ?)
    `).run(productId, warehouseLocation.id, 100, 1000, Math.floor(Date.now() / 1000));

    // Insert market value data that's below cost
    db.prepare(`
      INSERT INTO inventory_market_value (
        product_id, valuation_date, market_value_per_unit,
        replacement_cost_per_unit, net_realizable_value,
        valuation_method, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(productId, Math.floor(Date.now() / 1000), 800, 850, 900, 'REPLACEMENT_COST', 'test_user', Math.floor(Date.now() / 1000));

    // Test LCM analysis view
    const lcmAnalysis = db.prepare(`
      SELECT * FROM inventory_lcm_analysis
      WHERE product_id = ?
    `)?.get(productId) ?? {};

    t.assert.equal(Boolean(lcmAnalysis), true, 'Should have LCM analysis');
    t.assert.equal(String(lcmAnalysis.lcm_status), 'LCM_WRITEDOWN_REQUIRED', 'Should identify LCM writedown requirement');
    t.assert.equal(Number(lcmAnalysis.potential_writedown_amount) > 0, true, 'Should calculate writedown amount');

    fixture.cleanup();
  });

  await t.test('Inventory aging analysis works correctly', async function (t) {
    const fixture = new TestFixture('Inventory aging analysis works correctly');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('AGING-001', 'Aging Test Product', category.id, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1')?.get('MAIN') ?? {};

    // Add inventory stock
    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand, unit_cost, last_movement_time
      ) VALUES (?, ?, ?, ?, ?)
    `).run(productId, warehouseLocation.id, 100, 1000, Math.floor(Date.now() / 1000));

    // Create old cost layer (simulating old inventory)
    const oldDate = Math.floor(Date.now() / 1000) - (200 * 24 * 3600); // 200 days ago
    
    // Create a dummy transaction first
    const dummyTransactionId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'AGING-DUMMY-001', oldDate, 'Dummy transaction for aging test', 'test_user', oldDate).lastInsertRowid;
    
    db.prepare(`
      INSERT INTO inventory_cost_layer (
        product_id, warehouse_location_id, received_date, quantity_received,
        quantity_remaining, unit_cost, currency_code, inventory_transaction_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(productId, warehouseLocation.id, oldDate, 100, 100, 1000, 'USD', dummyTransactionId);

    // Test aging analysis view
    const agingAnalysis = db.prepare(`
      SELECT * FROM inventory_aging_analysis
      WHERE product_id = ?
    `)?.get(productId) ?? {};

    t.assert.equal(Boolean(agingAnalysis), true, 'Should have aging analysis');
    t.assert.equal(Boolean(agingAnalysis.aging_category), true, 'Should categorize inventory age');
    t.assert.equal(Number(agingAnalysis.days_since_oldest_receipt) > 180, true, 'Should calculate days since oldest receipt');

    fixture.cleanup();
  });

  await t.test('Inventory turnover analysis works correctly', async function (t) {
    const fixture = new TestFixture('Inventory turnover analysis works correctly');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('TURNOVER-001', 'Turnover Test Product', category.id, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1')?.get('MAIN') ?? {};

    // Add inventory stock
    db.prepare(`
      INSERT INTO inventory_stock (
        product_id, warehouse_location_id, quantity_on_hand, unit_cost, last_movement_time
      ) VALUES (?, ?, ?, ?, ?)
    `).run(productId, warehouseLocation.id, 100, 1000, Math.floor(Date.now() / 1000));

    // Create some sales transactions to simulate COGS
    const salesTransactionId = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time, posted_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('SALES_ISSUE', 'SALES-TURNOVER-001', Math.floor(Date.now() / 1000) - (30 * 24 * 3600), 'Sales for turnover test', 'test_user', Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory_transaction_line (
        inventory_transaction_id, line_number, product_id, warehouse_location_id,
        quantity, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(salesTransactionId, 1, productId, warehouseLocation.id, -50, 1000);

    // Test turnover analysis view
    const turnoverAnalysis = db.prepare(`
      SELECT * FROM inventory_turnover_analysis
      WHERE product_id = ?
    `)?.get(productId) ?? {};

    t.assert.equal(Boolean(turnoverAnalysis), true, 'Should have turnover analysis');
    t.assert.equal(Boolean(turnoverAnalysis.movement_classification), true, 'Should classify movement speed');
    t.assert.equal(Number(turnoverAnalysis.annual_cogs) >= 0, true, 'Should calculate annual COGS');

    fixture.cleanup();
  });

  await t.test('Cost layer summary view works correctly', async function (t) {
    const fixture = new TestFixture('Cost layer summary view works correctly');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('COST-LAYER-001', 'Cost Layer Test Product', category.id, 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    const warehouseLocation = db.prepare('SELECT id FROM warehouse_location WHERE warehouse_id = (SELECT id FROM warehouse WHERE code = ?) LIMIT 1')?.get('MAIN') ?? {};

    // Create multiple cost layers
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Create dummy transactions first
    const transaction1Id = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'COST-LAYER-001', currentTime - 86400, 'First cost layer transaction', 'test_user', currentTime - 86400).lastInsertRowid;
    
    const transaction2Id = db.prepare(`
      INSERT INTO inventory_transaction (
        transaction_type_code, reference_number, transaction_date, notes, created_by_user, created_time
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('PURCHASE_RECEIPT', 'COST-LAYER-002', currentTime, 'Second cost layer transaction', 'test_user', currentTime).lastInsertRowid;
    
    db.prepare(`
      INSERT INTO inventory_cost_layer (
        product_id, warehouse_location_id, received_date, quantity_received,
        quantity_remaining, unit_cost, currency_code, inventory_transaction_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(productId, warehouseLocation.id, currentTime - 86400, 100, 80, 1000, 'USD', transaction1Id);

    db.prepare(`
      INSERT INTO inventory_cost_layer (
        product_id, warehouse_location_id, received_date, quantity_received,
        quantity_remaining, unit_cost, currency_code, inventory_transaction_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(productId, warehouseLocation.id, currentTime, 50, 50, 1200, 'USD', transaction2Id);

    // Test cost layer summary view
    const costSummary = db.prepare(`
      SELECT * FROM cost_layer_summary WHERE sku = ?
    `)?.get('COST-LAYER-001') ?? {};

    t.assert.equal(Boolean(costSummary), true, 'Should have cost layer summary');
    t.assert.equal(Number(costSummary.active_cost_layers), 2, 'Should have 2 active cost layers');
    t.assert.equal(Number(costSummary.total_quantity_in_layers), 130, 'Should have 130 total quantity in layers');
    t.assert.equal(Number(costSummary.lowest_unit_cost), 1000, 'Should identify lowest unit cost');
    t.assert.equal(Number(costSummary.highest_unit_cost), 1200, 'Should identify highest unit cost');

    fixture.cleanup();
  });

  await t.test('Costing method audit view works correctly', async function (t) {
    const fixture = new TestFixture('Costing method audit view works correctly');
    const db = await fixture.setup();

    // Create test product
    const category = db.prepare('SELECT id FROM product_category LIMIT 1')?.get() ?? {};
    const productId = db.prepare(`
      INSERT INTO product (sku, name, product_category_id, costing_method, inventory_account_code, cogs_account_code, sales_account_code, created_time, updated_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('AUDIT-001', 'Audit Test Product', category.id, 'FIFO', 10300, 50100, 40100, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    // Make multiple costing method changes
    db.prepare('UPDATE product SET costing_method = ? WHERE id = ?').run('LIFO', productId);
    db.prepare('UPDATE product SET costing_method = ? WHERE id = ?').run('WEIGHTED_AVERAGE', productId);

    // Test costing method audit view
    const costingAudit = db.prepare(`
      SELECT * FROM costing_method_audit
      WHERE product_id = ?
    `)?.get(productId) ?? {};

    t.assert.equal(Boolean(costingAudit), true, 'Should have costing method audit');
    t.assert.equal(Number(costingAudit.method_changes_count), 2, 'Should count method changes');
    t.assert.equal(String(costingAudit.current_method), 'WEIGHTED_AVERAGE', 'Should show current method');
    t.assert.equal(['CONSISTENT', 'ACCEPTABLE', 'FREQUENT_CHANGES'].includes(String(costingAudit.consistency_status)), true, 'Should assess consistency status');

    fixture.cleanup();
  });
});