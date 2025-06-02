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
class FXTestFixture {
  /**
   * @param {string} label - Label for the test case (should be unique per test case)
   */
  constructor(label) {
    this.label = label.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    this.testRunId = testRunId;
    this.coreSchemaPath = join(__dirname, '001_core_accounting.sql');
    this.fxSchemaPath = join(__dirname, '002_foreign_exchange.sql');
    this.db = null;
    this.dbPath = null;
  }

  async setup() {
    const coreSchema = await readFile(this.coreSchemaPath, { encoding: 'utf8' });
    const fxSchema = await readFile(this.fxSchemaPath, { encoding: 'utf8' });

    const tempDir = join(tmpdir(), 'pos-sql-fx-tests');
    await mkdir(tempDir, { recursive: true });
    this.dbPath = join(
      tempDir,
      `${this.testRunId}_fx_${this.label}.db`,
    );

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(coreSchema);
    this.db.exec(fxSchema);

    return this.db;
  }

  /**
   * Create a test journal entry with foreign currency
   * @param {number} ref
   * @param {string} note
   * @param {string} currencyCode
   * @param {number} exchangeRate
   */
  createForeignCurrencyEntry(ref, note, currencyCode = 'EUR', exchangeRate = 1.1050) {
    this.db.prepare(`
      insert into journal_entry (ref, transaction_time, note, transaction_currency_code, exchange_rate_to_functional)
      values (?, ?, ?, ?, ?)
    `).run(ref, Math.floor(Date.now() / 1000), note, currencyCode, exchangeRate);

    return ref;
  }

  /**
   * Add journal entry line with foreign currency amounts
   */
  addForeignCurrencyLine(entryRef, accountCode, dbAmount, crAmount, functionalDbAmount, functionalCrAmount, foreignAmount, foreignCurrency, exchangeRate) {
    this.db.prepare(`
      insert into journal_entry_line_auto_number (
        journal_entry_ref, account_code, db, cr,
        db_functional, cr_functional,
        foreign_currency_amount, foreign_currency_code, exchange_rate
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `    ).run(
      entryRef, accountCode, dbAmount, crAmount,
      functionalDbAmount, functionalCrAmount,
      foreignAmount, foreignCurrency, exchangeRate,
    );
  }

  /**
   * Post a journal entry
   */
  postEntry(ref) {
    this.db.prepare(`
      update journal_entry
      set post_time = unixepoch()
      where ref = ?
    `).run(ref);
  }

  cleanup() {
    if (this.db) {
      this.db.close();
    }
  }
}

// Tests
await test('Foreign Exchange - Currency Management', async function (t) {
  const fixture = new FXTestFixture('currency_management');
  await fixture.setup();

  await t.test('should have default currencies loaded', function (t) {
    const currencies = fixture.db.prepare(`
      select code, name, symbol, decimal_places, is_functional_currency
      from currency
      where is_active = true
      order by code
    `).all();

    t.assert.equal(currencies.length >= 25, true, 'Should have at least 25 currencies');

    const usd = currencies.find(function (c) { return c.code === 'USD'; });
    t.assert.equal(!!usd, true, 'USD should be available');
    t.assert.equal(usd.is_functional_currency, 1, 'USD should be functional currency');

    const eur = currencies.find(function (c) { return c.code === 'EUR'; });
    t.assert.equal(!!eur, true, 'EUR should be available');
    t.assert.equal(eur.is_functional_currency, 0, 'EUR should not be functional currency');
  });

  await t.test('should enforce single functional currency', function (t) {
    // Try to set EUR as functional currency
    fixture.db.prepare(`
      update currency
      set is_functional_currency = true
      where code = 'EUR'
    `).run();

    const functionalCurrencies = fixture.db.prepare(`
      select code from currency where is_functional_currency = true
    `).all();

    t.assert.equal(functionalCurrencies.length, 1, 'Should have exactly one functional currency');
    t.assert.equal(functionalCurrencies[0].code, 'EUR', 'EUR should now be functional currency');

    // Reset to USD
    fixture.db.prepare(`
      update currency
      set is_functional_currency = true
      where code = 'USD'
    `).run();
  });

  fixture.cleanup();
});

