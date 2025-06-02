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

    t.assert.equal(accountTypes.length, 11, 'Should have 11 account types');

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

  await t.test('Multi-currency journal entry validation', async function (t) {
    const fixture = new TestFixture('Multi-currency journal entry validation');
    const db = await fixture.setup();

    // Create EUR cash account
    db.prepare(`
      insert into account (code, name, account_type_name, currency_code)
      values (10105, 'Cash - EUR', 'asset', 'EUR')
    `).run();

    // Create foreign currency journal entry
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note, transaction_currency_code, exchange_rate_to_functional)
      values (?, ?, ?, ?, ?)
    `).run(1, 1000000000, 'EUR sale transaction', 'EUR', 1.1050);

    // EUR 1000 in foreign currency amounts to USD 1105 in functional currency
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional, foreign_currency_amount, foreign_currency_code, exchange_rate)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, 0, 10105, 100000, 0, 110500, 0, 100000, 'EUR', 1.1050);

    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional, foreign_currency_amount, foreign_currency_code, exchange_rate)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, 1, 40100, 0, 100000, 0, 110500, -100000, 'EUR', 1.1050);
    db.exec('commit');

    // Post the entry
    db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000000, 1);

    // Verify the entry was posted correctly
    const summary = db.prepare('SELECT * FROM journal_entry_summary WHERE ref = 1 ORDER BY line_order').all();
    t.assert.equal(summary.length, 2, 'Should have 2 lines in summary');
    t.assert.equal(summary[0].db_functional, 110500, 'Functional currency debit should be converted');
    t.assert.equal(summary[1].cr_functional, 110500, 'Functional currency credit should be converted');
    t.assert.equal(summary[0].foreign_currency_amount, 100000, 'Foreign currency amount should be preserved');
    t.assert.equal(summary[0].foreign_currency_code, 'EUR', 'Foreign currency code should be preserved');
  });

  await t.test('Exchange rate conversion consistency', async function (t) {
    const fixture = new TestFixture('Exchange rate conversion consistency');
    const db = await fixture.setup();

    // Test that functional amounts match exchange rate calculations
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note, transaction_currency_code, exchange_rate_to_functional)
      values (?, ?, ?, ?, ?)
    `).run(1, 1000000000, 'Test conversion', 'EUR', 1.2500);

    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 0, 10100, 80000, 0, 100000, 0); // EUR 800 -> USD 1000

    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 1, 30100, 0, 80000, 0, 100000); // EUR 800 -> USD 1000
    db.exec('commit');

    // Should post successfully with consistent exchange rate
    db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000000, 1);

    const entry = db.prepare('SELECT * FROM journal_entry WHERE ref = 1').get();
    t.assert.equal(entry.post_time, 1000000000, 'Entry should be posted');
  });

  await t.test('Prevent posting unbalanced functional currency amounts', async function (t) {
    const fixture = new TestFixture('Prevent posting unbalanced functional currency amounts');
    const db = await fixture.setup();

    // Create unbalanced entry in functional currency
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(1, 1000000000, 'Unbalanced functional entry');

    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 0, 10100, 50000, 0, 50000, 0);

    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 1, 30100, 0, 50000, 0, 60000); // Intentionally unbalanced functional amounts
    db.exec('commit');

    // Try to post - should fail
    t.assert.throws(function () {
      db.prepare(`
        update journal_entry set post_time = ? where ref = ?
      `).run(1000000000, 1);
    }, 'Should throw error for unbalanced functional currency amounts');
  });

  await t.test('Accounting equation validation - Assets = Liabilities + Equity', async function (t) {
    const fixture = new TestFixture('Accounting equation validation');
    const db = await fixture.setupWithInitialCapital();

    // Add more transactions to test accounting equation
    // Purchase equipment with cash
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(2, 1000000100, 'Purchase equipment');
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 0, 12400, 25000, 0, 25000, 0); // Office Equipment (Asset)
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 1, 10100, 0, 25000, 0, 25000); // Cash (Asset)
    db.exec('commit');
    db.prepare('update journal_entry set post_time = ? where ref = ?').run(1000000100, 2);

    // Calculate total assets, liabilities, and equity
    const balances = db.prepare(`
      select
        sum(case when at.name in ('asset', 'contra_asset')
            then case when at.normal_balance = 'db' then a.balance else -a.balance end
            else 0 end) as total_assets,
        sum(case when at.name in ('liability', 'contra_liability')
            then case when at.normal_balance = 'cr' then a.balance else -a.balance end
            else 0 end) as total_liabilities,
        sum(case when at.name in ('equity', 'contra_equity')
            then case when at.normal_balance = 'cr' then a.balance else -a.balance end
            else 0 end) as total_equity
      from account a
      join account_type at on a.account_type_name = at.name
    `).get();

    // Assets should equal Liabilities + Equity
    t.assert.equal(
      Number(balances.total_assets),
      Number(balances.total_liabilities) + Number(balances.total_equity),
      'Assets must equal Liabilities + Equity',
    );
  });

  await t.test('Account code ranges validation', async function (t) {
    const fixture = new TestFixture('Account code ranges validation');
    const db = await fixture.setup();

    // Test account code ranges follow standard chart of accounts structure
    const accounts = db.prepare(`
      select code, account_type_name from account order by code
    `).all();

    // Assets should be 10000-19999
    const assets = accounts.filter(a => a.account_type_name === 'asset');
    assets.forEach(account => {
      t.assert.equal(
        Number(account.code) >= 10000 && Number(account.code) <= 19999,
        true,
        `Asset account ${account.code} should be in range 10000-19999`,
      );
    });

    // Liabilities should be 20000-29999
    const liabilities = accounts.filter(a => a.account_type_name === 'liability');
    liabilities.forEach(account => {
      t.assert.equal(
        Number(account.code) >= 20000 && Number(account.code) <= 29999,
        true,
        `Liability account ${account.code} should be in range 20000-29999`,
      );
    });

    // Equity should be 30000-39999
    const equity = accounts.filter(a => a.account_type_name === 'equity');
    equity.forEach(account => {
      t.assert.equal(
        Number(account.code) >= 30000 && Number(account.code) <= 39999,
        true,
        `Equity account ${account.code} should be in range 30000-39999`,
      );
    });

    // Revenue should be 40000-49999
    const revenue = accounts.filter(a => a.account_type_name === 'revenue');
    revenue.forEach(account => {
      t.assert.equal(
        Number(account.code) >= 40000 && Number(account.code) <= 49999,
        true,
        `Revenue account ${account.code} should be in range 40000-49999`,
      );
    });

    // Expenses should be 50000-99999
    const expenses = accounts.filter(a => ['expense', 'cogs'].includes(String(a.account_type_name)));
    expenses.forEach(account => {
      t.assert.equal(
        Number(account.code) >= 50000 && Number(account.code) <= 99999,
        true,
        `Expense account ${account.code} should be in range 50000-99999`,
      );
    });
  });

  await t.test('Contra account validation', async function (t) {
    const fixture = new TestFixture('Contra account validation');
    const db = await fixture.setup();

    // Test that contra accounts have opposite normal balances
    const contraAssets = db.prepare(`
      select * from account
      where account_type_name = 'contra_asset'
    `).all();

    const assetType = db.prepare(`
      select normal_balance from account_type where name = 'asset'
    `).get();

    const contraAssetType = db.prepare(`
      select normal_balance from account_type where name = 'contra_asset'
    `).get();

    t.assert.notEqual(assetType.normal_balance, contraAssetType.normal_balance,
      'Contra asset accounts should have opposite normal balance to asset accounts');

    // Verify specific contra asset accounts exist
    const accumDepBuildings = contraAssets.find(a => a.code === 12210);
    t.assert.equal(!!accumDepBuildings, true, 'Accumulated Depreciation - Buildings should exist');
    t.assert.equal(String(accumDepBuildings.name).includes('Accumulated Depreciation'), true,
      'Contra asset should be depreciation account');
  });

  await t.test('Trial balance validation', async function (t) {
    const fixture = new TestFixture('Trial balance validation');
    const db = await fixture.setupWithInitialCapital();

    // Add a few more transactions
    // Purchase inventory on credit
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(2, 1000000200, 'Purchase inventory on credit');
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 0, 10300, 15000, 0, 15000, 0); // Inventory
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 1, 20100, 0, 15000, 0, 15000); // Accounts Payable
    db.exec('commit');
    db.prepare('update journal_entry set post_time = ? where ref = ?').run(1000000200, 2);

    // Check trial balance using the multicurrency view
    const trialBalance = db.prepare(`
      select
        sum(debit_balance_functional) as total_debits,
        sum(credit_balance_functional) as total_credits
      from trial_balance_multicurrency
    `).get();

    t.assert.equal(
      Number(trialBalance.total_debits),
      Number(trialBalance.total_credits),
      'Total debits must equal total credits in trial balance',
    );
  });

  await t.test('Revenue recognition principle validation', async function (t) {
    const fixture = new TestFixture('Revenue recognition principle validation');
    const db = await fixture.setupWithInitialCapital();

    // Record a sale (revenue recognition)
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(2, 1000000300, 'Cash sale');
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 0, 10100, 10000, 0, 10000, 0); // Cash
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 1, 40100, 0, 10000, 0, 10000); // Sales Revenue
    db.exec('commit');
    db.prepare('update journal_entry set post_time = ? where ref = ?').run(1000000300, 2);

    // Verify revenue is recorded as a credit
    const revenueAccount = db.prepare(`
      select balance from account where code = 40100
    `).get();

    t.assert.equal(Number(revenueAccount.balance) > 0, true, 'Revenue should have positive balance');

    // Verify revenue account type has credit normal balance
    const revenueType = db.prepare(`
      select at.normal_balance from account a
      join account_type at on a.account_type_name = at.name
      where a.code = 40100
    `).get();

    t.assert.equal(revenueType.normal_balance, 'cr', 'Revenue accounts should have credit normal balance');
  });

  await t.test('Expense matching principle validation', async function (t) {
    const fixture = new TestFixture('Expense matching principle validation');
    const db = await fixture.setupWithInitialCapital();

    // Record cost of goods sold matching with revenue
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(2, 1000000400, 'Cost of goods sold');
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 0, 50100, 6000, 0, 6000, 0); // Cost of Goods Sold
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 1, 10300, 0, 6000, 0, 6000); // Inventory
    db.exec('commit');
    db.prepare('update journal_entry set post_time = ? where ref = ?').run(1000000400, 2);

    // Verify COGS is recorded as a debit
    const cogsAccount = db.prepare(`
      select balance from account where code = 50100
    `).get();

    t.assert.equal(Number(cogsAccount.balance) > 0, true, 'COGS should have positive balance');

    // Verify COGS account type has debit normal balance
    const cogsType = db.prepare(`
      select at.normal_balance from account a
      join account_type at on a.account_type_name = at.name
      where a.code = 50100
    `).get();

    t.assert.equal(cogsType.normal_balance, 'db', 'COGS accounts should have debit normal balance');
  });

  await t.test('Prevent zero amount journal entries', async function (t) {
    const fixture = new TestFixture('Prevent zero amount journal entries');
    const db = await fixture.setup();

    // Try to create journal entry with zero amounts - should be allowed in creation but not posting
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(1, 1000000000, 'Zero amount entry');
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 0, 10100, 0, 0, 0, 0);
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 1, 30100, 0, 0, 0, 0);
    db.exec('commit');

    // Try to post - should fail due to zero amounts
    t.assert.throws(function () {
      db.prepare(`
        update journal_entry set post_time = ? where ref = ?
      `).run(1000000000, 1);
    }, 'Should not allow posting journal entries with zero amounts');
  });

  await t.test('Journal entry reversal functionality', async function (t) {
    const fixture = new TestFixture('Journal entry reversal functionality');
    const db = await fixture.setupWithInitialCapital();

    // Create a simple sales transaction to reverse
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(2, 1000000100, 'Sale of goods');

    // Debit: Cash $500
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 0, 10100, 50000, 0, 50000, 0);

    // Credit: Sales Revenue $500
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 1, 40100, 0, 50000, 0, 50000);
    db.exec('commit');

    // Post the sales transaction
    db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000100, 2);

    // Verify initial balances
    const cashBalanceBefore = db.prepare('select balance from account where code = ?').get(10100).balance;
    const salesBalanceBefore = db.prepare('select balance from account where code = ?').get(40100).balance;
    t.assert.equal(cashBalanceBefore, 150000, 'Cash should be $1500 (initial $1000 + sale $500)');
    t.assert.equal(salesBalanceBefore, 50000, 'Sales revenue should be $500');

    // Test reversal creation
    db.prepare(`
      insert into journal_entry_reversal (original_ref) values (?)
    `).run(2);

    // Verify reversal entry was created
    const reversalEntry = db.prepare('select * from journal_entry where ref = 3').get();
    t.assert.equal(reversalEntry !== null && reversalEntry !== undefined, true, 'Reversal entry should be created');
    t.assert.equal(typeof reversalEntry.note, 'string', 'Reversal note should be a string');
    t.assert.equal(String(reversalEntry.note).includes('Reversal of:'), true, 'Reversal note should indicate it is a reversal');
    t.assert.equal(reversalEntry.post_time !== null && reversalEntry.post_time !== undefined, true, 'Reversal entry should be automatically posted');

    // Verify original entry is marked as reversed (in the note)
    const reversalEntryCheck = db.prepare('select * from journal_entry where ref = 3').get();
    t.assert.equal(String(reversalEntryCheck.note).includes('[Reverses Entry #2]'), true, 'Reversal entry should reference original entry');

    // Verify reversal lines
    const reversalLines = db.prepare(`
      select * from journal_entry_line where journal_entry_ref = 3 order by line_order
    `).all();
    t.assert.equal(reversalLines.length, 2, 'Reversal should have 2 lines');
    t.assert.equal(reversalLines[0].account_code, 10100, 'First line should be cash account');
    t.assert.equal(reversalLines[0].db, 0, 'Cash debit should be 0 (reversed)');
    t.assert.equal(reversalLines[0].cr, 50000, 'Cash credit should be $500');
    t.assert.equal(reversalLines[1].account_code, 40100, 'Second line should be sales account');
    t.assert.equal(reversalLines[1].db, 50000, 'Sales debit should be $500');
    t.assert.equal(reversalLines[1].cr, 0, 'Sales credit should be 0 (reversed)');

    // Verify balances are back to original
    const cashBalanceAfter = db.prepare('select balance from account where code = ?').get(10100).balance;
    const salesBalanceAfter = db.prepare('select balance from account where code = ?').get(40100).balance;
    t.assert.equal(cashBalanceAfter, 100000, 'Cash should be back to $1000');
    t.assert.equal(salesBalanceAfter, 0, 'Sales revenue should be back to $0');

    // Test that already reversed entry cannot be reversed again
    t.assert.throws(function () {
      db.prepare('insert into journal_entry_reversal (original_ref) values (2)').run();
    }, 'Should not allow reversing already reversed entry');
  });

  await t.test('Journal entry correction functionality', async function (t) {
    const fixture = new TestFixture('Journal entry correction functionality');
    const db = await fixture.setupWithInitialCapital();

    // Create a transaction with wrong amount to correct
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(2, 1000000100, 'Office supplies purchase - wrong amount');

    // Debit: Office Supplies $200 (should be $300)
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 0, 60500, 20000, 0, 20000, 0);

    // Credit: Cash $200
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 1, 10100, 0, 20000, 0, 20000);
    db.exec('commit');

    // Post the incorrect transaction
    db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000100, 2);

    // Verify initial balances
    const cashBalanceBefore = db.prepare('select balance from account where code = ?').get(10100).balance;
    const expenseBalanceBefore = db.prepare('select balance from account where code = ?').get(60500).balance;
    t.assert.equal(cashBalanceBefore, 80000, 'Cash should be $800 (initial $1000 - $200)');
    t.assert.equal(expenseBalanceBefore, 20000, 'Office supplies expense should be $200');

    // Test correction creation (this reverses the original entry)
    db.prepare(`
      insert into journal_entry_correction (original_ref) values (?)
    `).run(2);

    // Verify correction entry was created
    const correctionEntry = db.prepare('select * from journal_entry where ref = 3').get();
    t.assert.equal(correctionEntry !== null && correctionEntry !== undefined, true, 'Correction entry should be created');
    t.assert.equal(String(correctionEntry.note).includes('Correction of:'), true, 'Correction note should indicate it is a correction');
    t.assert.equal(correctionEntry.post_time !== null && correctionEntry.post_time !== undefined, true, 'Correction entry should be automatically posted');

    // Verify original entry is marked as corrected (in the note)
    const correctionEntryCheck = db.prepare('select * from journal_entry where ref = 3').get();
    t.assert.equal(String(correctionEntryCheck.note).includes('[Corrects Entry #2]'), true, 'Correction entry should reference original entry');

    // Verify correction lines (should reverse the original)
    const correctionLines = db.prepare(`
      select * from journal_entry_line where journal_entry_ref = 3 order by line_order
    `).all();
    t.assert.equal(correctionLines.length, 2, 'Correction should have 2 lines');
    t.assert.equal(correctionLines[0].account_code, 60500, 'First line should be office supplies account');
    t.assert.equal(correctionLines[0].db, 0, 'Office supplies debit should be 0 (reversed)');
    t.assert.equal(correctionLines[0].cr, 20000, 'Office supplies credit should be $200');
    t.assert.equal(correctionLines[1].account_code, 10100, 'Second line should be cash account');
    t.assert.equal(correctionLines[1].db, 20000, 'Cash debit should be $200');
    t.assert.equal(correctionLines[1].cr, 0, 'Cash credit should be 0 (reversed)');

    // Verify balances are back to original after correction
    const cashBalanceAfter = db.prepare('select balance from account where code = ?').get(10100).balance;
    const expenseBalanceAfter = db.prepare('select balance from account where code = ?').get(60500).balance;
    t.assert.equal(cashBalanceAfter, 100000, 'Cash should be back to $1000');
    t.assert.equal(expenseBalanceAfter, 0, 'Office supplies expense should be back to $0');

    // Now create the correct entry manually
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(4, 1000000100, 'Office supplies purchase - correct amount');

    // Debit: Office Supplies $300 (correct amount)
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(4, 0, 60500, 30000, 0, 30000, 0);

    // Credit: Cash $300
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(4, 1, 10100, 0, 30000, 0, 30000);
    db.exec('commit');

    // Post the correct transaction
    db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000100, 4);

    // Verify final balances with correct amounts
    const cashBalanceFinal = db.prepare('select balance from account where code = ?').get(10100).balance;
    const expenseBalanceFinal = db.prepare('select balance from account where code = ?').get(60500).balance;
    t.assert.equal(cashBalanceFinal, 70000, 'Cash should be $700 (initial $1000 - $300)');
    t.assert.equal(expenseBalanceFinal, 30000, 'Office supplies expense should be $300');

    // Test that already corrected entry cannot be corrected again
    t.assert.throws(function () {
      db.prepare('insert into journal_entry_correction (original_ref) values (2)').run();
    }, 'Should not allow correcting already corrected entry');
  });

  await t.test('Reversal and correction validation rules', async function (t) {
    const fixture = new TestFixture('Reversal and correction validation rules');
    const db = await fixture.setupWithInitialCapital();

    // Create an unposted journal entry
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(2, 1000000100, 'Unposted entry');

    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 0, 10100, 10000, 0, 10000, 0);

    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 1, 40100, 0, 10000, 0, 10000);
    db.exec('commit');

    // Test that unposted entries cannot be reversed
    t.assert.throws(function () {
      db.prepare('insert into journal_entry_reversal (original_ref) values (2)').run();
    }, 'Should not allow reversing unposted entry');

    // Test that unposted entries cannot be corrected
    t.assert.throws(function () {
      db.prepare('insert into journal_entry_correction (original_ref) values (2)').run();
    }, 'Should not allow correcting unposted entry');

    // Test that non-existent entries cannot be reversed
    t.assert.throws(function () {
      db.prepare('insert into journal_entry_reversal (original_ref) values (999)').run();
    }, 'Should not allow reversing non-existent entry');

    // Post the entry and then test mixed operations
    db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000100, 2);

    // Reverse the entry
    db.prepare('insert into journal_entry_reversal (original_ref) values (2)').run();

    // Test that reversed entry cannot be corrected
    t.assert.throws(function () {
      db.prepare('insert into journal_entry_correction (original_ref) values (2)').run();
    }, 'Should not allow correcting reversed entry');

    // Create another entry for correction test
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(4, 1000000200, 'Entry to correct');

    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(4, 0, 10100, 5000, 0, 5000, 0);

    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(4, 1, 40100, 0, 5000, 0, 5000);
    db.exec('commit');

    // Post and correct the entry
    db.prepare('update journal_entry set post_time = ? where ref = ?').run(1000000200, 4);

    db.prepare('insert into journal_entry_correction (original_ref) values (4)').run();

    // Test that corrected entry cannot be reversed
    t.assert.throws(function () {
      db.prepare('insert into journal_entry_reversal (original_ref) values (4)').run();
    }, 'Should not allow reversing corrected entry');
  });

  await t.test('Journal entry reversible view functionality', async function (t) {
    const fixture = new TestFixture('Journal entry reversible view functionality');
    const db = await fixture.setupWithInitialCapital();

    // Create multiple entries in different states
    db.exec('begin');

    // Entry 2: Normal posted entry
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(2, 1000000100, 'Normal entry');
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 0, 10100, 10000, 0, 10000, 0);
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 1, 40100, 0, 10000, 0, 10000);

    // Entry 3: Entry to be reversed
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(3, 1000000200, 'Entry to reverse');
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(3, 0, 10100, 5000, 0, 5000, 0);
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(3, 1, 40100, 0, 5000, 0, 5000);

    // Entry 4: Entry to be corrected
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(4, 1000000300, 'Entry to correct');
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(4, 0, 10100, 7500, 0, 7500, 0);
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(4, 1, 40100, 0, 7500, 0, 7500);

    db.exec('commit');

    // Post all entries
    db.prepare('update journal_entry set post_time = transaction_time where ref in (2, 3, 4)').run();

    // Check initial reversible view
    const reversibleBefore = db.prepare(`
      select ref, status, line_count, total_debit, total_credit
      from journal_entry_reversible
      order by ref
    `).all();

    t.assert.equal(reversibleBefore.length, 4, 'Should show 4 posted entries'); // including initial capital
    t.assert.equal(reversibleBefore.filter(e => e.status === 'reversible').length, 4, 'All should be reversible initially');

    // Reverse entry 3
    db.prepare('insert into journal_entry_reversal (original_ref) values (3)').run();

    // Correct entry 4
    db.prepare('insert into journal_entry_correction (original_ref) values (4)').run();

    // Check reversible view after operations
    const reversibleAfter = db.prepare(`
      select ref, status, reversed_by_journal_entry_ref, corrected_by_journal_entry_ref, total_debit, total_credit
      from journal_entry_reversible
      where ref in (1, 2, 3, 4)
      order by ref
    `).all();

    t.assert.equal(reversibleAfter[0].status, 'reversible', 'Entry 1 should still be reversible');
    t.assert.equal(reversibleAfter[1].status, 'reversible', 'Entry 2 should still be reversible');
    t.assert.equal(reversibleAfter[2].status, 'reversed', 'Entry 3 should be marked as reversed');
    t.assert.equal(reversibleAfter[2].reversed_by_journal_entry_ref, 5, 'Entry 3 should be reversed by entry 5');
    t.assert.equal(reversibleAfter[3].status, 'corrected', 'Entry 4 should be marked as corrected');
    t.assert.equal(reversibleAfter[3].corrected_by_journal_entry_ref, 6, 'Entry 4 should be corrected by entry 6');

    // Verify totals in the view
    t.assert.equal(reversibleAfter[0].total_debit, 100000, 'Entry 1 should have correct debit total');
    t.assert.equal(reversibleAfter[0].total_credit, 100000, 'Entry 1 should have correct credit total');
  });

  await t.test('Foreign currency reversal and correction', async function (t) {
    const fixture = new TestFixture('Foreign currency reversal and correction');
    const db = await fixture.setup();

    // Setup EUR currency and exchange rate
    db.exec('begin');
    db.prepare(`
      insert into exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source)
      values (?, ?, ?, ?, ?)
    `).run('EUR', 'USD', 1000000000, 1.2, 'manual');
    db.exec('commit');

    // Create initial capital in USD
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note, transaction_currency_code, exchange_rate_to_functional)
      values (?, ?, ?, ?, ?)
    `).run(1, 1000000000, 'Initial capital', 'USD', 1.0);
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 0, 10100, 100000, 0, 100000, 0); // $1000 USD
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 1, 30100, 0, 100000, 0, 100000);
    db.exec('commit');
    db.prepare('update journal_entry set post_time = ? where ref = ?').run(1000000000, 1);

    // Create EUR transaction
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note, transaction_currency_code, exchange_rate_to_functional)
      values (?, ?, ?, ?, ?)
    `).run(2, 1000000100, 'EUR sale', 'EUR', 1.2);

    // Cash €100 = $120
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional, foreign_currency_amount, foreign_currency_code, exchange_rate)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(2, 0, 10100, 10000, 0, 12000, 0, 10000, 'EUR', 1.2); // €100 = $120

    // Sales Revenue €100 = $120
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional, foreign_currency_amount, foreign_currency_code, exchange_rate)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(2, 1, 40100, 0, 10000, 0, 12000, -10000, 'EUR', 1.2); // €100 = $120
    db.exec('commit');

    // Post the EUR transaction
    db.prepare('update journal_entry set post_time = ? where ref = ?').run(1000000100, 2);

    // Verify balances before reversal
    const cashBefore = db.prepare('select balance from account where code = ?').get(10100).balance;
    const salesBefore = db.prepare('select balance from account where code = ?').get(40100).balance;
    t.assert.equal(cashBefore, 112000, 'Cash should be $1120 ($1000 + $120)');
    t.assert.equal(salesBefore, 12000, 'Sales should be $120');

    // Reverse the EUR transaction
    db.prepare('insert into journal_entry_reversal (original_ref) values (2)').run();

    // Verify reversal maintains foreign currency information
    const reversalEntry = db.prepare('select * from journal_entry where ref = 3').get();
    t.assert.equal(reversalEntry.transaction_currency_code, 'EUR', 'Reversal should maintain EUR currency');
    t.assert.equal(reversalEntry.exchange_rate_to_functional, 1.2, 'Reversal should maintain exchange rate');

    // Verify reversal lines with foreign currency
    const reversalLines = db.prepare(`
      select * from journal_entry_line where journal_entry_ref = 3 order by line_order
    `).all();
    t.assert.equal(reversalLines[0].foreign_currency_amount, -10000, 'Reversal should flip foreign currency amount');
    t.assert.equal(reversalLines[0].foreign_currency_code, 'EUR', 'Reversal should maintain foreign currency code');
    t.assert.equal(reversalLines[0].exchange_rate, 1.2, 'Reversal should maintain exchange rate');
    t.assert.equal(reversalLines[1].foreign_currency_amount, 10000, 'Reversal should flip foreign currency amount');

    // Verify balances are restored
    const cashAfter = db.prepare('select balance from account where code = ?').get(10100).balance;
    const salesAfter = db.prepare('select balance from account where code = ?').get(40100).balance;
    t.assert.equal(cashAfter, 100000, 'Cash should be back to $1000');
    t.assert.equal(salesAfter, 0, 'Sales should be back to $0');
  });
});
