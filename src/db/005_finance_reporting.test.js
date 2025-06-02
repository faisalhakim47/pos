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
    this.coreSchemaFilePath = join(__dirname, '001_core_accounting.sql');
    this.schemaFilePath = join(__dirname, '005_finance_reporting.sql');
    this.schemaFileContent = null;
    this.db = null;
    this.dbPath = null;
  }

  async setup() {
    // Load both core accounting and finance reporting schemas
    const coreSchemaContent = await readFile(this.coreSchemaFilePath, { encoding: 'utf8' });
    this.schemaFileContent = await readFile(this.schemaFilePath, { encoding: 'utf8' });
    const tempDir = join(tmpdir(), 'pos-sql-tests');
    await mkdir(tempDir, { recursive: true });
    this.dbPath = join(
      tempDir,
      `${this.testRunId}_finance_reporting_${this.label}.db`,
    );
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(coreSchemaContent);
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
    this.db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000001, 1);
    this.db.exec('commit');
    return this.db;
  }

  /**
   * Comprehensive Fiscal Year Closing Test
   *
   * This test creates a complete business cycle including:
   * 1. Initial capital investment (cash and common stock)
   * 2. Purchase merchandise inventory on credit (creating accounts payable)
   * 3. Partial payment of accounts payable with cash
   * 4. Sales transaction with discount and proper COGS handling
   * 5. Collection of accounts receivable
   * 6. Operating expenses (utilities, rent)
   * 7. Dividend declaration and payment
   * 8. Depreciation expense recording
   * 9. Fiscal year creation and closing
   * 10. Verification of proper closing entries and retained earnings
   */
  async setupWithSalesAndExpenses() {
    await this.setupWithInitialCapital();

    // 1. Purchase merchandise inventory on credit
    this.db.exec('begin');
    this.db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(2, 1000000100, 'Purchase merchandise inventory on credit');

    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 0, 10600, 50000, 0, 50000, 0); // Merchandise Inventory
    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 1, 20100, 0, 50000, 0, 50000); // Accounts Payable

    this.db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000101, 2);
    this.db.exec('commit');

    // 2. Pay accounts payable with cash (partial payment)
    this.db.exec('begin');
    this.db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(3, 1000000200, 'Pay accounts payable with cash');

    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(3, 0, 20100, 30000, 0, 30000, 0); // Accounts Payable
    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(3, 1, 10100, 0, 30000, 0, 30000); // Cash

    this.db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000201, 3);
    this.db.exec('commit');

    // 3. Sale with discount (adjusted sale with proper sales discount handling)
    this.db.exec('begin');
    this.db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(4, 1000000300, 'Sale with discount and COGS');

    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(4, 0, 10200, 95000, 0, 95000, 0); // Accounts Receivable (net of discount)
    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(4, 1, 41000, 5000, 0, 5000, 0); // Sales Returns and Allowances (sales discount)
    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(4, 2, 40100, 0, 100000, 0, 100000); // Sales Revenue
    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(4, 3, 50700, 30000, 0, 30000, 0); // Cost of Goods Sold
    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(4, 4, 10600, 0, 30000, 0, 30000); // Merchandise Inventory

    this.db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000301, 4);
    this.db.exec('commit');

    // 4. Collect cash from accounts receivable
    this.db.exec('begin');
    this.db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(5, 1000000350, 'Collect cash from accounts receivable');

    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(5, 0, 10100, 95000, 0, 95000, 0); // Cash
    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(5, 1, 10200, 0, 95000, 0, 95000); // Accounts Receivable

    this.db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000351, 5);
    this.db.exec('commit');

    // 5. Pay utilities expense
    this.db.exec('begin');
    this.db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(6, 1000000400, 'Pay utilities expense');

    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(6, 0, 60300, 20000, 0, 20000, 0); // Utilities Expense
    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(6, 1, 10100, 0, 20000, 0, 20000); // Cash

    this.db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000401, 6);
    this.db.exec('commit');

    // 6. Record rent expense
    this.db.exec('begin');
    this.db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(7, 1000000450, 'Pay rent expense');

    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(7, 0, 60200, 15000, 0, 15000, 0); // Rent Expense
    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(7, 1, 10100, 0, 15000, 0, 15000); // Cash

    this.db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000451, 7);
    this.db.exec('commit');

    // 7. Declare dividend (creates liability)
    this.db.exec('begin');
    this.db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(8, 1000000500, 'Declare dividend');

    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(8, 0, 30600, 10000, 0, 10000, 0); // Dividends/Withdrawals
    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(8, 1, 20200, 0, 10000, 0, 10000); // Accrued Expenses (Dividends Payable)

    this.db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000501, 8);
    this.db.exec('commit');

    // 8. Pay declared dividend
    this.db.exec('begin');
    this.db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(9, 1000000600, 'Pay declared dividend');

    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(9, 0, 20200, 10000, 0, 10000, 0); // Accrued Expenses (Dividends Payable)
    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(9, 1, 10100, 0, 10000, 0, 10000); // Cash

    this.db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000601, 9);
    this.db.exec('commit');

    // 9. Record depreciation expense
    this.db.exec('begin');
    this.db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(10, 1000000700, 'Record depreciation expense');

    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(10, 0, 61100, 5000, 0, 5000, 0); // Depreciation Expense
    this.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(10, 1, 12410, 0, 5000, 0, 5000); // Accumulated Depreciation - Office Equipment

    this.db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000701, 10);
    this.db.exec('commit');

    return this.db;
  }

  async setupWithFiscalYear() {
    await this.setupWithSalesAndExpenses();

    // Create fiscal year to trigger automatic closing entries
    this.db.exec('begin');
    this.db.prepare(`
      insert into fiscal_year (begin_time, end_time)
      values (?, ?)
    `).run(1000000000, 1999999999);
    this.db.exec('commit');

    return this.db;
  }

  async setupWithClosedFiscalYear() {
    await this.setupWithFiscalYear();

    // Post the fiscal year to trigger automatic closing entries
    this.db.exec('begin');
    this.db.prepare(`
      update fiscal_year set post_time = ? where begin_time = ?
    `).run(2000000000, 1000000000);
    this.db.exec('commit');

    return this.db;
  }
}