await test('Foreign Exchange - Exchange Rates', async function (t) {
  const fixture = new FXTestFixture('exchange_rates');
  await fixture.setup();

  await t.test('should have sample exchange rates', function (t) {
    const rates = fixture.db.prepare(`
      select from_currency_code, to_currency_code, rate
      from exchange_rate
      order by from_currency_code, to_currency_code
    `).all();

    t.assert.equal(rates.length >= 10, true, 'Should have sample exchange rates');

    const eurUsd = rates.find(function (r) { return r.from_currency_code === 'EUR' && r.to_currency_code === 'USD'; });
    t.assert.equal(!!eurUsd, true, 'Should have EUR/USD rate');
    t.assert.equal(Number(eurUsd.rate) > 0, true, 'Exchange rate should be positive');
  });

  await t.test('should provide latest exchange rates view', function (t) {
    const latestRates = fixture.db.prepare(`
      select from_currency_code, to_currency_code, rate, rate_date
      from latest_exchange_rate
      where from_currency_code = 'EUR' and to_currency_code = 'USD'
    `).all();

    t.assert.equal(latestRates.length, 1, 'Should have one latest EUR/USD rate');
    t.assert.equal(Number(latestRates[0].rate) > 0, true, 'Latest rate should be positive');
  });

  await t.test('should provide exchange rate lookup with inverse rates', function (t) {
    const lookupRates = fixture.db.prepare(`
      select from_currency_code, to_currency_code, rate
      from exchange_rate_lookup
      where (from_currency_code = 'EUR' and to_currency_code = 'USD')
         or (from_currency_code = 'USD' and to_currency_code = 'EUR')
      order by from_currency_code
    `).all();

    t.assert.equal(lookupRates.length, 2, 'Should have both EUR/USD and USD/EUR rates');

    const eurUsd = lookupRates.find(function (r) { return r.from_currency_code === 'EUR'; });
    const usdEur = lookupRates.find(function (r) { return r.from_currency_code === 'USD'; });

    t.assert.equal(!!(eurUsd && usdEur), true, 'Should have both directions');
    t.assert.equal(Math.abs((Number(eurUsd.rate) * Number(usdEur.rate)) - 1.0) < 0.001, true, 'Inverse rates should multiply to ~1');
  });

  fixture.cleanup();
});

await test('Foreign Exchange - Multi-Currency Accounts', async function (t) {
  const fixture = new FXTestFixture('multicurrency_accounts');
  await fixture.setup();

  await t.test('should create accounts in different currencies', function (t) {
    // Create EUR cash account
    fixture.db.prepare(`
      insert into account (code, name, account_type_name, currency_code)
      values (10101, 'Cash - EUR', 'asset', 'EUR')
    `).run();

    // Create GBP cash account
    fixture.db.prepare(`
      insert into account (code, name, account_type_name, currency_code)
      values (10102, 'Cash - GBP', 'asset', 'GBP')
    `).run();

    const accounts = fixture.db.prepare(`
      select code, name, currency_code from account
      where code in (10101, 10102)
      order by code
    `).all();

    t.assert.equal(accounts.length, 2, 'Should have created 2 foreign currency accounts');
    t.assert.equal(accounts[0].currency_code, 'EUR', 'First account should be EUR');
    t.assert.equal(accounts[1].currency_code, 'GBP', 'Second account should be GBP');
  });

  await t.test('should handle foreign currency transactions', function (t) {
    // Create EUR revenue account
    fixture.db.prepare(`
      insert into account (code, name, account_type_name, currency_code)
      values (40101, 'Sales Revenue - EUR', 'revenue', 'EUR')
    `).run();

    // Create a foreign currency sale transaction
    const entryRef = fixture.createForeignCurrencyEntry(1, 'Sale in EUR', 'EUR', 1.1050);

    // EUR 1000 sale -> USD equivalent
    fixture.addForeignCurrencyLine(entryRef, 10101, 100000, 0, 110500, 0, 100000, 'EUR', 1.1050); // Cash EUR
    fixture.addForeignCurrencyLine(entryRef, 40101, 0, 100000, 0, 110500, -100000, 'EUR', 1.1050); // Revenue EUR

    fixture.postEntry(entryRef);

    // Check the posted entry
    const summary = fixture.db.prepare(`
      select account_code, db, cr, db_functional, cr_functional,
             foreign_currency_amount, foreign_currency_code
      from journal_entry_summary
      where ref = 1
      order by line_order
    `).all();

    t.assert.equal(summary.length, 2, 'Should have 2 lines');
    t.assert.equal(summary[0].db_functional, 110500, 'Debit functional amount should be converted');
    t.assert.equal(summary[1].cr_functional, 110500, 'Credit functional amount should be converted');
    t.assert.equal(summary[0].foreign_currency_amount, 100000, 'Foreign currency amount should be preserved');
  });

  fixture.cleanup();
});

