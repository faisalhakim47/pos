// @ts-check

import { test } from 'node:test';
import { join } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';

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
    this.schemaFilePath = join(__dirname, '001_core_accounting.sql');
    this.schemaFileContent = null;
    this.db = null;
    this.dbPath = null;
  }

  async setup() {
    this.schemaFileContent = await readFile(this.schemaFilePath, { encoding: 'utf8' });
    const tempDir = join(tmpdir(), 'pos-sql-tests');
    await mkdir(tempDir, { recursive: true });
    this.dbPath = join(
      tempDir,
      `${this.testRunId}_core_accounting_${this.label}.db`,
    );
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(this.schemaFileContent);
    return this.db;
  }

  async setupWithInitialCapital() {
    await this.setup();
    this.db.exec('begin');
    this.db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(1, 1000000000, 'Initial capital');
    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 0, 10100, 100000, 0, 100000, 0);
    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 1, 30100, 0, 100000, 0, 100000);
    this.db.exec('commit');
    this.db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000000, 1);
    return this.db;
  }
}

await test('Core Accounting Schema', async function (t) {
  await t.test('Account types are properly created', async function (t) {
    const fixture = new TestFixture('Account types are properly created');
    const db = await fixture.setup();

    const accountTypes = db.prepare('SELECT * FROM account_type ORDER BY name').all();

    t.assert.equal(accountTypes.length, 12, 'Should have 12 account types');

    const asset = accountTypes.find(function (at) { return at.name === 'asset'; });
    t.assert.equal(asset.normal_balance, 'db', 'Asset should have debit normal balance');

    const liability = accountTypes.find(function (at) { return at.name === 'liability'; });
    t.assert.equal(liability.normal_balance, 'cr', 'Liability should have credit normal balance');

    const equity = accountTypes.find(function (at) { return at.name === 'equity'; });
    t.assert.equal(equity.normal_balance, 'cr', 'Equity should have credit normal balance');

    const revenue = accountTypes.find(function (at) { return at.name === 'revenue'; });
    t.assert.equal(revenue.normal_balance, 'cr', 'Revenue should have credit normal balance');

    const expense = accountTypes.find(function (at) { return at.name === 'expense'; });
    t.assert.equal(expense.normal_balance, 'db', 'Expense should have debit normal balance');
  });

  await t.test('Chart of accounts is properly loaded', async function (t) {
    const fixture = new TestFixture('Chart of accounts is properly loaded');
    const db = await fixture.setup();

    const accounts = db.prepare('SELECT * FROM account ORDER BY code').all();

    t.assert.equal(accounts.length > 0, true, 'Should have accounts loaded');

    // Check specific accounts
    const cash = accounts.find(function (acc) { return acc.code === 10100; });
    t.assert.equal(cash.name, 'Cash', 'Cash account should exist');
    t.assert.equal(cash.account_type_name, 'asset', 'Cash should be an asset');

    const commonStock = accounts.find(function (acc) { return acc.code === 30100; });
    t.assert.equal(commonStock.name, 'Common Stock', 'Common Stock account should exist');
    t.assert.equal(commonStock.account_type_name, 'equity', 'Common Stock should be equity');

    const salesRevenue = accounts.find(function (acc) { return acc.code === 40100; });
    t.assert.equal(salesRevenue.name, 'Sales Revenue', 'Sales Revenue account should exist');
    t.assert.equal(salesRevenue.account_type_name, 'revenue', 'Sales Revenue should be revenue');
  });

  await t.test('Account tags are properly assigned', async function (t) {
    const fixture = new TestFixture('Account tags are properly assigned');
    const db = await fixture.setup();

    const tags = db.prepare('SELECT * FROM account_tag ORDER BY account_code, tag').all();

    t.assert.equal(tags.length > 0, true, 'Should have account tags');

    // Check cash is tagged as current asset
    const cashTags = tags.filter(function (tag) { return tag.account_code === 10100; });
    const hasCurrentAssetTag = cashTags.some(function (tag) { return tag.tag === 'balance_sheet_current_asset'; });
    t.assert.equal(hasCurrentAssetTag, true, 'Cash should be tagged as current asset');

    // Check sales revenue is tagged correctly
    const salesRevenueTags = tags.filter(function (tag) { return tag.account_code === 40100; });
    const hasRevenueTag = salesRevenueTags.some(function (tag) { return tag.tag === 'income_statement_revenue'; });
    t.assert.equal(hasRevenueTag, true, 'Sales Revenue should be tagged for income statement');
  });

  await t.test('Account configuration moved to finance reporting', async function (t) {
    const fixture = new TestFixture('Account configuration moved to finance reporting');
    const db = await fixture.setup();

    // account_config table should not exist in core accounting anymore
    t.assert.throws(function () {
      db.prepare('SELECT * FROM account_config WHERE id = 1').get();
    }, 'account_config table should not exist in core accounting schema');
  });

  await t.test('Journal entry creation and validation', async function (t) {
    const fixture = new TestFixture('Journal entry creation and validation');
    const db = await fixture.setup();

    // Create unposted journal entry
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(1, 1000000000, 'Test entry');

    // Add journal entry lines
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 0, 10100, 50000, 0, 50000, 0);
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 1, 30100, 0, 50000, 0, 50000);
    db.exec('commit');

    const entry = db.prepare('SELECT * FROM journal_entry WHERE ref = 1').get();
    t.assert.equal(typeof entry, 'object', 'Journal entry should be created');
    t.assert.equal(entry.post_time, null, 'Journal entry should be unposted');

    const lines = db.prepare('SELECT * FROM journal_entry_line WHERE journal_entry_ref = 1 ORDER BY line_order').all();
    t.assert.equal(lines.length, 2, 'Should have 2 journal entry lines');
    t.assert.equal(lines[0].db, 50000, 'First line should have debit');
    t.assert.equal(lines[1].cr, 50000, 'Second line should have credit');
  });

  await t.test('Journal entry posting updates account balances', async function (t) {
    const fixture = new TestFixture('Journal entry posting updates account balances');
    const db = await fixture.setup();

    // Get initial balances
    const initialCash = db.prepare('SELECT balance FROM account WHERE code = 10100').get();
    const initialCommonStock = db.prepare('SELECT balance FROM account WHERE code = 30100').get();

    // Create and post journal entry
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(1, 1000000000, 'Initial capital');
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 0, 10100, 100000, 0, 100000, 0);
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 1, 30100, 0, 100000, 0, 100000);
    db.exec('commit');

    // Post the entry
    db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000000, 1);

    // Check updated balances
    const finalCash = db.prepare('SELECT balance FROM account WHERE code = 10100').get();
    const finalCommonStock = db.prepare('SELECT balance FROM account WHERE code = 30100').get();

    t.assert.equal(Number(finalCash.balance), Number(initialCash.balance) + 100000, 'Cash balance should increase');
    t.assert.equal(Number(finalCommonStock.balance), Number(initialCommonStock.balance) + 100000, 'Common Stock balance should increase');
  });

  await t.test('Journal entry line auto numbering works', async function (t) {
    const fixture = new TestFixture('Journal entry line auto numbering works');
    const db = await fixture.setup();

    // Create journal entry
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(1, 1000000000, 'Test auto numbering');

    // Use auto numbering view (without specifying line_order)
    db.prepare(`
      insert into journal_entry_line_auto_number (journal_entry_ref, account_code, db, cr)
      values (?, ?, ?, ?)
    `).run(1, 10100, 25000, 0);
    db.prepare(`
      insert into journal_entry_line_auto_number (journal_entry_ref, account_code, db, cr)
      values (?, ?, ?, ?)
    `).run(1, 40100, 0, 25000);
    db.exec('commit');

    const lines = db.prepare('SELECT * FROM journal_entry_line WHERE journal_entry_ref = 1 ORDER BY line_order').all();
    t.assert.equal(lines.length, 2, 'Should have 2 lines');
    t.assert.equal(lines[0].line_order, 0, 'First line should have order 0');
    t.assert.equal(lines[1].line_order, 1, 'Second line should have order 1');
  });

  await t.test('Journal entry validation prevents unbalanced entries', async function (t) {
    const fixture = new TestFixture('Journal entry validation prevents unbalanced entries');
    const db = await fixture.setup();

    // Create unbalanced journal entry
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(1, 1000000000, 'Unbalanced entry');
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 0, 10100, 100000, 0, 100000, 0);
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 1, 30100, 0, 50000, 0, 50000); // Intentionally unbalanced
    db.exec('commit');

    // Try to post - should fail
    t.assert.throws(function () {
      db.prepare(`
        update journal_entry set post_time = ? where ref = ?
      `).run(1000000000, 1);
    }, 'Should throw error for unbalanced entry');
  });

  await t.test('Journal entry summary view works correctly', async function (t) {
    const fixture = new TestFixture('Journal entry summary view works correctly');
    const db = await fixture.setupWithInitialCapital();

    const summary = db.prepare('SELECT * FROM journal_entry_summary ORDER BY ref, line_order').all();

    t.assert.equal(summary.length, 2, 'Should have 2 lines in summary');
    t.assert.equal(summary[0].ref, 1, 'Entry ref should be 1');
    t.assert.equal(summary[0].account_name, 'Cash', 'First line should be Cash');
    t.assert.equal(summary[1].account_name, 'Common Stock', 'Second line should be Common Stock');
  });

  await t.test('Cannot modify posted journal entries', async function (t) {
    const fixture = new TestFixture('Cannot modify posted journal entries');
    const db = await fixture.setupWithInitialCapital();

    // Try to update posted journal entry - should fail
    t.assert.throws(function () {
      db.prepare(`
        update journal_entry set note = 'Modified' where ref = 1
      `).run();
    }, 'Should not allow modification of posted journal entries');

    // Try to delete posted journal entry line - should fail
    t.assert.throws(function () {
      db.prepare(`
        delete from journal_entry_line where journal_entry_ref = 1
      `).run();
    }, 'Should not allow deletion of posted journal entry lines');
  });

  await t.test('Core schema does not include finance config', async function (t) {
    const fixture = new TestFixture('Core schema does not include finance config');
    const db = await fixture.setup();

    // Try to delete finance config - should fail because table doesn't exist
    t.assert.throws(function () {
      db.prepare(`
        delete from finance_statement_config where id = 1
      `).run();
    }, 'Should not have finance_statement_config table in core accounting');
  });
});