await test('Finance Reporting Schema', async function (t) {
  await t.test('Migration', async function (t) {
    const fixture = new TestFixture('Migration');
    t.assert.doesNotThrow(
      async function () {
        await fixture.setup();
      },
      'expect no error during migration',
    );
  });

  await t.test('Finance statement configuration is properly loaded', async function (t) {
    const fixture = new TestFixture('Finance statement configuration is properly loaded');
    const db = await fixture.setup();

    const config = db.prepare('SELECT * FROM finance_statement_config WHERE id = 1').get();

    t.assert.equal(typeof config, 'object', 'Finance statement configuration should exist');
    t.assert.equal(config.balance_sheet_current_asset_tag, 'balance_sheet_current_asset');
    t.assert.equal(config.income_statement_revenue_tag, 'income_statement_revenue');
    t.assert.equal(config.fiscal_year_closing_income_summary_account_code, 30400);
    t.assert.equal(config.fiscal_year_closing_retained_earnings_account_code, 30200);

    // Test that finance statement config cannot be deleted
    t.assert.throws(function() {
      db.prepare(`
        delete from finance_statement_config where id = 1
      `).run();
    }, 'Should not allow deletion of finance statement configuration');
  });

  await t.test('Generate first trial balance report', async function (t) {
    const fixture = new TestFixture('Generate first trial balance report');
    const db = await fixture.setupWithInitialCapital();
    db.exec('begin');
    db.prepare(`
      insert into trial_balance (report_time)
      values (?)
    `).run(1000000010);
    db.exec('commit');
    const report = db.prepare(`
      select account_code, db, cr
      from trial_balance_account
      join trial_balance on trial_balance_account.trial_balance_id = trial_balance.id
      where trial_balance.report_time = ?
        and (db > 0 or cr > 0)
      order by account_code
    `).all(1000000010);
    t.assert.equal(report.length, 2, 'Trial balance report should contain two accounts');
    t.assert.equal(report[0].account_code, 10100, 'Cash account should be present in trial balance report');
    t.assert.equal(report[0].db, 100000, 'Cash account balance should be 100000 in trial balance report');
    t.assert.equal(report[1].account_code, 30100, 'Paid-in Capital account should be present in trial balance report');
    t.assert.equal(report[1].cr, 100000, 'Paid-in Capital account balance should be 100000 in trial balance report');
  });

  await t.test('Trial balance before fiscal year closing', async function (t) {
    const fixture = new TestFixture('Trial balance before fiscal year closing');
    const db = await fixture.setupWithSalesAndExpenses();
    db.exec('begin');
    db.prepare(`
      insert into trial_balance (report_time)
      values (?)
    `).run(1999999999);
    db.exec('commit');
    const report = db.prepare(`
      select account_code, db, cr
      from trial_balance_account
      join trial_balance on trial_balance_account.trial_balance_id = trial_balance.id
      where trial_balance.report_time = ?
        and (db > 0 or cr > 0)
      order by account_code
    `).all(1999999999);

    // Expected balances before closing with comprehensive transactions
    // Cash: 100000 (initial) - 30000 (pay A/P) + 95000 (collect A/R) - 20000 (utilities) - 15000 (rent) - 10000 (dividend) = 120000
    // Accounts Receivable: 0 (collected)
    // Merchandise Inventory: 50000 (purchased) - 30000 (COGS) = 20000
    // Accounts Payable: 50000 (purchase) - 30000 (payment) = 20000
    // Common Stock: 100000
    // Sales Revenue: 100000
    // Sales Returns and Allowances: 5000
    // Cost of Goods Sold: 30000
    // Utilities Expense: 20000
    // Rent Expense: 15000
    // Dividends: 10000
    // Depreciation Expense: 5000
    // Accumulated Depreciation: 5000

    const expected = {
      10100: { db: 120000, cr: 0 },     // Cash
      10600: { db: 20000, cr: 0 },      // Merchandise Inventory
      20100: { db: 0, cr: 20000 },      // Accounts Payable
      30100: { db: 0, cr: 100000 },     // Common Stock
      40100: { db: 0, cr: 100000 },     // Sales Revenue
      41000: { db: 5000, cr: 0 },       // Sales Returns and Allowances
      50700: { db: 30000, cr: 0 },      // Cost of Goods Sold
      60300: { db: 20000, cr: 0 },      // Utilities Expense
      60200: { db: 15000, cr: 0 },      // Rent Expense
      30600: { db: 10000, cr: 0 },      // Dividends
      61100: { db: 5000, cr: 0 },       // Depreciation Expense
      12410: { db: 0, cr: 5000 },       // Accumulated Depreciation - Office Equipment
    };

    t.assert.equal(report.length >= 10, true, 'Trial balance should contain relevant accounts before closing');
    for (const row of report) {
      const exp = expected[row.account_code];
      if (exp) {
        t.assert.equal(row.db, exp.db, `Account ${row.account_code} debit balance should be ${exp.db}, got ${row.db}`);
        t.assert.equal(row.cr, exp.cr, `Account ${row.account_code} credit balance should be ${exp.cr}, got ${row.cr}`);
      }
    }

    // Verify accounting equation before closing
    const totalDebits = report.reduce(function(sum, row) { return sum + Number(row.db); }, 0);
    const totalCredits = report.reduce(function(sum, row) { return sum + Number(row.cr); }, 0);
    t.assert.equal(totalDebits, totalCredits, 'Debits should equal credits in trial balance');
  });

  await t.test('Generate income statement report', async function (t) {
    const fixture = new TestFixture('Generate income statement report');
    const db = await fixture.setupWithSalesAndExpenses();
    db.exec('begin');
    db.prepare(`
      insert into income_statement (period_begin_time, period_end_time, report_time)
      values (?, ?, ?)
    `).run(1000000000, 1999999999, 1999999998);
    db.exec('commit');
    const report = db.prepare(`
      select line_type, account_code, account_name, amount, is_subtotal
      from income_statement_report
      where period_begin_time = ? and period_end_time = ?
      order by line_order
    `).all(1000000000, 1999999999);
    t.assert.equal(report.length > 0, true, 'Income statement should contain lines');
    // Check revenues
    const revenues = report.filter(function(line) { return line.line_type === 'revenue'; });
    t.assert.equal(revenues.length, 1, 'Should have one revenue account');
    t.assert.equal(revenues[0].account_code, 40100, 'Revenue should be Sales of Merchandise');
  });

  await t.test('Generate balance sheet report', async function (t) {
    const fixture = new TestFixture('Generate balance sheet report');
    const db = await fixture.setupWithSalesAndExpenses();
    db.exec('begin');
    db.prepare(`
      insert into balance_sheet (report_time)
      values (?)
    `).run(2000000000);
    db.exec('commit');
    const report = db.prepare(`
      select line_type, account_code, account_name, amount, is_subtotal
      from balance_sheet_report
      where report_time = ?
      order by line_order
    `).all(2000000000);

    t.assert.equal(report.length > 0, true, 'Balance sheet should contain lines');
    // Check current assets
    const currentAssets = report.filter(function(line) { return line.line_type === 'current_asset'; });
    t.assert.equal(currentAssets.length >= 2, true, 'Should have current asset accounts');
    // Validate accounting equation: Assets = Liabilities + Equity
    const totalAssets = report.filter(function(line) { return line.line_type === 'total_asset'; });
    const totalLiabilityEquity = report.filter(function(line) { return line.line_type === 'total_liability_equity'; });
    t.assert.equal(totalAssets.length, 1, 'Should have one total assets line');
    t.assert.equal(totalLiabilityEquity.length, 1, 'Should have one total liabilities and equity line');
  });

  await t.test('Fiscal year creation', async function (t) {
    const fixture = new TestFixture('Fiscal year creation');
    const db = await fixture.setupWithFiscalYear();

    // Verify fiscal year was created
    const fiscalYear = db.prepare('select * from fiscal_year where begin_time = ?').get(1000000000);
    t.assert.notEqual(fiscalYear, undefined, 'Fiscal year should be created');
    t.assert.equal(fiscalYear.begin_time, 1000000000, 'Fiscal year begin_time should match');
    t.assert.equal(fiscalYear.end_time, 1999999999, 'Fiscal year end_time should match');
    t.assert.equal(fiscalYear.post_time, null, 'Fiscal year should be unposted initially');
  });

  /*
   * COMPREHENSIVE FISCAL YEAR CLOSING TEST SUMMARY
   * ===============================================
   *
   * The enhanced test suite includes a complete business cycle with:
   *
   * TRANSACTIONS COVERED:
   * - Initial capital investment ($100,000)
   * - Purchase merchandise inventory on credit ($50,000)
   * - Payment of accounts payable with cash ($30,000)
   * - Sales with discount ($100,000 gross, $5,000 discount, $30,000 COGS)
   * - Collection of accounts receivable ($95,000)
   * - Operating expenses: utilities ($20,000), rent ($15,000)
   * - Dividend declaration and payment ($10,000)
   * - Depreciation expense ($5,000)
   *
   * FINAL ACCOUNT BALANCES (after closing):
   * - Cash: $120,000
   * - Merchandise Inventory: $20,000
   * - Accumulated Depreciation: $5,000 (contra-asset)
   * - Accounts Payable: $20,000
   * - Common Stock: $100,000
   * - Retained Earnings: $15,000 (Net Income $25,000 - Dividends $10,000)
   *
   * FISCAL YEAR CLOSING VALIDATION:
   * - All revenue accounts closed to zero
   * - All expense accounts closed to zero
   * - All dividend accounts closed to zero
   * - Net income properly transferred to retained earnings
   * - Balance sheet equation maintained: Assets = Liabilities + Equity
   * - Post-closing trial balance contains only balance sheet accounts
   *
   * NET INCOME CALCULATION:
   * Sales Revenue                $100,000
   * Less: Sales Returns/Allow.    (5,000)
   * Less: Cost of Goods Sold     (30,000)
   * Less: Utilities Expense      (20,000)
   * Less: Rent Expense           (15,000)
   * Less: Depreciation Expense    (5,000)
   * --------------------------------
   * Net Income                   $25,000
   *
   * Less: Dividends              (10,000)
   * --------------------------------
   * Retained Earnings            $15,000
   */

  await t.test('Fiscal year closing trigger', async function (t) {
    const fixture = new TestFixture('Fiscal year closing trigger');
    const db = await fixture.setupWithFiscalYear();

    // Post the fiscal year to trigger automatic closing entries
    db.exec('begin');
    db.prepare(`
      update fiscal_year set post_time = ? where begin_time = ?
    `).run(2000000000, 1000000000);
    db.exec('commit');

    // Verify that closing entries were created
    const closingEntries = db.prepare(`
      select count(*) as count from journal_entry
      where note like '%closing%' or ref >= 900
    `).get().count;
    t.assert.equal(Number(closingEntries) > 0, true, 'Should have closing entries created');

    // Check that revenue and expense accounts are zeroed out
    const revenueBalance = db.prepare('select balance from account where code = ?').get(40100);
    if (revenueBalance) {
      t.assert.equal(revenueBalance.balance, 0, 'Revenue account should be closed to zero');
    }
  });

  await t.test('Comprehensive fiscal year closing cycle', async function (t) {
    const fixture = new TestFixture('Comprehensive fiscal year closing cycle');
    const db = await fixture.setupWithClosedFiscalYear();

    // 1. Verify that all revenue and expense accounts are closed to zero
    const incomeStatementAccounts = db.prepare(`
      select account.code, account.name, account.balance, account_type.normal_balance
      from account
      join account_type on account.account_type_name = account_type.name
      where account_type.name in ('revenue', 'contra_revenue', 'expense', 'cogs', 'dividend')
        and account.balance != 0
    `).all();

    t.assert.equal(incomeStatementAccounts.length, 0,
      `All income statement accounts should be closed to zero. Found non-zero accounts: ${JSON.stringify(incomeStatementAccounts)}`);

    // 2. Verify retained earnings has been updated with net income
    const retainedEarnings = db.prepare('select balance from account where code = ?').get(30200);
    // Net Income = Sales (100000) - Sales Returns (5000) - COGS (30000) - Utilities (20000) - Rent (15000) - Depreciation (5000) = 25000
    // Retained Earnings = Net Income (25000) - Dividends (10000) = 15000
    t.assert.equal(retainedEarnings?.balance, 15000, 'Retained earnings should reflect net income minus dividends');

    // 3. Verify balance sheet equation still holds after closing
    const assets = db.prepare(`
      select sum(case when account_type.normal_balance = 'db' then account.balance else -account.balance end) as total
      from account
      join account_type on account.account_type_name = account_type.name
      where account_type.name in ('asset', 'contra_asset')
    `).get().total;

    const liabilities = db.prepare(`
      select sum(case when account_type.normal_balance = 'cr' then account.balance else -account.balance end) as total
      from account
      join account_type on account.account_type_name = account_type.name
      where account_type.name = 'liability'
    `).get().total;

    const equity = db.prepare(`
      select sum(case when account_type.normal_balance = 'cr' then account.balance else -account.balance end) as total
      from account
      join account_type on account.account_type_name = account_type.name
      where account_type.name = 'equity'
    `).get().total;

    t.assert.equal(Number(assets), Number(liabilities) + Number(equity),
      `Assets (${assets}) should equal Liabilities (${liabilities}) + Equity (${equity}) after closing`);

    // 4. Verify fiscal year is marked as posted
    const fiscalYear = db.prepare('select post_time from fiscal_year where begin_time = ?').get(1000000000);
    t.assert.notEqual(fiscalYear.post_time, null, 'Fiscal year should be marked as posted');

    // 5. Verify closing entries were created
    const closingEntries = db.prepare(`
      select count(*) as count from journal_entry
      where note like '%closing%' or ref >= 900
    `).get().count;
    t.assert.equal(Number(closingEntries) > 0, true, 'Closing entries should have been created');

    // 6. Generate post-closing trial balance
    db.exec('begin');
    db.prepare(`
      insert into trial_balance (report_time)
      values (?)
    `).run(2000000001);
    db.exec('commit');

    const postClosingTB = db.prepare(`
      select account_code, db, cr
      from trial_balance_account
      join trial_balance on trial_balance_account.trial_balance_id = trial_balance.id
      where trial_balance.report_time = ?
        and (db > 0 or cr > 0)
      order by account_code
    `).all(2000000001);

    // Only balance sheet accounts should have balances
    const hasRevenueAccounts = postClosingTB.some(function(row) { return Number(row.account_code) >= 40000 && Number(row.account_code) < 50000; });
    const hasExpenseAccounts = postClosingTB.some(function(row) { return Number(row.account_code) >= 50000 && Number(row.account_code) < 70000; });
    const hasDividendAccounts = postClosingTB.some(function(row) { return Number(row.account_code) === 30600; });

    t.assert.equal(hasRevenueAccounts, false, 'Post-closing trial balance should not contain revenue accounts');
    t.assert.equal(hasExpenseAccounts, false, 'Post-closing trial balance should not contain expense accounts');
    t.assert.equal(hasDividendAccounts, false, 'Post-closing trial balance should not contain dividend accounts');

    // Verify specific post-closing balances
    const expectedPostClosing = {
      10100: { db: 120000, cr: 0 },     // Cash
      10600: { db: 20000, cr: 0 },      // Merchandise Inventory
      20100: { db: 0, cr: 20000 },      // Accounts Payable
      30100: { db: 0, cr: 100000 },     // Common Stock
      30200: { db: 0, cr: 15000 },      // Retained Earnings
      12410: { db: 0, cr: 5000 },       // Accumulated Depreciation
    };

    for (const row of postClosingTB) {
      const exp = expectedPostClosing[row.account_code];
      if (exp) {
        t.assert.equal(row.db, exp.db, `Post-closing: Account ${row.account_code} debit balance should be ${exp.db}`);
        t.assert.equal(row.cr, exp.cr, `Post-closing: Account ${row.account_code} credit balance should be ${exp.cr}`);
      }
    }
  });

  await t.test('Trial balance after fiscal year closing', async function (t) {
    const fixture = new TestFixture('Trial balance after fiscal year closing');
    const db = await fixture.setupWithClosedFiscalYear();
    db.exec('begin');
    db.prepare(`
      insert into trial_balance (report_time)
      values (?)
    `).run(2000000001);
    db.exec('commit');
    const report = db.prepare(`
      select account_code, db, cr
      from trial_balance_account
      join trial_balance on trial_balance_account.trial_balance_id = trial_balance.id
      where trial_balance.report_time = ?
        and (db > 0 or cr > 0)
      order by account_code
    `).all(2000000001);

    // After closing, only balance sheet accounts should have balances
    const hasRevenueAccounts = report.some(function(row) { return Number(row.account_code) >= 40000 && Number(row.account_code) < 50000; });
    const hasExpenseAccounts = report.some(function(row) { return Number(row.account_code) >= 50000 && Number(row.account_code) < 70000; });
    t.assert.equal(hasRevenueAccounts, false, 'Revenue accounts should be closed');
    t.assert.equal(hasExpenseAccounts, false, 'Expense accounts should be closed');
  });

  await t.test('Income statement with comprehensive data', async function (t) {
    const fixture = new TestFixture('Income statement with comprehensive data');
    const db = await fixture.setupWithSalesAndExpenses();

    // Generate comprehensive income statement
    db.exec('begin');
    db.prepare(`
      insert into income_statement (period_begin_time, period_end_time, report_time)
      values (?, ?, ?)
    `).run(1000000000, 1999999999, 1999999999);
    db.exec('commit');

    const report = db.prepare(`
      select line_type, account_code, account_name, amount, is_subtotal
      from income_statement_report
      where period_begin_time = ? and period_end_time = ?
      order by line_order
    `).all(1000000000, 1999999999);

    t.assert.equal(report.length > 0, true, 'Income statement should contain lines');

    // Check for specific revenue and expense items
    const revenues = report.filter(function(line) { return line.line_type === 'revenue'; });
    const contraRevenues = report.filter(function(line) { return line.line_type === 'contra_revenue'; });
    const expenses = report.filter(function(line) { return line.line_type === 'expense'; });
    const cogs = report.filter(function(line) { return line.line_type === 'cogs'; });

    t.assert.equal(revenues.length >= 1, true, 'Should have revenue accounts');
    t.assert.equal(contraRevenues.length >= 1, true, 'Should have contra-revenue accounts (sales returns/allowances)');
    t.assert.equal(expenses.length >= 3, true, 'Should have multiple expense accounts');
    t.assert.equal(cogs.length >= 1, true, 'Should have cost of goods sold');

    // Verify specific amounts
    const salesRevenue = revenues.find(function(r) { return r.account_code === 40100; });
    const salesReturns = contraRevenues.find(function(r) { return r.account_code === 41000; });
    const costOfGoods = cogs.find(function(r) { return r.account_code === 50700; });
    const utilitiesExp = expenses.find(function(r) { return r.account_code === 60300; });
    const rentExp = expenses.find(function(r) { return r.account_code === 60200; });
    const depreciationExp = expenses.find(function(r) { return r.account_code === 61100; });

    t.assert.equal(salesRevenue?.amount, 100000, 'Sales revenue should be 100000');
    t.assert.equal(salesReturns?.amount, 5000, 'Sales returns and allowances should be 5000');
    t.assert.equal(costOfGoods?.amount, 30000, 'Cost of goods sold should be 30000');
    t.assert.equal(utilitiesExp?.amount, 20000, 'Utilities expense should be 20000');
    t.assert.equal(rentExp?.amount, 15000, 'Rent expense should be 15000');
    t.assert.equal(depreciationExp?.amount, 5000, 'Depreciation expense should be 5000');

    // Check for net income calculation
    const netIncome = report.find(function(line) { return line.line_type === 'net_income'; });
    t.assert.notEqual(netIncome, undefined, 'Should have net income line');

    // Net Income = Sales (100000) - Sales Returns (5000) - COGS (30000) - Utilities (20000) - Rent (15000) - Depreciation (5000) = 25000
    const expectedNetIncome = 100000 - 5000 - 30000 - 20000 - 15000 - 5000;
    t.assert.equal(Number(netIncome.amount), expectedNetIncome, `Net income should be ${expectedNetIncome}`);
  });

  await t.test('Balance sheet after fiscal year closing', async function (t) {
    const fixture = new TestFixture('Balance sheet after fiscal year closing');
    const db = await fixture.setupWithClosedFiscalYear();

    // Generate balance sheet after fiscal year closing
    db.exec('begin');
    db.prepare(`
      insert into balance_sheet (report_time)
      values (?)
    `).run(2000000001);
    db.exec('commit');

    const report = db.prepare(`
      select line_type, account_code, account_name, amount, is_subtotal
      from balance_sheet_report
      where report_time = ?
      order by line_order
    `).all(2000000001);

    t.assert.equal(report.length > 0, true, 'Balance sheet should contain lines');

    // Check asset accounts (post-closing)
    const currentAssets = report.filter(function(line) { return line.line_type === 'current_asset'; });
    t.assert.equal(currentAssets.length >= 2, true, 'Should have current asset accounts');

    const cash = currentAssets.find(function(a) { return a.account_code === 10100; });
    const inventory = currentAssets.find(function(a) { return a.account_code === 10600; });

    t.assert.equal(cash?.amount, 120000, 'Cash should be 120000 after closing');
    t.assert.equal(inventory?.amount, 20000, 'Merchandise inventory should be 20000 after closing');

    // Check for accumulated depreciation (contra-asset)
    const nonCurrentAssets = report.filter(function(line) { return line.line_type === 'non_current_asset'; });
    const accumulatedDepreciation = nonCurrentAssets.find(function(a) { return a.account_code === 12410; });
    t.assert.equal(accumulatedDepreciation?.amount, -5000, 'Accumulated depreciation should be -5000');

    // Check liability accounts
    const currentLiabilities = report.filter(function(line) { return line.line_type === 'current_liability'; });
    const accountsPayable = currentLiabilities.find(function(l) { return l.account_code === 20100; });
    t.assert.equal(accountsPayable?.amount, 20000, 'Accounts payable should be 20000');

    // Check equity accounts (should include retained earnings after closing)
    const equity = report.filter(function(line) { return line.line_type === 'equity'; });
    const commonStock = equity.find(function(e) { return e.account_code === 30100; });
    const retainedEarnings = equity.find(function(e) { return e.account_code === 30200; });

    t.assert.equal(commonStock?.amount, 100000, 'Common stock should be 100000');
    t.assert.equal(retainedEarnings?.amount, 15000, 'Retained earnings should be 15000 after closing');

    // Validate accounting equation after closing
    const totalAssets = report.filter(function(line) { return line.line_type === 'total_asset'; });
    const totalLiabilityEquity = report.filter(function(line) { return line.line_type === 'total_liability_equity'; });

    t.assert.equal(totalAssets.length, 1, 'Should have one total assets line');
    t.assert.equal(totalLiabilityEquity.length, 1, 'Should have one total liabilities and equity line');
    t.assert.equal(totalAssets[0].amount, totalLiabilityEquity[0].amount,
      'Assets should equal Liabilities + Equity after closing');

    // Final verification: Assets = Cash (120000) + Inventory (20000) - Accumulated Depreciation (5000) = 135000
    // Liabilities + Equity = Accounts Payable (20000) + Common Stock (100000) + Retained Earnings (15000) = 135000
    t.assert.equal(totalAssets[0].amount, 135000, 'Total assets should be 135000');
    t.assert.equal(totalLiabilityEquity[0].amount, 135000, 'Total liabilities and equity should be 135000');
  });
});