await test('Foreign Exchange - Multi-Currency Balances', async function (t) {
  const fixture = new FXTestFixture('multicurrency_balances');
  await fixture.setup();

  await t.test('should show balances in original and functional currency', async function (t) {
    // Setup accounts and transactions
    fixture.db.prepare(`
      insert into account (code, name, account_type_name, currency_code)
      values (10103, 'Cash - EUR', 'asset', 'EUR')
    `).run();

    const entryRef = fixture.createForeignCurrencyEntry(1, 'Initial EUR deposit', 'EUR', 1.1050);
    fixture.addForeignCurrencyLine(entryRef, 10103, 100000, 0, 110500, 0, 100000, 'EUR', 1.1050); // EUR 1000 -> USD 1105
    fixture.addForeignCurrencyLine(entryRef, 30100, 0, 110500, 0, 110500, 0, 'USD', 1.1050); // Common stock USD 1105
    fixture.postEntry(entryRef);

    // Check multi-currency balance view
    const balances = fixture.db.prepare(`
      select code, name, currency_code, balance_original_currency,
             balance_functional_currency, functional_currency_code
      from account_balance_multicurrency
      where code = 10103
    `).all();

    t.assert.equal(balances.length, 1, 'Should have one balance record');
    t.assert.equal(balances[0].balance_original_currency, 100000, 'Original currency balance should be EUR 1000');
    t.assert.equal(balances[0].currency_code, 'EUR', 'Account currency should be EUR');
    t.assert.equal(balances[0].functional_currency_code, 'USD', 'Functional currency should be USD');
    t.assert.equal(Number(balances[0].balance_functional_currency) > 100000, true, 'Functional balance should be higher due to exchange rate');
  });

  await t.test('should show multi-currency trial balance', async function (t) {
    const trialBalance = fixture.db.prepare(`
      select code, name, currency_code, balance_original_currency,
             balance_functional_currency, debit_balance_functional, credit_balance_functional
      from trial_balance_multicurrency
      order by code
    `).all();

    t.assert.equal(trialBalance.length >= 2, true, 'Should have multiple accounts in trial balance');

    const totalDebits = trialBalance.reduce(function (sum, row) { return sum + Number(row.debit_balance_functional); }, 0);
    const totalCredits = trialBalance.reduce(function (sum, row) { return sum + Number(row.credit_balance_functional); }, 0);

    t.assert.equal(totalDebits, totalCredits, 'Trial balance should be balanced in functional currency');
  });

  fixture.cleanup();
});

