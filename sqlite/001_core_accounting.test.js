// @ts-check

import { join } from 'node:path';
import { test } from 'node:test';

import { assertTypeofNumber } from './test-utils/assertion.js';
import { CoreAccountingTestFixture } from './test-utils/core-accounting-test-fixture.js';

const __dirname = new URL('.', import.meta.url).pathname;

test('Core Accounting Schema Structure', async function (t) {
  const fixture = new CoreAccountingTestFixture('schema_structure');

  await t.test('Schema initialization', async function (t) {
    const db = await fixture.setup();

    // Verify essential tables exist
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name IN (
        'account_type', 'account', 'journal_entry', 'journal_entry_line'
      )
    `).all();

    t.assert.equal(tables.length, 4, 'Core accounting tables should exist');
  });

  await t.test('Account types configuration', async function (t) {
    const db = await fixture.setup();

    const accountTypes = db.prepare('SELECT name, normal_balance FROM account_type ORDER BY name').all();
    const typeMap = {};
    accountTypes.forEach(at => {
      typeMap[String(at.name)] = String(at.normal_balance);
    });

    // Verify normal balances follow accounting standards
    t.assert.equal(typeMap.asset, 'db', 'Assets have debit normal balance');
    t.assert.equal(typeMap.liability, 'cr', 'Liabilities have credit normal balance');
    t.assert.equal(typeMap.equity, 'cr', 'Equity has credit normal balance');
    t.assert.equal(typeMap.revenue, 'cr', 'Revenue has credit normal balance');
    t.assert.equal(typeMap.expense, 'db', 'Expenses have debit normal balance');
    t.assert.equal(typeMap.contra_asset, 'cr', 'Contra assets have credit normal balance');
  });

  await t.test('Chart of accounts structure', async function (t) {
    const db = await fixture.setup();

    const accounts = db.prepare(`
      SELECT code, name, account_type_name
      FROM account
      WHERE code IN (10100, 20100, 30100, 40100, 50100)
      ORDER BY code
    `).all();

    const expectedAccounts = [
      { code: 10100, name: 'Cash', account_type_name: 'asset' },
      { code: 20100, name: 'Accounts Payable', account_type_name: 'liability' },
      { code: 30100, name: 'Common Stock', account_type_name: 'equity' },
      { code: 40100, name: 'Sales Revenue', account_type_name: 'revenue' },
      { code: 50100, name: 'Cost of Goods Sold', account_type_name: 'cogs' },
    ];

    expectedAccounts.forEach((expected, index) => {
      t.assert.equal(accounts[index].code, expected.code, `Account ${expected.code} should exist`);
      t.assert.equal(accounts[index].name, expected.name, `Account ${expected.code} should have correct name`);
      t.assert.equal(accounts[index].account_type_name, expected.account_type_name, `Account ${expected.code} should have correct type`);
    });
  });

  await t.test('Account code ranges validation', async function (t) {
    const db = await fixture.setup();

    const codeRanges = db.prepare(`
      SELECT
        account_type_name,
        MIN(code) as min_code,
        MAX(code) as max_code
      FROM account
      GROUP BY account_type_name
    `).all();

    const rangeMap = {};
    codeRanges.forEach(r => {
      rangeMap[String(r.account_type_name)] = {
        min: Number(r.min_code),
        max: Number(r.max_code),
      };
    });

    // Verify standard chart of accounts numbering
    t.assert.equal(rangeMap.asset?.min >= 10000 && rangeMap.asset?.max <= 19999, true, 'Assets in 10000-19999 range');
    t.assert.equal(rangeMap.liability?.min >= 20000 && rangeMap.liability?.max <= 29999, true, 'Liabilities in 20000-29999 range');
    t.assert.equal(rangeMap.equity?.min >= 30000 && rangeMap.equity?.max <= 39999, true, 'Equity in 30000-39999 range');
    t.assert.equal(rangeMap.revenue?.min >= 40000 && rangeMap.revenue?.max <= 49999, true, 'Revenue in 40000-49999 range');
  });

  await t.test('Account tags assignment', async function (t) {
    const db = await fixture.setup();

    // Verify key accounts have proper tags
    const tags = db.prepare(`
      SELECT account_code, tag
      FROM account_tag
      WHERE account_code IN (10100, 40100) AND tag LIKE '%balance_sheet%' OR tag LIKE '%income_statement%'
    `).all();

    const cashTags = tags.filter(t => t.account_code === 10100);
    const revenueTags = tags.filter(t => t.account_code === 40100);

    t.assert.equal(cashTags.some(t => t.tag === 'balance_sheet_current_asset'), true, 'Cash tagged as current asset');
    t.assert.equal(revenueTags.some(t => t.tag === 'income_statement_revenue'), true, 'Revenue tagged for income statement');
  });

  await t.test('Account types are properly created', async function (t) {
    const fixture = new CoreAccountingTestFixture('account_types_creation');
    const db = await fixture.setup();

    const accountTypes = db.prepare('SELECT * FROM account_type ORDER BY name').all();

    t.assert.equal(accountTypes.length, 11, 'Should have 11 account types');

    const asset = accountTypes.find(function (at) { return at.name === 'asset'; }) ?? {};
    t.assert.equal(asset.normal_balance, 'db', 'Asset should have debit normal balance');

    const liability = accountTypes.find(function (at) { return at.name === 'liability'; }) ?? {};
    t.assert.equal(liability.normal_balance, 'cr', 'Liability should have credit normal balance');

    const equity = accountTypes.find(function (at) { return at.name === 'equity'; }) ?? {};
    t.assert.equal(equity.normal_balance, 'cr', 'Equity should have credit normal balance');

    const revenue = accountTypes.find(function (at) { return at.name === 'revenue'; }) ?? {};
    t.assert.equal(revenue.normal_balance, 'cr', 'Revenue should have credit normal balance');

    const expense = accountTypes.find(function (at) { return at.name === 'expense'; }) ?? {};
    t.assert.equal(expense.normal_balance, 'db', 'Expense should have debit normal balance');

    fixture.cleanup();
  });

  await t.test('Chart of accounts is properly loaded', async function (t) {
    const fixture = new CoreAccountingTestFixture('chart_of_accounts_loading');
    const db = await fixture.setup();

    const accounts = db.prepare('SELECT * FROM account ORDER BY code').all();

    t.assert.equal(accounts.length > 0, true, 'Should have accounts loaded');

    // Check specific accounts
    const cash = accounts.find(function (acc) { return acc.code === 10100; }) ?? {};
    t.assert.equal(cash.name, 'Cash', 'Cash account should exist');
    t.assert.equal(cash.account_type_name, 'asset', 'Cash should be an asset');

    const commonStock = accounts.find(function (acc) { return acc.code === 30100; }) ?? {};
    t.assert.equal(commonStock.name, 'Common Stock', 'Common Stock account should exist');
    t.assert.equal(commonStock.account_type_name, 'equity', 'Common Stock should be equity');

    const salesRevenue = accounts.find(function (acc) { return acc.code === 40100; }) ?? {};
    t.assert.equal(salesRevenue.name, 'Sales Revenue', 'Sales Revenue account should exist');
    t.assert.equal(salesRevenue.account_type_name, 'revenue', 'Sales Revenue should be revenue');

    fixture.cleanup();
  });

  await t.test('Contra account validation', async function (t) {
    const fixture = new CoreAccountingTestFixture('contra_account_validation');
    const db = await fixture.setup();

    // Test that contra accounts have opposite normal balances
    const contraAssets = db.prepare(`
      select * from account
      where account_type_name = 'contra_asset'
    `).all();

    const assetType = db.prepare(`
      select normal_balance from account_type where name = 'asset'
    `)?.get() ?? {};

    const contraAssetType = db.prepare(`
      select normal_balance from account_type where name = 'contra_asset'
    `)?.get() ?? {};

    t.assert.notEqual(assetType.normal_balance, contraAssetType.normal_balance,
      'Contra asset accounts should have opposite normal balance to asset accounts');

    // Verify specific contra asset accounts exist
    const accumDepBuildings = contraAssets.find(a => a.code === 12210) ?? {};
    t.assert.equal(!!accumDepBuildings, true, 'Accumulated Depreciation - Buildings should exist');
    t.assert.equal(String(accumDepBuildings.name).includes('Accumulated Depreciation'), true,
      'Contra asset should be depreciation account');

    fixture.cleanup();
  });

  fixture.cleanup();
});

test('Journal Entry Management', async function (t) {

  await t.test('Journal entry creation and validation', async function (t) {
    const fixture = new CoreAccountingTestFixture('journal_entry_creation');
    await fixture.setup();

    // Create unposted journal entry
    const ref = fixture.createJournalEntry('Test entry', [
      { accountCode: 10100, debit: 50000, credit: 0 },
      { accountCode: 30100, debit: 0, credit: 50000 },
    ]);

    const entry = fixture.getJournalEntry(ref);
    t.assert.equal(entry.post_time, null, 'Journal entry should be unposted');
    t.assert.equal(entry.lines.length, 2, 'Should have 2 journal entry lines');

    fixture.cleanup();
  });

  await t.test('Journal entry posting updates account balances', async function (t) {
    const fixture = new CoreAccountingTestFixture('journal_entry_posting');
    await fixture.setupWithInitialCapital();

    const initialCash = fixture.getAccountBalance(10100);

    // Purchase equipment
    fixture.createAndPostJournalEntry('Purchase equipment', [
      { accountCode: 12400, debit: 25000, credit: 0 }, // Office Equipment
      { accountCode: 10100, debit: 0, credit: 25000 },  // Cash
    ]);

    const finalCash = fixture.getAccountBalance(10100);
    const equipmentBalance = fixture.getAccountBalance(12400);

    t.assert.equal(finalCash, initialCash - 25000, 'Cash balance should decrease by $250');
    t.assert.equal(equipmentBalance, 25000, 'Equipment balance should be $250');

    fixture.cleanup();
  });

  await t.test('Auto line numbering works correctly', async function (t) {
    const fixture = new CoreAccountingTestFixture('auto_line_numbering');
    const db = await fixture.setup();

    // Use auto numbering view
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(1, 1000000000, 'Test auto numbering');

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

    fixture.cleanup();
  });

  await t.test('Unbalanced entries cannot be posted', async function (t) {
    const fixture = new CoreAccountingTestFixture('unbalanced_entries');
    await fixture.setup();

    // Create unbalanced entry
    const ref = fixture.createJournalEntry('Unbalanced entry', [
      { accountCode: 10100, debit: 100000, credit: 0 },
      { accountCode: 30100, debit: 0, credit: 50000 }, // Intentionally unbalanced
    ]);

    t.assert.throws(() => {
      fixture.postJournalEntry(ref);
    }, 'Should throw error for unbalanced entry');

    fixture.cleanup();
  });

  await t.test('Posted entries cannot be modified', async function (t) {
    const fixture = new CoreAccountingTestFixture('posted_entries_immutable');
    const db = await fixture.setupWithInitialCapital();

    // Try to update posted journal entry
    t.assert.throws(() => {
      db.prepare('UPDATE journal_entry SET note = ? WHERE ref = ?').run('Modified', 1);
    }, 'Should not allow modification of posted journal entries');

    // Try to delete posted journal entry line
    t.assert.throws(() => {
      db.prepare('DELETE FROM journal_entry_line WHERE journal_entry_ref = ?').run(1);
    }, 'Should not allow deletion of posted journal entry lines');

    fixture.cleanup();
  });

  await t.test('Zero amount entries cannot be posted', async function (t) {
    const fixture = new CoreAccountingTestFixture('zero_amount_entries');
    await fixture.setup();

    const ref = fixture.createJournalEntry('Zero amount entry', [
      { accountCode: 10100, debit: 0, credit: 0 },
      { accountCode: 30100, debit: 0, credit: 0 },
    ]);

    t.assert.throws(() => {
      fixture.postJournalEntry(ref);
    }, 'Should not allow posting journal entries with zero amounts');

    fixture.cleanup();
  });

  await t.test('Journal entry summary view works correctly', async function (t) {
    const fixture = new CoreAccountingTestFixture('journal_entry_summary');
    const db = await fixture.setupWithInitialCapital();

    const summary = db.prepare('SELECT * FROM journal_entry_summary ORDER BY ref, line_order').all();

    t.assert.equal(summary.length, 2, 'Should have 2 lines in summary');
    t.assert.equal(summary[0].ref, 1, 'Entry ref should be 1');
    t.assert.equal(String(summary[0].account_name), 'Cash', 'First line should be Cash');
    t.assert.equal(String(summary[1].account_name), 'Common Stock', 'Second line should be Common Stock');

    fixture.cleanup();
  });
});

test('Journal Entry Reversal and Correction', async function (t) {

  await t.test('Journal entry reversal functionality', async function (t) {
    const fixture = new CoreAccountingTestFixture('journal_entry_reversal');
    await fixture.setupWithInitialCapital();

    // Create a simple sales transaction to reverse
    const originalRef = fixture.createCashSale(50000, 'Sale of goods');

    // Verify initial balances
    const cashBefore = fixture.getAccountBalance(10100);
    const salesBefore = fixture.getAccountBalance(40100);
    t.assert.equal(cashBefore, 150000, 'Cash should be $1500 (initial $1000 + sale $500)');
    t.assert.equal(salesBefore, 50000, 'Sales revenue should be $500');

    // Create reversal
    const reversalRef = fixture.createJournalEntryReversal(originalRef);
    t.assert.equal(typeof reversalRef, 'number', 'Reversal should return entry reference');

    assertTypeofNumber(reversalRef, 'Reversal should return entry reference');

    // Verify reversal entry details
    const reversalEntry = fixture.getJournalEntry(reversalRef);
    t.assert.equal(String(reversalEntry.note).includes('Reversal of:'), true, 'Reversal note should indicate it is a reversal');
    t.assert.equal(reversalEntry.post_time !== null, true, 'Reversal entry should be automatically posted');

    // Verify reversal lines have opposite amounts
    const reversalLines = reversalEntry.lines;
    t.assert.equal(reversalLines.length, 2, 'Reversal should have 2 lines');
    t.assert.equal(reversalLines[0].account_code, 10100, 'First line should be cash account');
    t.assert.equal(reversalLines[0].cr, 50000, 'Cash should be credited (reversed)');
    t.assert.equal(reversalLines[1].account_code, 40100, 'Second line should be sales account');
    t.assert.equal(reversalLines[1].db, 50000, 'Sales should be debited (reversed)');

    // Verify balances are restored
    const cashAfter = fixture.getAccountBalance(10100);
    const salesAfter = fixture.getAccountBalance(40100);
    t.assert.equal(cashAfter, 100000, 'Cash should be back to $1000');
    t.assert.equal(salesAfter, 0, 'Sales revenue should be back to $0');

    fixture.cleanup();
  });

  await t.test('Journal entry correction functionality', async function (t) {
    const fixture = new CoreAccountingTestFixture('journal_entry_correction');
    await fixture.setupWithInitialCapital();

    // Create transaction with wrong amount to correct
    const originalRef = fixture.createCashExpense(20000, 60500, 'Office supplies purchase - wrong amount');

    // Verify initial balances
    const cashBefore = fixture.getAccountBalance(10100);
    const expenseBefore = fixture.getAccountBalance(60500);
    t.assert.equal(cashBefore, 80000, 'Cash should be $800 (initial $1000 - $200)');
    t.assert.equal(expenseBefore, 20000, 'Office supplies expense should be $200');

    // Create correction (this reverses the original entry)
    const correctionRef = fixture.createJournalEntryCorrection(originalRef);
    t.assert.equal(typeof correctionRef, 'number', 'Correction should return entry reference');

    assertTypeofNumber(correctionRef, 'Correction should return entry reference');

    // Verify correction entry details
    const correctionEntry = fixture.getJournalEntry(correctionRef);
    t.assert.equal(String(correctionEntry.note).includes('Correction of:'), true, 'Correction note should indicate it is a correction');
    t.assert.equal(correctionEntry.post_time !== null, true, 'Correction entry should be automatically posted');

    // Verify balances are restored after correction
    const cashAfter = fixture.getAccountBalance(10100);
    const expenseAfter = fixture.getAccountBalance(60500);
    t.assert.equal(cashAfter, 100000, 'Cash should be back to $1000');
    t.assert.equal(expenseAfter, 0, 'Office supplies expense should be back to $0');

    // Now create the correct entry manually
    fixture.createCashExpense(30000, 60500, 'Office supplies purchase - correct amount');

    // Verify final balances with correct amounts
    const cashFinal = fixture.getAccountBalance(10100);
    const expenseFinal = fixture.getAccountBalance(60500);
    t.assert.equal(cashFinal, 70000, 'Cash should be $700 (initial $1000 - $300)');
    t.assert.equal(expenseFinal, 30000, 'Office supplies expense should be $300');

    fixture.cleanup();
  });

  await t.test('Journal entry reversible view functionality', async function (t) {
    const fixture = new CoreAccountingTestFixture('journal_entry_reversible_view');
    await fixture.setupWithInitialCapital();

    // Create multiple entries in different states
    const ref2 = fixture.createAndPostJournalEntry('Normal entry', [
      { accountCode: 10100, debit: 10000, credit: 0 },
      { accountCode: 40100, debit: 0, credit: 10000 },
    ]);

    const ref3 = fixture.createAndPostJournalEntry('Entry to reverse', [
      { accountCode: 10100, debit: 5000, credit: 0 },
      { accountCode: 40100, debit: 0, credit: 5000 },
    ]);

    const ref4 = fixture.createAndPostJournalEntry('Entry to correct', [
      { accountCode: 10100, debit: 7500, credit: 0 },
      { accountCode: 40100, debit: 0, credit: 7500 },
    ]);

    // Check initial reversible view
    const reversibleBefore = fixture.db.prepare(`
      select ref, status, line_count, total_debit, total_credit
      from journal_entry_reversible
      order by ref
    `).all();

    t.assert.equal(reversibleBefore.length, 4, 'Should show 4 posted entries'); // including initial capital
    t.assert.equal(reversibleBefore.filter(e => e.status === 'reversible').length, 4, 'All should be reversible initially');

    // Reverse entry 3
    const reversalRef = fixture.createJournalEntryReversal(ref3);

    // Correct entry 4
    const correctionRef = fixture.createJournalEntryCorrection(ref4);

    // Check reversible view after operations
    const reversibleAfter = fixture.db.prepare(`
      select ref, status, reversed_by_journal_entry_ref, corrected_by_journal_entry_ref, total_debit, total_credit
      from journal_entry_reversible
      where ref in (1, ?, ?, ?)
      order by ref
    `).all(ref2, ref3, ref4);

    t.assert.equal(reversibleAfter[0].status, 'reversible', 'Entry 1 should still be reversible');
    t.assert.equal(reversibleAfter[1].status, 'reversible', 'Entry 2 should still be reversible');
    t.assert.equal(reversibleAfter[2].status, 'reversed', 'Entry 3 should be marked as reversed');
    t.assert.equal(reversibleAfter[2].reversed_by_journal_entry_ref, reversalRef, 'Entry 3 should be reversed by correct entry');
    t.assert.equal(reversibleAfter[3].status, 'corrected', 'Entry 4 should be marked as corrected');
    t.assert.equal(reversibleAfter[3].corrected_by_journal_entry_ref, correctionRef, 'Entry 4 should be corrected by correct entry');

    fixture.cleanup();
  });

  await t.test('Reversal and correction validation rules', async function (t) {
    const fixture = new CoreAccountingTestFixture('reversal_correction_validation');
    await fixture.setupWithInitialCapital();

    // Create an unposted journal entry
    const unpostedRef = fixture.createJournalEntry('Unposted entry', [
      { accountCode: 10100, debit: 10000, credit: 0 },
      { accountCode: 40100, debit: 0, credit: 10000 },
    ]);

    // Test that unposted entries cannot be reversed
    t.assert.throws(() => {
      fixture.createJournalEntryReversal(unpostedRef);
    }, 'Should not allow reversing unposted entry');

    // Test that unposted entries cannot be corrected
    t.assert.throws(() => {
      fixture.createJournalEntryCorrection(unpostedRef);
    }, 'Should not allow correcting unposted entry');

    // Test that non-existent entries cannot be reversed
    t.assert.throws(() => {
      fixture.createJournalEntryReversal(999);
    }, 'Should not allow reversing non-existent entry');

    // Post the entry and then test mixed operations
    fixture.postJournalEntry(unpostedRef);

    // Reverse the entry
    fixture.createJournalEntryReversal(unpostedRef);

    // Test that reversed entry cannot be corrected
    t.assert.throws(() => {
      fixture.createJournalEntryCorrection(unpostedRef);
    }, 'Should not allow correcting reversed entry');

    // Create another entry for correction test
    const correctionTestRef = fixture.createAndPostJournalEntry('Entry to correct', [
      { accountCode: 10100, debit: 5000, credit: 0 },
      { accountCode: 40100, debit: 0, credit: 5000 },
    ]);

    // Correct the entry
    fixture.createJournalEntryCorrection(correctionTestRef);

    // Test that corrected entry cannot be reversed
    t.assert.throws(() => {
      fixture.createJournalEntryReversal(correctionTestRef);
    }, 'Should not allow reversing corrected entry');

    fixture.cleanup();
  });

  await t.test('Already processed entries cannot be processed again', async function (t) {
    const fixture = new CoreAccountingTestFixture('duplicate_processing');
    await fixture.setupWithInitialCapital();

    const originalRef = fixture.createCashSale(25000, 'Original sale');

    // Reverse the entry
    fixture.createJournalEntryReversal(originalRef);

    // Try to reverse already reversed entry
    t.assert.throws(() => {
      fixture.createJournalEntryReversal(originalRef);
    }, 'Should not allow reversing already reversed entry');

    // Create another entry for correction test
    const correctionTestRef = fixture.createCashSale(15000, 'Correction test sale');

    // Correct the entry
    fixture.createJournalEntryCorrection(correctionTestRef);

    // Try to correct already corrected entry
    t.assert.throws(() => {
      fixture.createJournalEntryCorrection(correctionTestRef);
    }, 'Should not allow correcting already corrected entry');

    fixture.cleanup();
  });

  await t.test('Foreign currency reversal maintains currency information', async function (t) {
    const fixture = new CoreAccountingTestFixture('foreign_currency_reversal');
    await fixture.setup();

    // Setup EUR exchange rate
    fixture.setupExchangeRates([{ from: 'EUR', to: 'USD', rate: 1.2 }]);

    // Create initial capital in USD
    fixture.createAndPostJournalEntry('Initial capital', [
      { accountCode: 10100, debit: 100000, credit: 0 },
      { accountCode: 30100, debit: 0, credit: 100000 },
    ]);

    // Create EUR transaction
    const eurRef = fixture.createForeignCurrencyTransaction(
      'EUR sale',
      [
        { accountCode: 10100, debit: 10000, credit: 0 },    // €100 = $120
        { accountCode: 40100, debit: 0, credit: 10000 },    // €100 = $120
      ],
      'EUR',
      1.2,
    );

    // Verify balances before reversal
    const cashBefore = fixture.getAccountBalance(10100);
    const salesBefore = fixture.getAccountBalance(40100);
    t.assert.equal(cashBefore, 112000, 'Cash should be $1120 ($1000 + $120)');
    t.assert.equal(salesBefore, 12000, 'Sales should be $120');

    // Reverse the EUR transaction
    const reversalRef = fixture.createJournalEntryReversal(eurRef);

    assertTypeofNumber(reversalRef, 'Reversal should return entry reference');

    // Verify reversal maintains foreign currency information
    const reversalEntry = fixture.getJournalEntry(reversalRef);
    t.assert.equal(reversalEntry.transaction_currency_code, 'EUR', 'Reversal should maintain EUR currency');
    t.assert.equal(reversalEntry.exchange_rate_to_functional, 1.2, 'Reversal should maintain exchange rate');

    // Verify reversal lines with foreign currency
    const reversalLines = reversalEntry.lines;
    t.assert.equal(reversalLines[0].foreign_currency_amount, -10000, 'Reversal should flip foreign currency amount');
    t.assert.equal(reversalLines[0].foreign_currency_code, 'EUR', 'Reversal should maintain foreign currency code');
    t.assert.equal(reversalLines[0].exchange_rate, 1.2, 'Reversal should maintain exchange rate');

    // Verify balances are restored
    const cashAfter = fixture.getAccountBalance(10100);
    const salesAfter = fixture.getAccountBalance(40100);
    t.assert.equal(cashAfter, 100000, 'Cash should be back to $1000');
    t.assert.equal(salesAfter, 0, 'Sales should be back to $0');

    fixture.cleanup();
  });
});

test('Accounting Principles Validation', async function (t) {

  await t.test('Accounting equation: Assets = Liabilities + Equity', async function (t) {
    const fixture = new CoreAccountingTestFixture('accounting_equation');
    await fixture.setupWithInitialCapital();

    // Create multiple transaction types
    fixture.createAssetPurchase(25000, 12400, 'Equipment purchase');
    fixture.createCashSale(30000, 'Cash sale');
    fixture.createCashExpense(15000, 60100, 'Salary expense');

    const validation = fixture.validateAccountingIntegrity();
    t.assert.equal(validation.accountingEquation, true, 'Assets must equal Liabilities + Equity');

    fixture.cleanup();
  });

  await t.test('Trial balance: Total debits = Total credits', async function (t) {
    const fixture = new CoreAccountingTestFixture('trial_balance');
    await fixture.setupWithInitialCapital();

    // Add various transactions
    const scenario = fixture.createBusinessScenario({
      initialCapital: 0, // Already set up
      sales: [{ amount: 50000, note: 'Product sales' }],
      expenses: [{ amount: 30000, accountCode: 60100, note: 'Operating expenses' }],
      assetPurchases: [{ amount: 20000, accountCode: 12400, note: 'Office equipment' }],
    });

    const validation = fixture.validateAccountingIntegrity();
    t.assert.equal(validation.trialBalance, true, 'Total debits must equal total credits');
    t.assert.equal(scenario.transactions.length, 3, 'Should have created 3 transactions');

    fixture.cleanup();
  });

  await t.test('Revenue recognition principle', async function (t) {
    const fixture = new CoreAccountingTestFixture('revenue_recognition');
    await fixture.setupWithInitialCapital();

    // Record revenue transaction
    fixture.createCashSale(25000, 'Service revenue');

    const revenueBalance = fixture.getAccountBalance(40100);
    t.assert.equal(revenueBalance > 0, true, 'Revenue should have positive balance');

    // Verify revenue account has credit normal balance
    const revenueType = fixture.db.prepare(`
      SELECT at.normal_balance
      FROM account a
      JOIN account_type at ON a.account_type_name = at.name
      WHERE a.code = 40100
    `).get();

    t.assert.equal(String(revenueType?.normal_balance), 'cr', 'Revenue accounts should have credit normal balance');

    fixture.cleanup();
  });

  await t.test('Expense matching principle', async function (t) {
    const fixture = new CoreAccountingTestFixture('expense_matching');
    await fixture.setupWithInitialCapital();

    // Record cost of goods sold
    fixture.createAndPostJournalEntry('Cost of goods sold', [
      { accountCode: 50100, debit: 15000, credit: 0 },   // COGS
      { accountCode: 10300, debit: 0, credit: 15000 },   // Inventory
    ]);

    const cogsBalance = fixture.getAccountBalance(50100);
    t.assert.equal(cogsBalance, 15000, 'COGS should have debit balance');

    // Verify COGS account type has debit normal balance
    const cogsType = fixture.db.prepare(`
      SELECT at.normal_balance
      FROM account a
      JOIN account_type at ON a.account_type_name = at.name
      WHERE a.code = 50100
    `).get();

    t.assert.equal(String(cogsType?.normal_balance), 'db', 'COGS accounts should have debit normal balance');

    fixture.cleanup();
  });

  await t.test('Contra account validation', async function (t) {
    const fixture = new CoreAccountingTestFixture('contra_accounts');
    await fixture.setup();

    // Verify contra accounts have opposite normal balances
    const normalBalances = fixture.db.prepare(`
      SELECT
        (SELECT normal_balance FROM account_type WHERE name = 'asset') as asset_balance,
        (SELECT normal_balance FROM account_type WHERE name = 'contra_asset') as contra_asset_balance
    `).get();

    t.assert.notEqual(
      String(normalBalances?.asset_balance),
      String(normalBalances?.contra_asset_balance),
      'Contra asset accounts should have opposite normal balance to asset accounts',
    );

    // Verify specific contra asset account exists
    const accumDep = fixture.db.prepare(`
      SELECT * FROM account WHERE code = 12210 AND account_type_name = 'contra_asset'
    `).get();

    t.assert.equal(!!accumDep, true, 'Accumulated Depreciation account should exist as contra asset');

    fixture.cleanup();
  });

  await t.test('Account balance summarization by type', async function (t) {
    const fixture = new CoreAccountingTestFixture('balance_by_type');
    await fixture.setupWithInitialCapital();

    // Create diverse transactions
    fixture.createCashSale(50000, 'Sales revenue');
    fixture.createCashExpense(20000, 60100, 'Salary expense');
    fixture.createAssetPurchase(30000, 12400, 'Equipment purchase');

    const balancesByType = fixture.getAccountBalancesByType();

    t.assert.equal(balancesByType.asset > 0, true, 'Should have positive asset balances');
    t.assert.equal(balancesByType.equity > 0, true, 'Should have positive equity balances');
    t.assert.equal(balancesByType.revenue > 0, true, 'Should have positive revenue balances');
    t.assert.equal(balancesByType.expense > 0, true, 'Should have positive expense balances');

    fixture.cleanup();
  });

  await t.test('Business scenario validation', async function (t) {
    const fixture = new CoreAccountingTestFixture('business_scenario');
    await fixture.setup();

    // Create comprehensive business scenario
    const scenario = fixture.createBusinessScenario({
      initialCapital: 150000,
      sales: [
        { amount: 75000, note: 'Q1 Sales' },
        { amount: 45000, note: 'Q2 Sales' },
      ],
      expenses: [
        { amount: 25000, accountCode: 60100, note: 'Salaries' },
        { amount: 15000, accountCode: 60500, note: 'Office supplies' },
      ],
      assetPurchases: [
        { amount: 35000, accountCode: 12400, note: 'Computer equipment' },
        { amount: 50000, accountCode: 12200, note: 'Office furniture' },
      ],
    });

    // Validate comprehensive integrity
    const validation = fixture.validateAccountingIntegrity();

    t.assert.equal(scenario.totalTransactions, 7, 'Should have 7 total transactions');
    t.assert.equal(scenario.totalSales, 120000, 'Total sales should be $1200');
    t.assert.equal(scenario.totalExpenses, 40000, 'Total expenses should be $400');
    t.assert.equal(scenario.totalAssetPurchases, 85000, 'Total asset purchases should be $850');

    t.assert.equal(validation.accountingEquation, true, 'Accounting equation must be satisfied');
    t.assert.equal(validation.trialBalance, true, 'Trial balance must be satisfied');
    t.assert.equal(validation.totalJournalEntries, 7, 'Should have 7 posted journal entries');

    fixture.cleanup();
  });

  await t.test('Trial balance multicurrency validation', async function (t) {
    const fixture = new CoreAccountingTestFixture('trial_balance_validation');
    await fixture.setupWithInitialCapital();

    // Add some transactions across different categories
    // Purchase inventory on credit
    fixture.createAndPostJournalEntry('Purchase inventory on credit', [
      { accountCode: 10300, debit: 15000, credit: 0 },  // Inventory
      { accountCode: 20100, debit: 0, credit: 15000 },  // Accounts Payable
    ]);

    // Check trial balance using the multicurrency view
    const trialBalance = fixture.db.prepare(`
      select
        sum(debit_balance_functional) as total_debits,
        sum(credit_balance_functional) as total_credits
      from trial_balance_multicurrency
    `)?.get() ?? {};

    t.assert.equal(
      Number(trialBalance.total_debits),
      Number(trialBalance.total_credits),
      'Total debits must equal total credits in trial balance',
    );

    fixture.cleanup();
  });

  await t.test('Prevent zero amount journal entries', async function (t) {
    const fixture = new CoreAccountingTestFixture('prevent_zero_amounts');
    await fixture.setup();

    // Try to create journal entry with zero amounts
    const ref = fixture.createJournalEntry('Zero amount entry', [
      { accountCode: 10100, debit: 0, credit: 0 },
      { accountCode: 30100, debit: 0, credit: 0 },
    ]);

    // Try to post - should fail due to zero amounts
    t.assert.throws(() => {
      fixture.postJournalEntry(ref);
    }, 'Should not allow posting journal entries with zero amounts');

    fixture.cleanup();
  });
});

test('Advanced Schema Features', async function (t) {
  await t.test('Advanced schema migration creates all required tables', async function (t) {
    const fixture = new CoreAccountingTestFixture('advanced_schema_migration');
    const additionalSchemas = [
      join(__dirname, '002_foreign_exchange.sql'),
      join(__dirname, '003_asset_register.sql'),
      join(__dirname, '099_finance_reporting.sql'),
    ];
    const db = await fixture.setupWithAdditionalSchemas(additionalSchemas);

    // Verify entity table
    const entityTable = db.prepare(`
      select name from sqlite_master where type='table' and name='entity'
    `)?.get();
    t.assert.equal(!!entityTable, true, 'Entity table should be created');

    // Verify revenue contract tables
    const contractTable = db.prepare(`
      select name from sqlite_master where type='table' and name='revenue_contract'
    `)?.get();
    t.assert.equal(!!contractTable, true, 'Revenue contract table should be created');

    const performanceObligationTable = db.prepare(`
      select name from sqlite_master where type='table' and name='revenue_performance_obligation'
    `)?.get();
    t.assert.equal(!!performanceObligationTable, true, 'Revenue performance obligation table should be created');

    // Verify budget tables
    const budgetTable = db.prepare(`
      select name from sqlite_master where type='table' and name='budget'
    `)?.get();
    t.assert.equal(!!budgetTable, true, 'Budget table should be created');

    const budgetLineTable = db.prepare(`
      select name from sqlite_master where type='table' and name='budget_line'
    `)?.get();
    t.assert.equal(!!budgetLineTable, true, 'Budget line table should be created');

    fixture.cleanup();
  });

  await t.test('Default entity is created in advanced features', async function (t) {
    const fixture = new CoreAccountingTestFixture('default_entity_creation');
    const additionalSchemas = [
      join(__dirname, '002_foreign_exchange.sql'),
      join(__dirname, '003_asset_register.sql'),
      join(__dirname, '099_finance_reporting.sql'),
    ];
    const db = await fixture.setupWithAdditionalSchemas(additionalSchemas);

    const mainEntity = db.prepare(`
      select * from entity where entity_code = 'MAIN'
    `)?.get() ?? {};

    t.assert.equal(mainEntity.entity_name, 'Main Company', 'Main company entity should be created');
    t.assert.equal(mainEntity.is_consolidated, 1, 'Main entity should be consolidated');
    t.assert.equal(mainEntity.functional_currency_code, 'USD', 'Main entity should use USD');

    fixture.cleanup();
  });

  await t.test('Contract asset and liability accounts are created', async function (t) {
    const fixture = new CoreAccountingTestFixture('contract_accounts_creation');
    const additionalSchemas = [
      join(__dirname, '002_foreign_exchange.sql'),
      join(__dirname, '003_asset_register.sql'),
      join(__dirname, '099_finance_reporting.sql'),
    ];
    const db = await fixture.setupWithAdditionalSchemas(additionalSchemas);

    const contractAsset = db.prepare(`
      select * from account where code = 10250
    `)?.get() ?? {};
    t.assert.equal(contractAsset.name, 'Contract Assets', 'Contract asset account should be created');
    t.assert.equal(contractAsset.account_type_name, 'asset', 'Contract asset should be an asset');

    const contractLiability = db.prepare(`
      select * from account where code = 20250
    `)?.get() ?? {};
    t.assert.equal(contractLiability.name, 'Contract Liabilities', 'Contract liability account should be created');
    t.assert.equal(contractLiability.account_type_name, 'liability', 'Contract liability should be a liability');

    fixture.cleanup();
  });

  await t.test('Cash flow statement tags are properly assigned', async function (t) {
    const fixture = new CoreAccountingTestFixture('cash_flow_tags');
    const additionalSchemas = [
      join(__dirname, '002_foreign_exchange.sql'),
      join(__dirname, '003_asset_register.sql'),
      join(__dirname, '099_finance_reporting.sql'),
    ];
    const db = await fixture.setupWithAdditionalSchemas(additionalSchemas);

    // Check operating activities tags
    const operatingTags = db.prepare(`
      select account_code from account_tag where tag = 'cash_flow_operating'
    `).all();
    t.assert.equal(operatingTags.length > 0, true, 'Should have operating cash flow tags');

    // Check specific accounts
    const cashTag = db.prepare(`
      select * from account_tag where account_code = 10100 and tag = 'cash_flow_operating'
    `)?.get();
    t.assert.equal(!!cashTag, true, 'Cash should be tagged as operating activity');

    const equipmentTag = db.prepare(`
      select * from account_tag where account_code = 12400 and tag = 'cash_flow_investing'
    `)?.get();
    t.assert.equal(!!equipmentTag, true, 'Equipment should be tagged as investing activity');

    fixture.cleanup();
  });
});

test('Multi-Currency Operations', async function (t) {

  await t.test('Foreign currency journal entry validation', async function (t) {
    const fixture = new CoreAccountingTestFixture('foreign_currency_validation');
    await fixture.setup();

    // Create EUR cash account
    fixture.createForeignCurrencyAccount(10105, 'Cash - EUR', 'asset', 'EUR');

    // Create foreign currency transaction
    const ref = fixture.createAndPostJournalEntry('EUR sale transaction', [
      { accountCode: 10105, debit: 100000, credit: 0, foreignCurrencyAmount: 100000, foreignCurrencyCode: 'EUR', exchangeRate: 1.1050 },
      { accountCode: 40100, debit: 0, credit: 100000, foreignCurrencyAmount: -100000, foreignCurrencyCode: 'EUR', exchangeRate: 1.1050 },
    ], {
      transactionCurrencyCode: 'EUR',
      exchangeRateToFunctional: 1.1050,
    });

    const entry = fixture.getJournalEntry(ref);
    t.assert.equal(entry.transaction_currency_code, 'EUR', 'Should maintain EUR currency');
    t.assert.equal(entry.exchange_rate_to_functional, 1.1050, 'Should maintain exchange rate');
    t.assert.equal(entry.lines[0].foreign_currency_amount, 100000, 'Should preserve foreign currency amount');
    t.assert.equal(entry.lines[0].db_functional, 110500, 'Should convert to functional currency');

    fixture.cleanup();
  });

  await t.test('Exchange rate conversion consistency', async function (t) {
    const fixture = new CoreAccountingTestFixture('exchange_rate_consistency');
    await fixture.setup();

    // Test that functional amounts match exchange rate calculations
    const ref = fixture.createJournalEntry('Test conversion', [
      { accountCode: 10100, debit: 80000, credit: 0 },   // EUR 800 -> USD 1000
      { accountCode: 30100, debit: 0, credit: 80000 },   // EUR 800 -> USD 1000
    ], {
      transactionCurrencyCode: 'EUR',
      exchangeRateToFunctional: 1.2500,
    });

    // Should post successfully with consistent exchange rate
    fixture.postJournalEntry(ref);

    const entry = fixture.getJournalEntry(ref);
    t.assert.equal(entry.post_time !== null && entry.post_time !== undefined, true, 'Entry should be posted');

    fixture.cleanup();
  });

  await t.test('Prevent posting unbalanced functional currency amounts', async function (t) {
    const fixture = new CoreAccountingTestFixture('unbalanced_functional_currency');
    await fixture.setup();

    // Create unbalanced entry in functional currency
    const ref = fixture.createJournalEntry('Unbalanced functional entry', [
      { accountCode: 10100, debit: 50000, credit: 0 },   // $500
      { accountCode: 30100, debit: 0, credit: 50000 },   // $500 transaction, but wrong functional
    ]);

    // Manually corrupt functional amounts to test validation
    fixture.db.prepare(`
      UPDATE journal_entry_line
      SET cr_functional = 60000
      WHERE journal_entry_ref = ? AND account_code = 30100
    `).run(ref);

    // Try to post - should fail
    t.assert.throws(() => {
      fixture.postJournalEntry(ref);
    }, 'Should throw error for unbalanced functional currency amounts');

    fixture.cleanup();
  });

  await t.test('Missing exchange rate returns null instead of default', async function (t) {
    const fixture = new CoreAccountingTestFixture('missing_exchange_rate');
    await fixture.setup();

    // Create EUR account without setting up exchange rates
    fixture.db.prepare(`
      insert into account (code, name, account_type_name, currency_code, balance)
      values (10105, 'Cash - EUR', 'asset', 'EUR', 50000)
    `).run();

    // Query account balance - should return null for functional currency when no exchange rate exists
    const balance = fixture.db.prepare(`
      select balance_functional_currency, balance_original_currency
      from account_balance_multicurrency
      where code = 10105
    `)?.get() ?? {};

    t.assert.equal(balance.balance_functional_currency, null,
      'Should return null when exchange rate is missing instead of defaulting to 1.0');
    t.assert.equal(balance.balance_original_currency, 50000,
      'Original currency balance should remain unchanged');

    // Trial balance should exclude accounts with null functional currency balance
    const trialBalance = fixture.db.prepare(`
      select count(*) as count, sum(debit_balance_functional) as total_debits
      from trial_balance_multicurrency
      where code = 10105
    `)?.get() ?? {};

    t.assert.equal(trialBalance.count, 0,
      'Trial balance should exclude accounts with null functional currency balance');

    // Now add the required exchange rate
    fixture.db.prepare(`
      insert into exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source, created_time)
      values ('EUR', 'USD', 1000000000, 1.2, 'manual', 1000000000)
    `).run();

    // Now the queries should work with proper conversion
    const balanceWithRate = fixture.db.prepare(`
      select balance_functional_currency
      from account_balance_multicurrency
      where code = 10105
    `)?.get() ?? {};

    t.assert.equal(balanceWithRate.balance_functional_currency, 60000,
      'Should convert EUR 500 to USD 600 at rate 1.2');

    fixture.cleanup();
  });

  await t.test('Foreign currency transaction utility method', async function (t) {
    const fixture = new CoreAccountingTestFixture('foreign_currency_utility');
    await fixture.setup();

    // Setup exchange rate
    fixture.setupExchangeRates([{ from: 'GBP', to: 'USD', rate: 1.3500 }]);

    // Create GBP account
    fixture.createForeignCurrencyAccount(10106, 'Cash - GBP', 'asset', 'GBP');

    // Use utility method for foreign currency transaction
    const ref = fixture.createForeignCurrencyTransaction(
      'GBP service revenue',
      [
        { accountCode: 10106, debit: 50000, credit: 0 },    // GBP 500
        { accountCode: 40100, debit: 0, credit: 50000 },    // GBP 500
      ],
      'GBP',
      1.3500,
    );

    const entry = fixture.getJournalEntry(ref);
    t.assert.equal(entry.transaction_currency_code, 'GBP', 'Should use GBP currency');
    t.assert.equal(entry.exchange_rate_to_functional, 1.3500, 'Should use specified exchange rate');
    t.assert.equal(entry.lines[0].foreign_currency_code, 'GBP', 'Should set foreign currency code');
    t.assert.equal(entry.lines[0].db_functional, 67500, 'Should convert GBP 500 to USD 675');

    fixture.cleanup();
  });

  await t.test('Multi-currency account balance views', async function (t) {
    const fixture = new CoreAccountingTestFixture('multi_currency_balances');
    await fixture.setup();

    // Setup multiple currencies
    fixture.setupExchangeRates([
      { from: 'EUR', to: 'USD', rate: 1.1000 },
      { from: 'GBP', to: 'USD', rate: 1.3000 },
    ]);

    // Create foreign currency accounts
    fixture.createForeignCurrencyAccount(10105, 'Cash - EUR', 'asset', 'EUR', 100000); // EUR 1000
    fixture.createForeignCurrencyAccount(10106, 'Cash - GBP', 'asset', 'GBP', 75000);  // GBP 750

    // Test multi-currency balance view
    const balances = fixture.db.prepare(`
      SELECT code, balance_original_currency, currency_code, balance_functional_currency
      FROM account_balance_multicurrency
      WHERE code IN (10105, 10106)
      ORDER BY code
    `).all();

    t.assert.equal(balances.length, 2, 'Should have 2 foreign currency accounts');
    t.assert.equal(balances[0].balance_original_currency, 100000, 'EUR account should have original balance');
    t.assert.equal(balances[0].balance_functional_currency, 110000, 'EUR should convert to USD 1100');
    t.assert.equal(balances[1].balance_functional_currency, 97500, 'GBP should convert to USD 975');

    fixture.cleanup();
  });

  await t.test('Exchange rate conversion consistency', async function (t) {
    const fixture = new CoreAccountingTestFixture('exchange_rate_consistency');
    await fixture.setup();

    // Test that functional amounts match exchange rate calculations
    const ref = fixture.createJournalEntry('Test conversion', [
      { accountCode: 10100, debit: 80000, credit: 0 },   // EUR 800 -> USD 1000
      { accountCode: 30100, debit: 0, credit: 80000 },   // EUR 800 -> USD 1000
    ], {
      transactionCurrencyCode: 'EUR',
      exchangeRateToFunctional: 1.2500,
    });

    // Should post successfully with consistent exchange rate
    fixture.postJournalEntry(ref);

    const entry = fixture.getJournalEntry(ref);
    t.assert.equal(entry.post_time !== null && entry.post_time !== undefined, true, 'Entry should be posted');

    fixture.cleanup();
  });

  await t.test('Missing exchange rate returns null instead of default', async function (t) {
    const fixture = new CoreAccountingTestFixture('missing_exchange_rate');
    await fixture.setup();

    // Create EUR account without setting up exchange rates
    fixture.db.prepare(`
      insert into account (code, name, account_type_name, currency_code, balance)
      values (10107, 'Cash - CHF', 'asset', 'CHF', 50000)
    `).run();

    // Query account balance - should return null for functional currency when no exchange rate exists
    const balance = fixture.db.prepare(`
      select balance_functional_currency, balance_original_currency
      from account_balance_multicurrency
      where code = 10107
    `)?.get() ?? {};

    t.assert.equal(balance.balance_functional_currency, null,
      'Should return null when exchange rate is missing instead of defaulting to 1.0');
    t.assert.equal(balance.balance_original_currency, 50000,
      'Original currency balance should remain unchanged');

    // Now add the required exchange rate
    fixture.db.prepare(`
      insert into exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source, created_time)
      values ('CHF', 'USD', 1000000000, 1.1, 'manual', 1000000000)
    `).run();

    // Now the queries should work with proper conversion
    const balanceWithRate = fixture.db.prepare(`
      select balance_functional_currency
      from account_balance_multicurrency
      where code = 10107
    `)?.get() ?? {};

    t.assert.equal(balanceWithRate.balance_functional_currency, 55000,
      'Should convert CHF 500 to USD 550 at rate 1.1');

    fixture.cleanup();
  });
});

test('Revenue Recognition and Budget Management', async function (t) {
  await t.test('Revenue contract creation and management', async function (t) {
    const fixture = new CoreAccountingTestFixture('revenue_contract_creation');
    const additionalSchemas = [
      join(__dirname, '002_foreign_exchange.sql'),
      join(__dirname, '003_asset_register.sql'),
      join(__dirname, '099_finance_reporting.sql'),
    ];
    const db = await fixture.setupWithAdditionalSchemas(additionalSchemas);

    // Create a revenue contract
    db.prepare(`
      insert into revenue_contract (contract_number, customer_name, contract_date, total_contract_value, contract_status, created_time)
      values (?, ?, ?, ?, ?, ?)
    `).run('CTR-2024-001', 'ABC Corp', 1704067200, 120000, 'ACTIVE', 1704067200);

    // Add performance obligations
    db.prepare(`
      insert into revenue_performance_obligation (
        revenue_contract_id, obligation_description, standalone_selling_price,
        allocated_contract_price, satisfaction_method, created_time
      ) values (?, ?, ?, ?, ?, ?)
    `).run(1, 'Software License', 80000, 80000, 'POINT_IN_TIME', 1704067200);

    db.prepare(`
      insert into revenue_performance_obligation (
        revenue_contract_id, obligation_description, standalone_selling_price,
        allocated_contract_price, satisfaction_method, created_time
      ) values (?, ?, ?, ?, ?, ?)
    `).run(1, 'Support Services', 40000, 40000, 'OVER_TIME', 1704067200);

    // Verify contract summary
    const contractSummary = db.prepare(`
      select * from revenue_contract_summary where contract_number = 'CTR-2024-001'
    `)?.get() ?? {};

    t.assert.equal(contractSummary.performance_obligations_count, 2, 'Should have 2 performance obligations');
    t.assert.equal(contractSummary.total_allocated_price, 120000, 'Total allocated price should be $1200');
    t.assert.equal(contractSummary.completion_percentage, 0, 'Should be 0% complete initially');

    fixture.cleanup();
  });

  await t.test('Revenue recognition automation works', async function (t) {
    const fixture = new CoreAccountingTestFixture('revenue_recognition_automation');
    const db = await fixture.setupWithAdvancedFeaturesAndInitialData();

    // Create a revenue contract
    db.prepare(`
      insert into revenue_contract (contract_number, customer_name, contract_date, total_contract_value, contract_status, created_time)
      values (?, ?, ?, ?, ?, ?)
    `).run('CTR-2024-002', 'XYZ Corp', 1704067200, 50000, 'ACTIVE', 1704067200);

    // Add performance obligation
    db.prepare(`
      insert into revenue_performance_obligation (
        revenue_contract_id, obligation_description, standalone_selling_price,
        allocated_contract_price, satisfaction_method, created_time
      ) values (?, ?, ?, ?, ?, ?)
    `).run(1, 'Consulting Services', 50000, 50000, 'POINT_IN_TIME', 1704067200);

    // Mark as completed (should trigger revenue recognition)
    db.prepare(`
      update revenue_performance_obligation
      set percent_complete = 100
      where id = 1
    `).run();

    // Verify journal entry was created
    const revenueEntry = db.prepare(`
      select * from journal_entry
      where note like '%Revenue Recognition%' and note like '%CTR-2024-002%'
    `)?.get() ?? {};
    t.assert.equal(!!revenueEntry, true, 'Revenue recognition journal entry should be created');
    t.assert.equal(!!revenueEntry.post_time, true, 'Revenue entry should be posted');

    // Verify account balances
    const contractAssetBalance = db.prepare(`
      select balance from account where code = 10250
    `)?.get()?.balance ?? 0;
    t.assert.equal(contractAssetBalance, 50000, 'Contract asset should be $500');

    const revenueBalance = db.prepare(`
      select balance from account where code = 40100
    `)?.get()?.balance ?? 0;
    t.assert.equal(revenueBalance, 50000, 'Revenue should be $500');

    fixture.cleanup();
  });

  await t.test('Budget creation and variance analysis', async function (t) {
    const fixture = new CoreAccountingTestFixture('budget_variance_analysis');
    const db = await fixture.setupWithAdvancedFeaturesAndInitialData();

    // Create a budget
    db.prepare(`
      insert into budget (budget_name, budget_year, budget_period_type, created_time, approved_time)
      values (?, ?, ?, ?, ?)
    `).run('Annual Budget 2024', 2024, 'MONTHLY', 1704067200, 1704067200);

    // Add budget lines
    db.prepare(`
      insert into budget_line (budget_id, account_code, period_number, budgeted_amount)
      values (?, ?, ?, ?)
    `).run(1, 40100, 1, 25000); // Sales Revenue - January

    db.prepare(`
      insert into budget_line (budget_id, account_code, period_number, budgeted_amount)
      values (?, ?, ?, ?)
    `).run(1, 60100, 1, 15000); // Salaries - January

    // Create actual transactions for January
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(2, 1704153600, 'January Sales'); // Jan 2, 2024

    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 0, 10100, 30000, 0, 30000, 0); // Cash

    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 1, 40100, 0, 30000, 0, 30000); // Sales Revenue
    db.exec('commit');

    db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1704153600, 2);

    // Check budget variance analysis
    const variance = db.prepare(`
      select * from budget_variance_analysis
      where account_code = 40100 and period_number = 1
    `)?.get() ?? {};

    t.assert.equal(variance.budgeted_amount, 25000, 'Budgeted amount should be $250');
    t.assert.equal(variance.actual_amount, 30000, 'Actual amount should be $300');
    t.assert.equal(variance.variance_amount, 5000, 'Variance should be $50 favorable');
    t.assert.equal(variance.variance_percentage, 20, 'Variance should be 20%');
    t.assert.equal(variance.variance_significance, 'SIGNIFICANT', 'Variance should be significant');

    fixture.cleanup();
  });

  await t.test('Cash flow statement generation works', async function (t) {
    const fixture = new CoreAccountingTestFixture('cash_flow_statement');
    const db = await fixture.setupWithAdvancedFeaturesAndInitialData();

    // Add some transactions across different categories
    // Operating: Sales transaction
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(2, 1704067200, 'Sales transaction');

    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 0, 10100, 50000, 0, 50000, 0); // Cash

    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 1, 40100, 0, 50000, 0, 50000); // Sales Revenue
    db.exec('commit');

    db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1704067200, 2);

    // Investing: Equipment purchase
    db.exec('begin');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(3, 1704067200, 'Equipment purchase');

    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(3, 0, 12400, 25000, 0, 25000, 0); // Office Equipment

    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(3, 1, 10100, 0, 25000, 0, 25000); // Cash
    db.exec('commit');

    db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1704067200, 3);

    // Check cash flow statement
    const cashFlowData = db.prepare(`
      select category, sum(amount) as total_amount from cash_flow_statement
      group by category, sort_order
      order by sort_order
    `).all();

    t.assert.equal(cashFlowData.length >= 2, true, 'Should have multiple cash flow categories');

    const operatingFlow = cashFlowData.find(cf => cf.category === 'Operating Activities');
    t.assert.equal(!!operatingFlow, true, 'Should have operating activities');

    const investingFlow = cashFlowData.find(cf => cf.category === 'Investing Activities');
    t.assert.equal(!!investingFlow, true, 'Should have investing activities');

    fixture.cleanup();
  });

  await t.test('Entity hierarchy and intercompany tracking setup', async function (t) {
    const fixture = new CoreAccountingTestFixture('entity_hierarchy');
    const additionalSchemas = [
      join(__dirname, '002_foreign_exchange.sql'),
      join(__dirname, '003_asset_register.sql'),
      join(__dirname, '099_finance_reporting.sql'),
    ];
    const db = await fixture.setupWithAdditionalSchemas(additionalSchemas);

    // Create subsidiary entity
    db.prepare(`
      insert into entity (entity_code, entity_name, is_consolidated, parent_entity_id, functional_currency_code, created_time)
      values (?, ?, ?, ?, ?, ?)
    `).run('SUB1', 'Subsidiary 1', 1, 1, 'USD', 1704067200);

    // Verify entity hierarchy
    const subsidiary = db.prepare(`
      select * from entity where entity_code = 'SUB1'
    `)?.get() ?? {};
    t.assert.equal(subsidiary.entity_name, 'Subsidiary 1', 'Subsidiary should be created');
    t.assert.equal(subsidiary.parent_entity_id, 1, 'Should reference main entity as parent');
    t.assert.equal(subsidiary.is_consolidated, 1, 'Should be consolidated');

    // Check intercompany transactions view exists
    const intercompanyView = db.prepare(`
      select name from sqlite_master where type='view' and name='intercompany_transactions'
    `)?.get();
    t.assert.equal(!!intercompanyView, true, 'Intercompany transactions view should exist');

    fixture.cleanup();
  });
});
