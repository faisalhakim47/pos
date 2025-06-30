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
    this.schemaFiles = [
      '001_core_accounting.sql',
      '004_product_management.sql',
      '005_warehouse_management.sql',
      '006_inventory_tracking.sql',
      '007_inventory_transactions.sql',
      '010_tax_management.sql',
      '011_purchase_management.sql',
    ];
    this.setupDb = null;
    this.dbPath = null;
  }

  get db() {
    if (this.setupDb instanceof DatabaseSync) {
      return this.setupDb;
    }
    throw new Error('Database not initialized. Call setup() first.');
  }

  async setup() {
    const tempDir = join(tmpdir(), 'pos-sql-tests');
    await mkdir(tempDir, { recursive: true });
    this.dbPath = join(
      tempDir,
      `${this.testRunId}_purchase_management_${this.label}.db`,
    );
    this.setupDb = new DatabaseSync(this.dbPath);

    // Load all schema files in order
    for (const schemaFile of this.schemaFiles) {
      const schemaFilePath = join(__dirname, schemaFile);
      const schemaFileContent = await readFile(schemaFilePath, { encoding: 'utf8' });
      this.db.exec(schemaFileContent);
    }

    return this.db;
  }

  async setupWithSampleData() {
    await this.setup();

    // Insert sample currencies only if they don't exist
    this.db.prepare(`
      insert or ignore into currency (code, name, symbol, decimals, is_functional_currency)
      values (?, ?, ?, ?, ?)
    `).run('USD', 'US Dollar', '$', 2, 1);

    // Insert sample account types and accounts only if they don't exist
    this.db.prepare(`
      insert or ignore into account_type (name, normal_balance) values (?, ?)
    `).run('asset', 'db');
    this.db.prepare(`
      insert or ignore into account_type (name, normal_balance) values (?, ?)
    `).run('liability', 'cr');
    this.db.prepare(`
      insert or ignore into account_type (name, normal_balance) values (?, ?)
    `).run('expense', 'db');

    this.db.prepare(`
      insert or ignore into account (code, name, account_type_name, currency_code)
      values (?, ?, ?, ?)
    `).run(10100, 'Cash', 'asset', 'USD');
    this.db.prepare(`
      insert or ignore into account (code, name, account_type_name, currency_code)
      values (?, ?, ?, ?)
    `).run(12100, 'Inventory', 'asset', 'USD');
    this.db.prepare(`
      insert or ignore into account (code, name, account_type_name, currency_code)
      values (?, ?, ?, ?)
    `).run(20100, 'Accounts Payable', 'liability', 'USD');
    this.db.prepare(`
      insert or ignore into account (code, name, account_type_name, currency_code)
      values (?, ?, ?, ?)
    `).run(50100, 'Cost of Goods Sold', 'expense', 'USD');

    // Insert sample warehouse
    this.db.prepare(`
      insert or ignore into warehouse (id, code, name, is_default, is_active, created_time)
      values (?, ?, ?, ?, ?, ?)
    `).run(1, 'MAIN', 'Main Warehouse', 1, 1, Date.now());

    this.db.prepare(`
      insert or ignore into warehouse_location (id, warehouse_id, code, name, is_active)
      values (?, ?, ?, ?, ?)
    `).run(1, 1, 'A1-1', 'Aisle A, Shelf 1, Bin 1', 1);

    // Insert sample unit of measure
    this.db.prepare(`
      insert or ignore into unit_of_measure (code, name, symbol, is_active)
      values (?, ?, ?, ?)
    `).run('EACH', 'Each', 'ea', 1);

    // Insert sample product category
    this.db.prepare(`
      insert or ignore into product_category (id, code, name, is_active)
      values (?, ?, ?, ?)
    `).run(1, 'GENERAL', 'General Products', 1);

    // Insert sample product
    this.db.prepare(`
      insert or ignore into product (id, sku, name, product_category_id, base_unit_code,
                          inventory_account_code, cogs_account_code, sales_account_code,
                          is_active, created_time, updated_time)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, 'PROD001', 'Test Product', 1, 'EACH', 12100, 50100, 40100, 1, Date.now(), Date.now());

    // Insert sample tax code
    this.db.prepare(`
      insert or ignore into tax_code (code, name, account_code, is_active)
      values (?, ?, ?, ?)
    `).run('VAT10', 'VAT 10%', 20200, 1);

    this.db.prepare(`
      insert or ignore into tax_rate (tax_code_code, rate_percent, valid_from, is_active)
      values (?, ?, ?, ?)
    `).run('VAT10', 10.0, Date.now() - 86400000, 1);

    // Insert sample inventory transaction type
    this.db.prepare(`
      insert or ignore into inventory_transaction_type (code, name, affects_quantity, affects_value)
      values (?, ?, ?, ?)
    `).run('RECEIPT', 'Purchase Receipt', 'INCREASE', 'INCREASE');

    return this.db;
  }
}

test('Purchase Management Schema', async function (t) {
  await t.test('Vendor table is properly created', async function (t) {
    const fixture = new TestFixture('Vendor table is properly created');
    const db = await fixture.setup();

    const tableInfo = db.prepare(`
      select name from sqlite_master
      where type = 'table' and name = 'vendor'
    `)?.get() ?? {};

    t.assert.equal(tableInfo.name, 'vendor', 'Vendor table should exist');

    // Test vendor insertion
    const now = Date.now();
    db.prepare(`
      insert into vendor (vendor_code, name, currency_code, created_time)
      values (?, ?, ?, ?)
    `).run('VEND001', 'Test Vendor', 'USD', now);

    const vendor = db.prepare('select * from vendor where vendor_code = ?')?.get('VEND001') ?? {};
    t.assert.equal(vendor.name, 'Test Vendor', 'Vendor should be inserted correctly');
  });

  await t.test('Purchase requisition workflow', async function (t) {
    const fixture = new TestFixture('Purchase requisition workflow');
    const db = await fixture.setupWithSampleData();

    const now = Date.now();

    // Create purchase requisition
    db.prepare(`
      insert into purchase_requisition (requisition_number, requisition_date, requested_by_user,
                                      total_amount, currency_code, created_time)
      values (?, ?, ?, ?, ?, ?)
    `).run('REQ001', now, 'testuser', 1000, 'USD', now);

    const requisitionId = db.prepare(`
      select id from purchase_requisition where requisition_number = ?
    `)?.get('REQ001')?.id ?? NaN;

    // Add requisition line
    db.prepare(`
      insert into purchase_requisition_line (purchase_requisition_id, line_number, product_id,
                                           description, quantity, unit_of_measure_code,
                                           estimated_unit_cost)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(requisitionId, 1, 1, 'Test Product', 10, 'EACH', 100);

    // Test status tracking with timestamps
    const requisition = db.prepare(`
      select * from purchase_requisition where id = ?
    `)?.get(requisitionId) ?? {};

    t.assert.equal(requisition.created_time, now, 'Created time should be set');
    t.assert.equal(requisition.submitted_time, null, 'Submitted time should be null initially');

    // Update to submitted status
    db.prepare(`
      update purchase_requisition set submitted_time = ? where id = ?
    `).run(now + 1000, requisitionId);

    const updatedRequisition = db.prepare(`
      select * from purchase_requisition where id = ?
    `)?.get(requisitionId) ?? {};

    t.assert.equal(updatedRequisition.submitted_time, now + 1000, 'Submitted time should be updated');
  });

  await t.test('Purchase order creation and management', async function (t) {
    const fixture = new TestFixture('Purchase order creation and management');
    const db = await fixture.setupWithSampleData();

    const now = Date.now();

    // Create vendor
    db.prepare(`
      insert into vendor (vendor_code, name, currency_code, created_time)
      values (?, ?, ?, ?)
    `).run('VEND001', 'Test Vendor', 'USD', now);

    const vendorId = db.prepare(`
      select id from vendor where vendor_code = ?
    `)?.get('VEND001')?.id ?? NaN;

    // Create purchase order
    db.prepare(`
      insert into purchase_order (order_number, vendor_id, order_date, ordered_by_user,
                                currency_code, created_time)
      values (?, ?, ?, ?, ?, ?)
    `).run('PO001', vendorId, now, 'testuser', 'USD', now);

    const orderId = db.prepare(`
      select id from purchase_order where order_number = ?
    `)?.get('PO001')?.id ?? NaN;

    // Add purchase order line
    db.prepare(`
      insert into purchase_order_line (purchase_order_id, line_number, product_id,
                                     description, quantity_ordered, unit_of_measure_code,
                                     unit_cost, tax_code_code, warehouse_location_id)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(orderId, 1, 1, 'Test Product', 10, 'EACH', 100, 'VAT10', 1);

    // Test automatic total calculation via trigger
    const order = db.prepare(`
      select * from purchase_order where id = ?
    `)?.get(orderId) ?? {};

    t.assert.equal(order.subtotal, 1000, 'Subtotal should be calculated automatically');
    t.assert.equal(order.tax_amount, 100, 'Tax amount should be calculated');
    t.assert.equal(order.total_amount, 1100, 'Total amount should include tax');
  });

  await t.test('Goods receipt and inventory integration', async function (t) {
    const fixture = new TestFixture('Goods receipt and inventory integration');
    const db = await fixture.setupWithSampleData();

    const now = Date.now();

    // Create vendor and purchase order
    db.prepare(`
      insert into vendor (vendor_code, name, currency_code, created_time)
      values (?, ?, ?, ?)
    `).run('VEND001', 'Test Vendor', 'USD', now);

    const vendorId = db.prepare(`
      select id from vendor where vendor_code = ?
    `)?.get('VEND001')?.id ?? NaN;

    db.prepare(`
      insert into purchase_order (order_number, vendor_id, order_date, ordered_by_user,
                                currency_code, created_time)
      values (?, ?, ?, ?, ?, ?)
    `).run('PO001', vendorId, now, 'testuser', 'USD', now);

    const orderId = db.prepare(`
      select id from purchase_order where order_number = ?
    `)?.get('PO001')?.id ?? NaN;

    db.prepare(`
      insert into purchase_order_line (purchase_order_id, line_number, product_id,
                                     description, quantity_ordered, unit_of_measure_code,
                                     unit_cost, warehouse_location_id)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(orderId, 1, 1, 'Test Product', 10, 'EACH', 100, 1);

    const poLineId = db.prepare(`
      select id from purchase_order_line where purchase_order_id = ?
    `)?.get(orderId)?.id ?? NaN;

    // Create goods receipt
    db.prepare(`
      insert into goods_receipt (receipt_number, purchase_order_id, vendor_id, receipt_date,
                               received_by_user, created_time)
      values (?, ?, ?, ?, ?, ?)
    `).run('GR001', orderId, vendorId, now, 'testuser', now);

    const receiptId = db.prepare(`
      select id from goods_receipt where receipt_number = ?
    `)?.get('GR001')?.id ?? NaN;

    // Add goods receipt line
    db.prepare(`
      insert into goods_receipt_line (goods_receipt_id, line_number, purchase_order_line_id,
                                    product_id, quantity_received, quantity_accepted,
                                    unit_of_measure_code, unit_cost, warehouse_location_id)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(receiptId, 1, poLineId, 1, 8, 8, 'EACH', 100, 1);

    // Test automatic update of purchase order quantities
    const updatedPOLine = db.prepare(`
      select * from purchase_order_line where id = ?
    `)?.get(poLineId) ?? {};

    t.assert.equal(updatedPOLine.quantity_received, 8, 'PO line quantity received should be updated');
  });

  await t.test('Purchase invoice and 3-way matching', async function (t) {
    const fixture = new TestFixture('Purchase invoice and 3-way matching');
    const db = await fixture.setupWithSampleData();

    const now = Date.now();

    // Create vendor, purchase order, and goods receipt
    db.prepare(`
      insert into vendor (vendor_code, name, currency_code, created_time)
      values (?, ?, ?, ?)
    `).run('VEND001', 'Test Vendor', 'USD', now);

    const vendorId = db.prepare(`
      select id from vendor where vendor_code = ?
    `)?.get('VEND001')?.id ?? NaN;

    db.prepare(`
      insert into purchase_order (order_number, vendor_id, order_date, ordered_by_user,
                                currency_code, created_time)
      values (?, ?, ?, ?, ?, ?)
    `).run('PO001', vendorId, now, 'testuser', 'USD', now);

    const orderId = db.prepare(`
      select id from purchase_order where order_number = ?
    `)?.get('PO001')?.id ?? NaN;

    db.prepare(`
      insert into goods_receipt (receipt_number, purchase_order_id, vendor_id, receipt_date,
                               received_by_user, created_time)
      values (?, ?, ?, ?, ?, ?)
    `).run('GR001', orderId, vendorId, now, 'testuser', now);

    const receiptId = db.prepare(`
      select id from goods_receipt where receipt_number = ?
    `)?.get('GR001')?.id ?? NaN;

    // Create purchase invoice linked to PO and GR
    db.prepare(`
      insert into purchase_invoice (invoice_number, vendor_invoice_number, vendor_id,
                                  invoice_date, due_date, purchase_order_id, goods_receipt_id,
                                  subtotal, tax_amount, total_amount, currency_code, created_time)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('PI001', 'VINV001', vendorId, now, now + 2592000000, orderId, receiptId, 800, 80, 880, 'USD', now);

    const invoice = db.prepare(`
      select * from purchase_invoice where invoice_number = ?
    `)?.get('PI001') ?? {};

    t.assert.equal(invoice.purchase_order_id, orderId, 'Invoice should be linked to purchase order');
    t.assert.equal(invoice.goods_receipt_id, receiptId, 'Invoice should be linked to goods receipt');
    t.assert.equal(invoice.total_amount, 880, 'Invoice total should include tax');
  });

  await t.test('Purchase return functionality', async function (t) {
    const fixture = new TestFixture('Purchase return functionality');
    const db = await fixture.setupWithSampleData();

    const now = Date.now();

    // Setup vendor, purchase order, and goods receipt
    db.prepare(`
      insert into vendor (vendor_code, name, currency_code, created_time)
      values (?, ?, ?, ?)
    `).run('VEND001', 'Test Vendor', 'USD', now);

    const vendorId = db.prepare(`
      select id from vendor where vendor_code = ?
    `)?.get('VEND001')?.id ?? NaN;

    db.prepare(`
      insert into purchase_order (order_number, vendor_id, order_date, ordered_by_user,
                                currency_code, created_time)
      values (?, ?, ?, ?, ?, ?)
    `).run('PO001', vendorId, now, 'testuser', 'USD', now);

    const orderId = db.prepare(`
      select id from purchase_order where order_number = ?
    `)?.get('PO001')?.id ?? NaN;

    db.prepare(`
      insert into purchase_order_line (purchase_order_id, line_number, product_id,
                                     description, quantity_ordered, unit_of_measure_code,
                                     unit_cost, warehouse_location_id)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(orderId, 1, 1, 'Test Product', 10, 'EACH', 100, 1);

    const poLineId = db.prepare(`
      select id from purchase_order_line where purchase_order_id = ?
    `)?.get(orderId)?.id ?? NaN;

    db.prepare(`
      insert into goods_receipt (receipt_number, purchase_order_id, vendor_id, receipt_date,
                               received_by_user, created_time)
      values (?, ?, ?, ?, ?, ?)
    `).run('GR001', orderId, vendorId, now, 'testuser', now);

    const receiptId = db.prepare(`
      select id from goods_receipt where receipt_number = ?
    `)?.get('GR001')?.id ?? NaN;

    db.prepare(`
      insert into goods_receipt_line (goods_receipt_id, line_number, purchase_order_line_id,
                                    product_id, quantity_received, quantity_accepted,
                                    unit_of_measure_code, unit_cost, warehouse_location_id)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(receiptId, 1, poLineId, 1, 10, 10, 'EACH', 100, 1);

    const grLineId = db.prepare(`
      select id from goods_receipt_line where goods_receipt_id = ?
    `)?.get(receiptId)?.id ?? NaN;

    // Create purchase return
    db.prepare(`
      insert into purchase_return (return_number, vendor_id, purchase_order_id, goods_receipt_id,
                                 return_date, return_reason, total_amount, currency_code,
                                 returned_by_user, created_time)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('PR001', vendorId, orderId, receiptId, now, 'Defective items', 200, 'USD', 'testuser', now);

    const returnId = db.prepare(`
      select id from purchase_return where return_number = ?
    `)?.get('PR001')?.id ?? NaN;

    // Add return line
    db.prepare(`
      insert into purchase_return_line (purchase_return_id, line_number, goods_receipt_line_id,
                                      product_id, quantity_returned, unit_cost, warehouse_location_id,
                                      return_reason)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(returnId, 1, grLineId, 1, 2, 100, 1, 'Defective');

    const returnLine = db.prepare(`
      select * from purchase_return_line where purchase_return_id = ?
    `)?.get(returnId) ?? {};

    t.assert.equal(returnLine.quantity_returned, 2, 'Return quantity should be correct');
    t.assert.equal(returnLine.line_total, 200, 'Return line total should be calculated');
  });

  await t.test('Tax integration with purchase documents', async function (t) {
    const fixture = new TestFixture('Tax integration with purchase documents');
    const db = await fixture.setupWithSampleData();

    const now = Date.now();

    // Create vendor and purchase order with tax
    db.prepare(`
      insert into vendor (vendor_code, name, currency_code, created_time)
      values (?, ?, ?, ?)
    `).run('VEND001', 'Test Vendor', 'USD', now);

    const vendorId = db.prepare(`
      select id from vendor where vendor_code = ?
    `)?.get('VEND001')?.id ?? NaN;

    db.prepare(`
      insert into purchase_order (order_number, vendor_id, order_date, ordered_by_user,
                                currency_code, created_time)
      values (?, ?, ?, ?, ?, ?)
    `).run('PO001', vendorId, now, 'testuser', 'USD', now);

    const orderId = db.prepare(`
      select id from purchase_order where order_number = ?
    `)?.get('PO001')?.id ?? NaN;

    // Add line with tax
    db.prepare(`
      insert into purchase_order_line (purchase_order_id, line_number, product_id,
                                     description, quantity_ordered, unit_of_measure_code,
                                     unit_cost, tax_code_code, tax_amount, warehouse_location_id)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(orderId, 1, 1, 'Test Product', 10, 'EACH', 100, 'VAT10', 100, 1);

    const order = db.prepare(`
      select * from purchase_order where id = ?
    `)?.get(orderId) ?? {};

    t.assert.equal(order.tax_amount, 100, 'Order tax amount should be calculated from lines');
    t.assert.equal(order.total_amount, 1100, 'Order total should include tax');

    // Test product taxability
    db.prepare(`
      insert into product_taxability (product_id, tax_code_code, is_taxable)
      values (?, ?, ?)
    `).run(1, 'VAT10', 1);

    const taxability = db.prepare(`
      select * from product_taxability where product_id = ? and tax_code_code = ?
    `)?.get(1, 'VAT10') ?? {};

    t.assert.equal(taxability.is_taxable, 1, 'Product should be taxable for VAT10');
  });

  await t.test('Document status tracking with timestamps', async function (t) {
    const fixture = new TestFixture('Document status tracking with timestamps');
    const db = await fixture.setupWithSampleData();

    const now = Date.now();

    // Test purchase requisition status progression
    db.prepare(`
      insert into purchase_requisition (requisition_number, requisition_date, requested_by_user,
                                      total_amount, currency_code, created_time)
      values (?, ?, ?, ?, ?, ?)
    `).run('REQ001', now, 'testuser', 1000, 'USD', now);

    const requisitionId = db.prepare(`
      select id from purchase_requisition where requisition_number = ?
    `)?.get('REQ001')?.id ?? NaN;

    // Test status progression
    t.assert.equal(db.prepare('select created_time from purchase_requisition where id = ?')?.get(requisitionId)?.created_time, now) ?? {};

    db.prepare('update purchase_requisition set submitted_time = ? where id = ?').run(now + 1000, requisitionId);
    t.assert.equal(db.prepare('select submitted_time from purchase_requisition where id = ?')?.get(requisitionId)?.submitted_time, now + 1000) ?? {};

    db.prepare('update purchase_requisition set approved_time = ?, approved_by_user = ? where id = ?').run(now + 2000, 'manager', requisitionId);
    t.assert.equal(db.prepare('select approved_time from purchase_requisition where id = ?')?.get(requisitionId)?.approved_time, now + 2000) ?? {};

    // Test that we can determine status from timestamps
    const req = db.prepare('select * from purchase_requisition where id = ?')?.get(requisitionId) ?? {};

    function getStatus(doc) {
      if (doc.cancelled_time) return 'CANCELLED';
      if (doc.rejected_time) return 'REJECTED';
      if (doc.converted_time) return 'CONVERTED';
      if (doc.approved_time) return 'APPROVED';
      if (doc.submitted_time) return 'SUBMITTED';
      return 'DRAFT';
    }

    t.assert.equal(getStatus(req), 'APPROVED', 'Status should be derived correctly from timestamps');
  });

  await t.test('Quantity validation and constraints', async function (t) {
    const fixture = new TestFixture('Quantity validation and constraints');
    const db = await fixture.setupWithSampleData();

    const now = Date.now();

    // Setup purchase order
    db.prepare(`
      insert into vendor (vendor_code, name, currency_code, created_time)
      values (?, ?, ?, ?)
    `).run('VEND001', 'Test Vendor', 'USD', now);

    const vendorId = db.prepare(`
      select id from vendor where vendor_code = ?
    `)?.get('VEND001')?.id ?? NaN;

    db.prepare(`
      insert into purchase_order (order_number, vendor_id, order_date, ordered_by_user,
                                currency_code, created_time)
      values (?, ?, ?, ?, ?, ?)
    `).run('PO001', vendorId, now, 'testuser', 'USD', now);

    const orderId = db.prepare(`
      select id from purchase_order where order_number = ?
    `)?.get('PO001')?.id ?? NaN;

    db.prepare(`
      insert into purchase_order_line (purchase_order_id, line_number, product_id,
                                     description, quantity_ordered, unit_of_measure_code,
                                     unit_cost, warehouse_location_id)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(orderId, 1, 1, 'Test Product', 10, 'EACH', 100, 1);

    const poLineId = db.prepare(`
      select id from purchase_order_line where purchase_order_id = ?
    `)?.get(orderId)?.id ?? NaN;

    db.prepare(`
      insert into goods_receipt (receipt_number, purchase_order_id, vendor_id, receipt_date,
                               received_by_user, created_time)
      values (?, ?, ?, ?, ?, ?)
    `).run('GR001', orderId, vendorId, now, 'testuser', now);

    const receiptId = db.prepare(`
      select id from goods_receipt where receipt_number = ?
    `)?.get('GR001')?.id ?? NaN;

    // Test that we can't receive more than ordered
    let errorThrown = false;
    try {
      db.prepare(`
        insert into goods_receipt_line (goods_receipt_id, line_number, purchase_order_line_id,
                                      product_id, quantity_received, unit_of_measure_code,
                                      unit_cost, warehouse_location_id)
        values (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(receiptId, 1, poLineId, 1, 15, 'EACH', 100, 1); // More than ordered quantity of 10
    }
    catch (/** @type {any} */ error) {
      errorThrown = true;
      t.assert.equal(error.message.includes('exceeds remaining order quantity'), true, 'Should prevent over-receipt');
    }

    t.assert.equal(errorThrown, true, 'Should throw error for over-receipt');
  });

  await t.test('Multi-currency support', async function (t) {
    const fixture = new TestFixture('Multi-currency support');
    const db = await fixture.setupWithSampleData();

    // Add EUR currency
    db.prepare(`
      insert or ignore into currency (code, name, symbol, decimals, is_active)
      values (?, ?, ?, ?, ?)
    `).run('EUR', 'Euro', '€', 2, 1);

    const now = Date.now();

    // Create vendor in EUR
    db.prepare(`
      insert into vendor (vendor_code, name, currency_code, created_time)
      values (?, ?, ?, ?)
    `).run('VEND001', 'European Vendor', 'EUR', now);

    const vendorId = db.prepare(`
      select id from vendor where vendor_code = ?
    `)?.get('VEND001')?.id ?? NaN;

    // Create purchase order in EUR
    db.prepare(`
      insert into purchase_order (order_number, vendor_id, order_date, ordered_by_user,
                                currency_code, exchange_rate, created_time)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run('PO001', vendorId, now, 'testuser', 'EUR', 1.1, now);

    const order = db.prepare(`
      select * from purchase_order where order_number = ?
    `)?.get('PO001') ?? {};

    t.assert.equal(order.currency_code, 'EUR', 'Order should be in EUR');
    t.assert.equal(order.exchange_rate, 1.1, 'Exchange rate should be set');
  });
});