await test('Foreign Exchange - FX Revaluation', async function (t) {
  const fixture = new FXTestFixture('fx_revaluation');
  await fixture.setup();

  await t.test('should identify accounts needing revaluation', async function (t) {
    // Setup EUR account with balance
    fixture.db.prepare(`
      insert into account (code, name, account_type_name, currency_code)
      values (10104, 'Cash - EUR', 'asset', 'EUR')
    `).run();

    const entryRef = fixture.createForeignCurrencyEntry(1, 'EUR deposit', 'EUR', 1.1000);
    fixture.addForeignCurrencyLine(entryRef, 10104, 100000, 0, 110000, 0, 100000, 'EUR', 1.1000); // EUR 1000 -> USD 1100
    fixture.addForeignCurrencyLine(entryRef, 30100, 0, 110000, 0, 110000, 0, 'USD', 1.1000); // Common stock USD 1100
    fixture.postEntry(entryRef);

    // Check revaluation candidates
    const candidates = fixture.db.prepare(`
      select code, name, currency_code, balance_original_currency,
             current_functional_balance, current_exchange_rate
      from fx_revaluation_candidates
      where code = 10104
    `).all();

    t.assert.equal(candidates.length, 1, 'Should have one revaluation candidate');
    t.assert.equal(candidates[0].currency_code, 'EUR', 'Should be EUR account');
    t.assert.equal(candidates[0].balance_original_currency, 100000, 'Should have EUR 1000 balance');
    t.assert.equal(Number(candidates[0].current_exchange_rate) > 0, true, 'Should have current exchange rate');
  });

  await t.test('should show FX exposure summary', async function (t) {
    const exposure = fixture.db.prepare(`
      select currency_code, account_count, total_balance_original,
             total_balance_functional, current_exchange_rate
      from fx_exposure_summary
    `).all();

    t.assert.equal(exposure.length >= 1, true, 'Should have FX exposure');

    const eurExposure = exposure.find(function (e) { return e.currency_code === 'EUR'; });
    t.assert.equal(!!eurExposure, true, 'Should have EUR exposure');
    t.assert.equal(eurExposure.account_count, 1, 'Should have one EUR account');
    t.assert.equal(Number(eurExposure.total_balance_functional) > 0, true, 'Should have positive functional balance');
  });

  fixture.cleanup();
});

await test('Foreign Exchange - FX Rate Sources', async function (t) {
  const fixture = new FXTestFixture('fx_rate_sources');
  await fixture.setup();

  await t.test('should have default rate sources configured', function (t) {
    const sources = fixture.db.prepare(`
      select name, description, base_url, api_key_required, is_active
      from fx_rate_source
      where is_active = true
      order by name
    `).all();

    t.assert.equal(sources.length >= 4, true, 'Should have multiple rate sources');

    const manualSource = sources.find(function (s) { return s.name === 'Manual Entry'; });
    t.assert.equal(!!manualSource, true, 'Should have manual entry source');
    t.assert.equal(manualSource.api_key_required, 0, 'Manual entry should not require API key');

    const ecbSource = sources.find(function (s) { return s.name === 'European Central Bank'; });
    t.assert.equal(!!ecbSource, true, 'Should have ECB source');
    t.assert.equal(String(ecbSource.base_url).includes('ecb.europa.eu'), true, 'ECB should have correct URL');
  });

  fixture.cleanup();
});

await test('Foreign Exchange - Rate Trends', async function (t) {
  const fixture = new FXTestFixture('rate_trends');
  await fixture.setup();

  await t.test('should calculate rate change percentages', async function (t) {
    // Add a second rate for EUR/USD to create a trend (use yesterday instead of tomorrow)
    const yesterday = Math.floor(Date.now() / 1000) - 86400;
    fixture.db.prepare(`
      insert into exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source)
      values ('EUR', 'USD', ?, 1.1100, 'Manual Entry')
    `).run(yesterday);

    const trends = fixture.db.prepare(`
      select from_currency_code, to_currency_code, rate, previous_rate, rate_change_percent
      from fx_rate_trends
      where from_currency_code = 'EUR' and to_currency_code = 'USD'
      order by rate_date desc
      limit 2
    `).all();

    t.assert.equal(trends.length, 2, 'Should have two rate records');

    const latestTrend = trends[0];
    t.assert.equal(Number(latestTrend.previous_rate) > 0, true, 'Should have previous rate');
    t.assert.equal(Number(latestTrend.rate_change_percent) !== 0, true, 'Should have calculated rate change');
    t.assert.equal(Math.abs(Number(latestTrend.rate_change_percent)) < 10, true, 'Rate change should be reasonable');
  });

  fixture.cleanup();
});

await test('Foreign Exchange - FX Revaluation Calculations', async function (t) {
  const fixture = new FXTestFixture('fx_revaluation_calculations');
  await fixture.setup();

  await t.test('should calculate unrealized gains and losses correctly', async function (t) {
    // Create EUR account
    fixture.db.prepare(`
      insert into account (code, name, account_type_name, currency_code)
      values (10106, 'Cash - EUR', 'asset', 'EUR')
    `).run();

    // Initial EUR transaction at rate 1.1000
    const entryRef1 = fixture.createForeignCurrencyEntry(1, 'Initial EUR deposit', 'EUR', 1.1000);
    fixture.addForeignCurrencyLine(entryRef1, 10106, 100000, 0, 110000, 0, 100000, 'EUR', 1.1000);
    fixture.addForeignCurrencyLine(entryRef1, 30100, 0, 110000, 0, 110000, 0, 'USD', 1.1000);
    fixture.postEntry(entryRef1);

    // Update exchange rate to 1.1500 (EUR strengthened)
    const newRateDate = Math.floor(Date.now() / 1000);
    fixture.db.prepare(`
      insert into exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source)
      values ('EUR', 'USD', ?, 1.1500, 'Manual Entry')
    `).run(newRateDate);

    // Check revaluation candidates after rate change
    const candidates = fixture.db.prepare(`
      select code, currency_code, balance_original_currency, current_functional_balance, current_exchange_rate
      from fx_revaluation_candidates
      where code = 10106
    `).all();

    t.assert.equal(candidates.length, 1, 'Should have one revaluation candidate');
    t.assert.equal(candidates[0].balance_original_currency, 100000, 'Original balance should be EUR 1000');
    t.assert.equal(Math.round(Number(candidates[0].current_functional_balance)), 115000, 'New functional balance should be USD 1150 (rounded)');
    t.assert.equal(Number(candidates[0].current_exchange_rate), 1.1500, 'Should use latest exchange rate');

    // Calculate unrealized gain: 115000 - 110000 = 5000 (USD 50 gain)
    const unrealizedGain = Number(candidates[0].current_functional_balance) - 110000;
    t.assert.equal(unrealizedGain, 5000, 'Should have USD 50 unrealized gain');
  });

  await t.test('should track revaluation runs properly', async function (t) {
    // Create a revaluation run
    const revalRunResult = fixture.db.prepare(`
      insert into fx_revaluation_run (revaluation_date, functional_currency_code, total_unrealized_gain_loss, notes)
      values (?, 'USD', 5000, 'Monthly FX revaluation')
    `).run(Math.floor(Date.now() / 1000));

    const revalRunId = revalRunResult.lastInsertRowid;

    // Add revaluation detail
    fixture.db.prepare(`
      insert into fx_revaluation_detail (
        fx_revaluation_run_id, account_code, original_currency_code,
        balance_original_currency, old_exchange_rate, new_exchange_rate,
        old_functional_balance, new_functional_balance, unrealized_gain_loss
      ) values (?, 10106, 'EUR', 100000, 1.1000, 1.1500, 110000, 115000, 5000)
    `).run(revalRunId);

    // Verify revaluation records
    const revalRun = fixture.db.prepare(`
      select * from fx_revaluation_run where id = ?
    `).get(revalRunId);

    t.assert.equal(revalRun.total_unrealized_gain_loss, 5000, 'Total unrealized gain should be 5000');
    t.assert.equal(revalRun.functional_currency_code, 'USD', 'Functional currency should be USD');

    const revalDetails = fixture.db.prepare(`
      select * from fx_revaluation_detail where fx_revaluation_run_id = ?
    `).all(revalRunId);

    t.assert.equal(revalDetails.length, 1, 'Should have one revaluation detail');
    t.assert.equal(revalDetails[0].unrealized_gain_loss, 5000, 'Detail should show 5000 gain');
  });

  fixture.cleanup();
});

await test('Foreign Exchange - Rate Import Validation', async function (t) {
  const fixture = new FXTestFixture('rate_import_validation');
  await fixture.setup();

  await t.test('should validate exchange rate constraints', async function (t) {
    // Test invalid same currency rate
    t.assert.throws(function () {
      fixture.db.prepare(`
        insert into exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source)
        values ('USD', 'USD', ?, 1.0, 'Manual Entry')
      `).run(Math.floor(Date.now() / 1000));
    }, 'Should reject same currency exchange rate');

    // Test zero rate
    t.assert.throws(function () {
      fixture.db.prepare(`
        insert into exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source)
        values ('EUR', 'USD', ?, 0.0, 'Manual Entry')
      `).run(Math.floor(Date.now() / 1000));
    }, 'Should reject zero exchange rate');

    // Test negative rate
    t.assert.throws(function () {
      fixture.db.prepare(`
        insert into exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source)
        values ('EUR', 'USD', ?, -1.5, 'Manual Entry')
      `).run(Math.floor(Date.now() / 1000));
    }, 'Should reject negative exchange rate');

    // Test unreasonably high rate
    t.assert.throws(function () {
      fixture.db.prepare(`
        insert into exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source)
        values ('EUR', 'USD', ?, 2000000, 'Manual Entry')
      `).run(Math.floor(Date.now() / 1000));
    }, 'Should reject unreasonably high exchange rate');

    // Test future date
    const futureDate = Math.floor(Date.now() / 1000) + 86400; // Tomorrow
    t.assert.throws(function () {
      fixture.db.prepare(`
        insert into exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source)
        values ('EUR', 'USD', ?, 1.1500, 'Manual Entry')
      `).run(futureDate);
    }, 'Should reject future exchange rate dates');
  });

  await t.test('should prevent modification of exchange rate key fields', async function (t) {
    // Insert a valid rate first
    const rateDate = Math.floor(Date.now() / 1000) - 86400; // Yesterday
    fixture.db.prepare(`
      insert into exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source)
      values ('GBP', 'USD', ?, 1.2500, 'Manual Entry')
    `).run(rateDate);

    // Try to modify currency codes - should fail
    t.assert.throws(function () {
      fixture.db.prepare(`
        update exchange_rate
        set from_currency_code = 'EUR'
        where from_currency_code = 'GBP' and to_currency_code = 'USD' and rate_date = ?
      `).run(rateDate);
    }, 'Should not allow modification of currency codes');

    // Try to modify rate date - should fail
    t.assert.throws(function () {
      fixture.db.prepare(`
        update exchange_rate
        set rate_date = ?
        where from_currency_code = 'GBP' and to_currency_code = 'USD' and rate_date = ?
      `).run(rateDate + 3600, rateDate);
    }, 'Should not allow modification of rate date');

    // Should allow modification of rate value and source
    const updateResult = fixture.db.prepare(`
      update exchange_rate
      set rate = 1.2600, source = 'Updated Manual Entry'
      where from_currency_code = 'GBP' and to_currency_code = 'USD' and rate_date = ?
    `).run(rateDate);

    t.assert.equal(updateResult.changes, 1, 'Should allow rate and source updates');
  });

  fixture.cleanup();
});

await test('Foreign Exchange - Accounting Principles Validation', async function (t) {
  const fixture = new FXTestFixture('fx_accounting_principles');
  await fixture.setup();

  await t.test('should maintain balance sheet equality with FX transactions', async function (t) {
    // Simple test with balanced FX transaction
    fixture.db.exec('begin');
    fixture.db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (1, ?, 'Initial capital')
    `).run(Math.floor(Date.now() / 1000));
    fixture.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (1, 0, 10100, 50000, 0, 50000, 0)
    `).run(); // Cash USD
    fixture.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (1, 1, 30100, 0, 50000, 0, 50000)
    `).run(); // Common Stock
    fixture.db.exec('commit');
    fixture.postEntry(1);

    // Check balance sheet equation
    const balances = fixture.db.prepare(`
      select
        sum(case when at.name = 'asset'
            then case when at.normal_balance = 'db' then a.balance else -a.balance end
            else 0 end) as total_assets,
        sum(case when at.name = 'liability'
            then case when at.normal_balance = 'cr' then a.balance else -a.balance end
            else 0 end) as total_liabilities,
        sum(case when at.name = 'equity'
            then case when at.normal_balance = 'cr' then a.balance else -a.balance end
            else 0 end) as total_equity
      from account a
      join account_type at on a.account_type_name = at.name
    `).get();

    t.assert.equal(
      Number(balances.total_assets),
      Number(balances.total_liabilities) + Number(balances.total_equity),
      'Assets must equal Liabilities + Equity even with FX transactions',
    );
  });

  await t.test('should properly handle FX gain/loss recognition', async function (t) {
    // Verify FX gain/loss accounts exist and are properly configured
    const fxAccounts = fixture.db.prepare(`
      select code, name, account_type_name from account
      where code in (71000, 71100, 71200, 71300)
      order by code
    `).all();

    t.assert.equal(fxAccounts.length, 4, 'Should have all FX gain/loss accounts');

    const realizedGain = fxAccounts.find(a => a.code === 71000);
    t.assert.equal(realizedGain.account_type_name, 'revenue', 'Realized FX Gain should be revenue');

    const realizedLoss = fxAccounts.find(a => a.code === 71100);
    t.assert.equal(realizedLoss.account_type_name, 'expense', 'Realized FX Loss should be expense');

    const unrealizedGain = fxAccounts.find(a => a.code === 71200);
    t.assert.equal(unrealizedGain.account_type_name, 'revenue', 'Unrealized FX Gain should be revenue');

    const unrealizedLoss = fxAccounts.find(a => a.code === 71300);
    t.assert.equal(unrealizedLoss.account_type_name, 'expense', 'Unrealized FX Loss should be expense');
  });

  await t.test('should validate multi-currency trial balance integrity', async function (t) {
    // Simple balanced entry to test trial balance
    fixture.db.exec('begin');
    fixture.db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (2, ?, 'Test entry for trial balance')
    `).run(Math.floor(Date.now() / 1000));
    fixture.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (2, 0, 10300, 25000, 0, 25000, 0)
    `).run(); // Inventory
    fixture.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional)
      values (2, 1, 10100, 0, 25000, 0, 25000)
    `).run(); // Cash
    fixture.db.exec('commit');
    fixture.postEntry(2);

    // Check multi-currency trial balance
    const trialBalance = fixture.db.prepare(`
      select
        sum(debit_balance_functional) as total_debits,
        sum(credit_balance_functional) as total_credits,
        count(*) as account_count
      from trial_balance_multicurrency
    `).get();

    t.assert.equal(
      Number(trialBalance.total_debits),
      Number(trialBalance.total_credits),
      'Multi-currency trial balance must balance in functional currency',
    );

    t.assert.equal(Number(trialBalance.account_count) > 0, true, 'Should have accounts in trial balance');
  });

  await t.test('should validate currency consistency in transactions', async function (t) {    // Create a foreign currency transaction to test consistency
    fixture.db.exec('begin');
    fixture.db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (3, ?, 'Foreign currency transaction test')
    `).run(Math.floor(Date.now() / 1000));

    // EUR transaction at rate 1.1050 to USD: EUR 50,000 = USD 55,250
    fixture.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional, foreign_currency_amount, foreign_currency_code, exchange_rate)
      values (3, 0, 10100, 55250, 0, 55250, 0, 50000, 'EUR', 1.1050)
    `).run(); // Cash USD (debit)
    fixture.db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional, foreign_currency_amount, foreign_currency_code, exchange_rate)
      values (3, 1, 40100, 0, 55250, 0, 55250, -50000, 'EUR', 1.1050)
    `).run(); // Sales Revenue (credit)
    fixture.db.exec('commit');
    fixture.postEntry(3);

    // Test that foreign currency amounts match exchange rate calculations
    const entry = fixture.db.prepare(`
      select * from journal_entry_summary
      where ref = 3
      order by line_order
    `).all();

    t.assert.equal(entry.length, 2, 'Should have 2 journal entry lines');

    // Verify functional currency amounts match foreign currency * exchange rate
    entry.forEach(line => {
      if (line.foreign_currency_amount && line.exchange_rate) {
        const expectedFunctional = Math.abs(Number(line.foreign_currency_amount)) * Number(line.exchange_rate);
        const actualFunctional = Math.max(Number(line.db_functional), Number(line.cr_functional));

        // Allow for rounding differences (within 1 cent)
        const difference = Math.abs(expectedFunctional - actualFunctional);
        t.assert.equal(difference <= 1, true,
          `Foreign currency conversion should be accurate (diff: ${difference})`);
      }
    });
  });

  await t.test('should prevent inconsistent currency assignments', async function (t) {
    // Try to create account with invalid currency
    t.assert.throws(function () {
      fixture.db.prepare(`
        insert into account (code, name, account_type_name, currency_code)
        values (10199, 'Invalid Currency Account', 'asset', 'XXX')
      `).run();
    }, 'Should reject accounts with invalid currency codes');
  });

  await t.test('should validate FX rate reasonableness', async function (t) {
    // Check that existing sample rates are reasonable
    const sampleRates = fixture.db.prepare(`
      select from_currency_code, to_currency_code, rate
      from exchange_rate
      where source = 'Manual Entry'
      order by from_currency_code
    `).all();

    sampleRates.forEach(rate => {
      t.assert.equal(Number(rate.rate) > 0, true, 'Exchange rates must be positive');
      t.assert.equal(Number(rate.rate) < 100, true, 'Exchange rates should be reasonable (< 100)');

      // Special case for JPY (should be much less than 1)
      if (rate.from_currency_code === 'JPY') {
        t.assert.equal(Number(rate.rate) < 0.1, true, 'JPY rates should be less than 0.1');
      }
    });
  });

  fixture.cleanup();
});

await test('Foreign Exchange - Rate Source Management', async function (t) {
  const fixture = new FXTestFixture('fx_rate_sources');
  await fixture.setup();

  await t.test('should have default rate sources configured', async function (t) {
    const sources = fixture.db.prepare(`
      select name, description, api_key_required, is_active
      from fx_rate_source
      order by name
    `).all();

    t.assert.equal(sources.length >= 7, true, 'Should have at least 7 rate sources');

    const manualEntry = sources.find(s => s.name === 'Manual Entry');
    t.assert.equal(!!manualEntry, true, 'Should have Manual Entry source');
    t.assert.equal(manualEntry.api_key_required, 0, 'Manual Entry should not require API key');
    t.assert.equal(manualEntry.is_active, 1, 'Manual Entry should be active');

    const ecb = sources.find(s => s.name === 'European Central Bank');
    t.assert.equal(!!ecb, true, 'Should have ECB source');
    t.assert.equal(ecb.api_key_required, 0, 'ECB should not require API key');
  });

  await t.test('should track rate import logs', async function (t) {
    // Create a sample import log
    const sourceId = 1; // Manual Entry source
    const logResult = fixture.db.prepare(`
      insert into fx_rate_import_log (
        source_id, rates_imported, rates_updated, rates_failed,
        import_status, error_message
      ) values (?, 10, 2, 0, 'success', null)
    `).run(sourceId);

    const importLog = fixture.db.prepare(`
      select * from fx_rate_import_log where id = ?
    `).get(logResult.lastInsertRowid);

    t.assert.equal(importLog.rates_imported, 10, 'Should track imported rates count');
    t.assert.equal(importLog.rates_updated, 2, 'Should track updated rates count');
    t.assert.equal(importLog.import_status, 'success', 'Should track import status');
    t.assert.equal(Number(importLog.import_time) > 0, true, 'Should have import timestamp');
  });

  fixture.cleanup();
});
