// @ts-check

import { test } from 'node:test';

import { ForeignExchangeTestFixture } from './test-utils/foreign-exchange-test-fixture.js';

await test('Currency and Exchange Rate Management', async function (t) {
  await t.test('Currency Configuration', async function (t) {
    const fixture = new ForeignExchangeTestFixture('currency_configuration');
    await fixture.setup();

    await t.test('should have default currencies loaded', function () {
      const currencies = fixture.db.prepare(`
        SELECT code, name, symbol, decimals, is_functional_currency
        FROM currency
        WHERE is_active = true
        ORDER BY code
      `).all();

      t.assert.equal(currencies.length >= 25, true, 'Should have at least 25 currencies');

      const usd = currencies.find(function (c) { return c.code === 'USD'; }) ?? {};
      t.assert.equal(!!usd, true, 'USD should be available');
      t.assert.equal(usd.is_functional_currency, 1, 'USD should be functional currency');

      const eur = currencies.find(function (c) { return c.code === 'EUR'; }) ?? {};
      t.assert.equal(!!eur, true, 'EUR should be available');
      t.assert.equal(eur.is_functional_currency, 0, 'EUR should not be functional currency');
    });

    await t.test('should enforce single functional currency', function () {
      // Try to set EUR as functional currency
      fixture.db.prepare(`
        UPDATE currency
        SET is_functional_currency = true
        WHERE code = 'EUR'
      `).run();

      const functionalCurrencies = fixture.db.prepare(`
        SELECT code FROM currency WHERE is_functional_currency = true
      `).all();

      t.assert.equal(functionalCurrencies.length, 1, 'Should have exactly one functional currency');
      t.assert.equal(functionalCurrencies[0].code, 'EUR', 'EUR should now be functional currency');

      // Reset to USD
      fixture.db.prepare(`
        UPDATE currency
        SET is_functional_currency = true
        WHERE code = 'USD'
      `).run();
    });

    fixture.cleanup();
  });

  await t.test('Exchange Rate Management', async function (t) {
    const fixture = new ForeignExchangeTestFixture('exchange_rate_management');
    await fixture.setup();

    await t.test('should have sample exchange rates', function () {
      const rates = fixture.db.prepare(`
        SELECT from_currency_code, to_currency_code, rate
        FROM exchange_rate
        ORDER BY from_currency_code, to_currency_code
      `).all();

      t.assert.equal(rates.length >= 10, true, 'Should have sample exchange rates');

      const eurUsd = rates.find(function (r) {
        return r.from_currency_code === 'EUR' && r.to_currency_code === 'USD';
      }) ?? {};
      t.assert.equal(!!eurUsd, true, 'Should have EUR/USD rate');
      t.assert.equal(Number(eurUsd.rate) > 0, true, 'Exchange rate should be positive');
    });

    await t.test('should provide latest exchange rates view', function () {
      const latestRates = fixture.db.prepare(`
        SELECT from_currency_code, to_currency_code, rate, rate_date
        FROM latest_exchange_rate
        WHERE from_currency_code = 'EUR' and to_currency_code = 'USD'
      `).all();

      t.assert.equal(latestRates.length, 1, 'Should have one latest EUR/USD rate');
      t.assert.equal(Number(latestRates[0].rate) > 0, true, 'Latest rate should be positive');
    });

    await t.test('should provide exchange rate lookup with inverse rates', function () {
      const lookupRates = fixture.db.prepare(`
        SELECT from_currency_code, to_currency_code, rate
        FROM exchange_rate_lookup
        WHERE (from_currency_code = 'EUR' and to_currency_code = 'USD')
           OR (from_currency_code = 'USD' and to_currency_code = 'EUR')
        ORDER BY from_currency_code
      `).all();

      t.assert.equal(lookupRates.length, 2, 'Should have both EUR/USD and USD/EUR rates');

      const eurUsd = lookupRates.find(function (r) { return r.from_currency_code === 'EUR'; }) ?? {};
      const usdEur = lookupRates.find(function (r) { return r.from_currency_code === 'USD'; }) ?? {};

      t.assert.equal(!!(eurUsd && usdEur), true, 'Should have both directions');
      t.assert.equal(Math.abs((Number(eurUsd.rate) * Number(usdEur.rate)) - 1.0) < 0.001, true,
        'Inverse rates should multiply to ~1');
    });

    await t.test('should not include same-currency conversions', function () {
      const sameCurrencyRates = fixture.db.prepare(`
        SELECT from_currency_code, to_currency_code, rate
        FROM exchange_rate_lookup
        WHERE from_currency_code = to_currency_code
      `).all();

      t.assert.equal(sameCurrencyRates.length, 0, 'Should not have any same-currency conversion rates');
    });

    await t.test('should return null for missing exchange rates', function () {
      // Create a test currency with no exchange rates
      fixture.db.prepare(`
        INSERT INTO currency (code, name, symbol, decimals, is_functional_currency, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('XYZ', 'Test Currency', 'XYZ', 2, 0, 1);

      const missingRate = fixture.db.prepare(`
        SELECT rate
        FROM exchange_rate_lookup
        WHERE from_currency_code = 'XYZ' and to_currency_code = 'USD'
      `).get();

      t.assert.equal(missingRate, undefined, 'Should return undefined for missing exchange rate');
    });

    fixture.cleanup();
  });

  await t.test('Rate Source Management', async function (t) {
    const fixture = new ForeignExchangeTestFixture('rate_source_management');
    await fixture.setup();

    await t.test('should have default rate sources configured', function () {
      const sources = fixture.db.prepare(`
        SELECT name, description, base_url, api_key_required, is_active
        FROM fx_rate_source
        WHERE is_active = true
        ORDER BY name
      `).all();

      t.assert.equal(sources.length >= 4, true, 'Should have multiple rate sources');

      const manualSource = sources.find(function (s) { return s.name === 'Manual Entry'; }) ?? {};
      t.assert.equal(!!manualSource, true, 'Should have manual entry source');
      t.assert.equal(manualSource.api_key_required, 0, 'Manual entry should not require API key');

      const ecbSource = sources.find(function (s) { return s.name === 'European Central Bank'; }) ?? {};
      t.assert.equal(!!ecbSource, true, 'Should have ECB source');
      t.assert.equal(String(ecbSource.base_url).includes('ecb.europa.eu'), true, 'ECB should have correct URL');
    });

    await t.test('should track rate import logs', function () {
      const sourceId = 1; // Manual Entry source
      const importTime = 1704153600; // 2024-01-02 00:00:00 UTC
      const logResult = fixture.db.prepare(`
        INSERT INTO fx_rate_import_log (
          source_id, import_time, rates_imported, rates_updated, rates_failed,
          success_time, error_message
        ) VALUES (?, ?, 10, 2, 0, ?, null)
      `).run(sourceId, importTime, importTime);

      const importLog = fixture.db.prepare(`
        SELECT * FROM fx_rate_import_log WHERE id = ?
      `)?.get(logResult.lastInsertRowid) ?? {};

      t.assert.equal(importLog.rates_imported, 10, 'Should track imported rates count');
      t.assert.equal(importLog.rates_updated, 2, 'Should track updated rates count');
      t.assert.equal(importLog.success_time, importTime, 'Should track success timestamp');
      t.assert.equal(importLog.failed_time, null, 'Should not have failed timestamp for successful import');
    });

    fixture.cleanup();
  });
});

await test('Multi-Currency Accounts and Transactions', async function (t) {
  await t.test('Multi-Currency Account Management', async function (t) {
    const fixture = new ForeignExchangeTestFixture('multicurrency_account_management');
    await fixture.setup();

    await t.test('should create accounts in different currencies', function () {
      // Create foreign currency accounts using the fixture utility
      fixture.createForeignCurrencyAccount(10101, 'Cash - EUR', 'asset', 'EUR');
      fixture.createForeignCurrencyAccount(10102, 'Cash - GBP', 'asset', 'GBP');

      const accounts = fixture.db.prepare(`
        SELECT code, name, currency_code FROM account
        WHERE code IN (10101, 10102)
        ORDER BY code
      `).all();

      t.assert.equal(accounts.length, 2, 'Should have created 2 foreign currency accounts');
      t.assert.equal(accounts[0].currency_code, 'EUR', 'First account should be EUR');
      t.assert.equal(accounts[1].currency_code, 'GBP', 'Second account should be GBP');
    });

    await t.test('should handle foreign currency transactions', function () {
      // Create EUR revenue account using the fixture utility
      fixture.createForeignCurrencyAccount(40101, 'Sales Revenue - EUR', 'revenue', 'EUR');

      // Create a foreign currency sale transaction using the manual approach
      const entryRef = fixture.createForeignCurrencyEntry('Sale in EUR', 'EUR', 1.1050);

      // EUR 1000 sale -> USD equivalent
      fixture.addForeignCurrencyLine(entryRef, 10101, 100000, 0, 110500, 0, 100000, 'EUR', 1.1050); // Cash EUR
      fixture.addForeignCurrencyLine(entryRef, 40101, 0, 100000, 0, 110500, -100000, 'EUR', 1.1050); // Revenue EUR

      fixture.postEntry(entryRef);

      // Check the posted entry
      const summary = fixture.db.prepare(`
        SELECT account_code, db, cr, db_functional, cr_functional,
               foreign_currency_amount, foreign_currency_code
        FROM journal_entry_summary
        WHERE ref = ?
        ORDER BY line_order
      `).all(entryRef);

      t.assert.equal(summary.length, 2, 'Should have 2 lines');
      t.assert.equal(summary[0].db_functional, 110500, 'Debit functional amount should be converted');
      t.assert.equal(summary[1].cr_functional, 110500, 'Credit functional amount should be converted');
      t.assert.equal(summary[0].foreign_currency_amount, 100000, 'Foreign currency amount should be preserved');
    });

    fixture.cleanup();
  });

  await t.test('Multi-Currency Balance Reporting', async function (t) {
    const fixture = new ForeignExchangeTestFixture('multicurrency_balance_reporting');
    await fixture.setupWithInitialCapital();

    await t.test('should show balances in original and functional currency', function () {
      // Setup EUR account and transaction using fixture utilities
      fixture.createForeignCurrencyAccount(10103, 'Cash - EUR', 'asset', 'EUR');

      const entryRef = fixture.createForeignCurrencyEntry('Initial EUR deposit', 'EUR', 1.1050);
      fixture.addForeignCurrencyLine(entryRef, 10103, 100000, 0, 110500, 0, 100000, 'EUR', 1.1050); // EUR 1000 -> USD 1105
      fixture.addForeignCurrencyLine(entryRef, 30100, 0, 110500, 0, 110500, 0, 'USD', 1.1050); // Common stock USD 1105
      fixture.postEntry(entryRef);

      // Check multi-currency balance view
      const balances = fixture.db.prepare(`
        SELECT code, name, currency_code, balance_original_currency,
               balance_functional_currency, functional_currency_code
        FROM account_balance_multicurrency
        WHERE code = 10103
      `).all();

      t.assert.equal(balances.length, 1, 'Should have one balance record');
      t.assert.equal(balances[0].balance_original_currency, 100000, 'Original currency balance should be EUR 1000');
      t.assert.equal(balances[0].currency_code, 'EUR', 'Account currency should be EUR');
      t.assert.equal(balances[0].functional_currency_code, 'USD', 'Functional currency should be USD');
      t.assert.equal(Number(balances[0].balance_functional_currency) > 100000, true,
        'Functional balance should be higher due to exchange rate');
    });

    await t.test('should show multi-currency trial balance', function () {
      const trialBalance = fixture.db.prepare(`
        SELECT code, name, currency_code, balance_original_currency,
               balance_functional_currency, debit_balance_functional, credit_balance_functional
        FROM trial_balance_multicurrency
        ORDER BY code
      `).all();

      t.assert.equal(trialBalance.length >= 2, true, 'Should have multiple accounts in trial balance');

      const totalDebits = trialBalance.reduce(function (sum, row) {
        return sum + Number(row.debit_balance_functional);
      }, 0);
      const totalCredits = trialBalance.reduce(function (sum, row) {
        return sum + Number(row.credit_balance_functional);
      }, 0);

      t.assert.equal(totalDebits, totalCredits, 'Trial balance should be balanced in functional currency');
    });

    fixture.cleanup();
  });
});

await test('FX Revaluation and Rate Management', async function (t) {
  await t.test('FX Revaluation Candidates', async function (t) {
    const fixture = new ForeignExchangeTestFixture('fx_revaluation_candidates');
    await fixture.setupWithInitialCapital();

    await t.test('should identify accounts needing revaluation', function () {
      // Setup EUR account with balance using fixture utilities
      fixture.createForeignCurrencyAccount(10104, 'Cash - EUR', 'asset', 'EUR');

      const entryRef = fixture.createForeignCurrencyEntry('EUR deposit', 'EUR', 1.1000);
      fixture.addForeignCurrencyLine(entryRef, 10104, 100000, 0, 110000, 0, 100000, 'EUR', 1.1000); // EUR 1000 -> USD 1100
      fixture.addForeignCurrencyLine(entryRef, 30100, 0, 110000, 0, 110000, 0, 'USD', 1.1000); // Common stock USD 1100
      fixture.postEntry(entryRef);

      // Check revaluation candidates using fixture utility
      const candidates = fixture.getFxRevaluationCandidates().filter(c => c.code === 10104);

      t.assert.equal(candidates.length, 1, 'Should have one revaluation candidate');
      t.assert.equal(candidates[0].currency_code, 'EUR', 'Should be EUR account');
      t.assert.equal(candidates[0].balance_original_currency, 100000, 'Should have EUR 1000 balance');
      t.assert.equal(Number(candidates[0].current_exchange_rate) > 0, true, 'Should have current exchange rate');
    });

    await t.test('should show FX exposure summary', function () {
      const exposure = fixture.getFxExposure();

      t.assert.equal(exposure.length >= 1, true, 'Should have FX exposure');

      const eurExposure = exposure.find(function (e) { return e.currency_code === 'EUR'; }) ?? {};
      t.assert.equal(!!eurExposure, true, 'Should have EUR exposure');
      t.assert.equal(eurExposure.account_count, 1, 'Should have one EUR account');
      t.assert.equal(Number(eurExposure.total_balance_functional) > 0, true, 'Should have positive functional balance');
    });

    fixture.cleanup();
  });

  await t.test('Rate Trends Analysis', async function (t) {
    const fixture = new ForeignExchangeTestFixture('rate_trends_analysis');
    await fixture.setup();

    await t.test('should calculate rate change percentages', function () {
      // Add a second rate for EUR/USD to create a trend (use a date in 2024)
      const rateDate = 1704153600; // 2024-01-02 00:00:00 UTC
      fixture.db.prepare(`
        INSERT INTO exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source, created_time)
        VALUES ('EUR', 'USD', ?, 1.1100, 'Manual Entry', ?)
      `).run(rateDate, rateDate);

      const trends = fixture.db.prepare(`
        SELECT from_currency_code, to_currency_code, rate, previous_rate, rate_change_percent
        FROM fx_rate_trends
        WHERE from_currency_code = 'EUR' and to_currency_code = 'USD'
        ORDER BY rate_date desc
        LIMIT 2
      `).all();

      t.assert.equal(trends.length, 2, 'Should have two rate records');

      const latestTrend = trends[0];
      t.assert.equal(Number(latestTrend.previous_rate) > 0, true, 'Should have previous rate');
      t.assert.equal(Number(latestTrend.rate_change_percent) !== 0, true, 'Should have calculated rate change');
      t.assert.equal(Math.abs(Number(latestTrend.rate_change_percent)) < 10, true, 'Rate change should be reasonable');
    });

    fixture.cleanup();
  });

  await t.test('FX Revaluation Calculations', async function (t) {
    const fixture = new ForeignExchangeTestFixture('fx_revaluation_calculations');
    await fixture.setupWithInitialCapital();

    await t.test('should calculate unrealized gains and losses correctly', function () {
      // Create EUR account using fixture utility
      fixture.createForeignCurrencyAccount(10106, 'Cash - EUR', 'asset', 'EUR');

      // Initial EUR transaction at rate 1.1000
      const entryRef1 = fixture.createForeignCurrencyEntry('Initial EUR deposit', 'EUR', 1.1000);
      fixture.addForeignCurrencyLine(entryRef1, 10106, 100000, 0, 110000, 0, 100000, 'EUR', 1.1000);
      fixture.addForeignCurrencyLine(entryRef1, 30100, 0, 110000, 0, 110000, 0, 'USD', 1.1000);
      fixture.postEntry(entryRef1);

      // Update exchange rate to 1.1500 (EUR strengthened) - use a date in 2024
      const newRateDate = 1704153600; // 2024-01-02 00:00:00 UTC
      fixture.db.prepare(`
        INSERT INTO exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source, created_time)
        VALUES ('EUR', 'USD', ?, 1.1500, 'Manual Entry', ?)
      `).run(newRateDate, newRateDate);

      // Check revaluation candidates after rate change
      const candidates = fixture.getFxRevaluationCandidates().filter(c => c.code === 10106);

      t.assert.equal(candidates.length, 1, 'Should have one revaluation candidate');
      t.assert.equal(candidates[0].balance_original_currency, 100000, 'Original balance should be EUR 1000');
      t.assert.equal(Math.round(Number(candidates[0].current_functional_balance)), 115000,
        'New functional balance should be USD 1150 (rounded)');
      t.assert.equal(Number(candidates[0].current_exchange_rate), 1.1500, 'Should use latest exchange rate');

      // Calculate unrealized gain: 115000 - 110000 = 5000 (USD 50 gain)
      const unrealizedGain = Number(candidates[0].current_functional_balance) - 110000;
      t.assert.equal(unrealizedGain, 5000, 'Should have USD 50 unrealized gain');
    });

    await t.test('should track revaluation runs properly', function () {
      // Create a revaluation run using fixture utility
      const revalDate = 1704153600; // 2024-01-02 00:00:00 UTC
      const revalRunId = fixture.createFxRevaluationRun(revalDate, 5000, 'Monthly FX revaluation');

      // Add revaluation detail using fixture utility
      fixture.addFxRevaluationDetail(revalRunId, 10106, 'EUR', 100000, 1.1000, 1.1500);

      // Verify revaluation records
      const revalRun = fixture.db.prepare(`
        SELECT * FROM fx_revaluation_run WHERE id = ?
      `)?.get(revalRunId) ?? {};

      t.assert.equal(revalRun.total_unrealized_gain_loss, 5000, 'Total unrealized gain should be 5000');
      t.assert.equal(revalRun.functional_currency_code, 'USD', 'Functional currency should be USD');

      const revalDetails = fixture.db.prepare(`
        SELECT * FROM fx_revaluation_detail WHERE fx_revaluation_run_id = ?
      `).all(revalRunId);

      t.assert.equal(revalDetails.length, 1, 'Should have one revaluation detail');
      t.assert.equal(revalDetails[0].unrealized_gain_loss, 5000, 'Detail should show 5000 gain');
    });

    fixture.cleanup();
  });
});

await test('Rate Import Validation and Data Integrity', async function (t) {
  await t.test('Exchange Rate Validation', async function (t) {
    const fixture = new ForeignExchangeTestFixture('exchange_rate_validation');
    await fixture.setup();

    await t.test('should validate exchange rate constraints', function () {
      // Test invalid same currency rate
      t.assert.throws(function () {
        fixture.db.prepare(`
          INSERT INTO exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source)
          VALUES ('USD', 'USD', ?, 1.0, 'Manual Entry')
        `).run(Math.floor(Date.now() / 1000));
      }, 'Should reject same currency exchange rate');

      // Test zero rate
      t.assert.throws(function () {
        fixture.db.prepare(`
          INSERT INTO exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source)
          VALUES ('EUR', 'USD', ?, 0.0, 'Manual Entry')
        `).run(Math.floor(Date.now() / 1000));
      }, 'Should reject zero exchange rate');

      // Test negative rate
      t.assert.throws(function () {
        fixture.db.prepare(`
          INSERT INTO exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source)
          VALUES ('EUR', 'USD', ?, -1.5, 'Manual Entry')
        `).run(Math.floor(Date.now() / 1000));
      }, 'Should reject negative exchange rate');

      // Test unreasonably high rate
      t.assert.throws(function () {
        fixture.db.prepare(`
          INSERT INTO exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source)
          VALUES ('EUR', 'USD', ?, 2000000, 'Manual Entry')
        `).run(Math.floor(Date.now() / 1000));
      }, 'Should reject unreasonably high exchange rate');

      // Test future date
      const futureDate = Math.floor(Date.now() / 1000) + 86400; // Tomorrow
      t.assert.throws(function () {
        fixture.db.prepare(`
          INSERT INTO exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source)
          VALUES ('EUR', 'USD', ?, 1.1500, 'Manual Entry')
        `).run(futureDate);
      }, 'Should reject future exchange rate dates');
    });

    await t.test('should prevent modification of exchange rate key fields', function () {
      // Insert a valid rate first
      const rateDate = 1704153600; // 2024-01-02 00:00:00 UTC
      fixture.db.prepare(`
        INSERT INTO exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source, created_time)
        VALUES ('GBP', 'USD', ?, 1.2500, 'Manual Entry', ?)
      `).run(rateDate, rateDate);

      // Try to modify currency codes - should fail
      t.assert.throws(function () {
        fixture.db.prepare(`
          UPDATE exchange_rate
          SET from_currency_code = 'EUR'
          WHERE from_currency_code = 'GBP' and to_currency_code = 'USD' and rate_date = ?
        `).run(rateDate);
      }, 'Should not allow modification of currency codes');

      // Try to modify rate date - should fail
      t.assert.throws(function () {
        fixture.db.prepare(`
          UPDATE exchange_rate
          SET rate_date = ?
          WHERE from_currency_code = 'GBP' and to_currency_code = 'USD' and rate_date = ?
        `).run(rateDate + 3600, rateDate);
      }, 'Should not allow modification of rate date');

      // Should allow modification of rate value and source
      const updateResult = fixture.db.prepare(`
        UPDATE exchange_rate
        SET rate = 1.2600, source = 'Updated Manual Entry'
        WHERE from_currency_code = 'GBP' and to_currency_code = 'USD' and rate_date = ?
      `).run(rateDate);

      t.assert.equal(updateResult.changes, 1, 'Should allow rate and source updates');
    });

    fixture.cleanup();
  });

  await t.test('FX Accounting Principles Validation', async function (t) {
    const fixture = new ForeignExchangeTestFixture('fx_accounting_principles_validation');
    await fixture.setupWithInitialCapital();

    await t.test('should maintain balance sheet equality with FX transactions', function () {
      // Validate accounting equation using fixture utility
      t.assert.equal(fixture.validateFxAccountingEquation(), true,
        'Assets must equal Liabilities + Equity even with FX transactions');
    });

    await t.test('should properly handle FX gain/loss recognition', function () {
      // Verify FX gain/loss accounts exist and are properly configured
      const fxAccounts = fixture.db.prepare(`
        SELECT code, name, account_type_name FROM account
        WHERE code IN (71000, 71100, 71200, 71300)
        ORDER BY code
      `).all();

      t.assert.equal(fxAccounts.length, 4, 'Should have all FX gain/loss accounts');

      const realizedGain = fxAccounts.find(a => a.code === 71000) ?? {};
      t.assert.equal(realizedGain.account_type_name, 'revenue', 'Realized FX Gain should be revenue');

      const realizedLoss = fxAccounts.find(a => a.code === 71100) ?? {};
      t.assert.equal(realizedLoss.account_type_name, 'expense', 'Realized FX Loss should be expense');

      const unrealizedGain = fxAccounts.find(a => a.code === 71200) ?? {};
      t.assert.equal(unrealizedGain.account_type_name, 'revenue', 'Unrealized FX Gain should be revenue');

      const unrealizedLoss = fxAccounts.find(a => a.code === 71300) ?? {};
      t.assert.equal(unrealizedLoss.account_type_name, 'expense', 'Unrealized FX Loss should be expense');
    });

    await t.test('should validate multi-currency trial balance integrity', function () {
      // Simple balanced entry to test trial balance
      fixture.createAndPostJournalEntry('Test entry for trial balance', [
        { accountCode: 10300, debit: 25000, credit: 0 }, // Inventory
        { accountCode: 10100, debit: 0, credit: 25000 }, // Cash
      ]);

      // Validate trial balance using fixture utility
      t.assert.equal(fixture.validateTrialBalance(), true,
        'Multi-currency trial balance must balance in functional currency');
    });

    await t.test('should validate currency consistency in transactions', function () {
      // Create a foreign currency transaction to test consistency
      fixture.createForeignCurrencyAccount(11000, 'Test EUR Account', 'asset', 'EUR');

      // EUR transaction at rate 1.1050 to USD: EUR 50,000 = USD 55,250
      const entryRef = fixture.createForeignCurrencyTransaction(
        'Foreign currency transaction test',
        [
          { accountCode: 10100, debit: 0, credit: 0, foreignCurrencyAmount: 50000 }, // Cash USD (debit)
          { accountCode: 40100, debit: 0, credit: 0, foreignCurrencyAmount: -50000 }, // Sales Revenue (credit)
        ],
        'EUR',
        1.1050,
      );

      // Test that foreign currency amounts match exchange rate calculations
      const entry = fixture.db.prepare(`
        SELECT * FROM journal_entry_summary
        WHERE ref = ?
        ORDER BY line_order
      `).all(entryRef);

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

    await t.test('should prevent inconsistent currency assignments', function () {
      // Try to create account with invalid currency
      t.assert.throws(function () {
        fixture.db.prepare(`
          INSERT INTO account (code, name, account_type_name, currency_code)
          VALUES (10199, 'Invalid Currency Account', 'asset', 'XXX')
        `).run();
      }, 'Should reject accounts with invalid currency codes');
    });

    await t.test('should validate FX rate reasonableness', function () {
      // Check that existing sample rates are reasonable
      const sampleRates = fixture.db.prepare(`
        SELECT from_currency_code, to_currency_code, rate
        FROM exchange_rate
        WHERE source = 'Manual Entry'
        ORDER BY from_currency_code
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
});

await test('FX Revaluation Automation', async function (t) {
  await t.test('Automatic Journal Entry Creation', async function (t) {
    const fixture = new ForeignExchangeTestFixture('fx_revaluation_automation');
    await fixture.setup();

    await t.test('should create journal entries for unrealized gains', function () {
      // Create FX revaluation run with unrealized gain using fixture utility
      const revalRunId = fixture.createFxRevaluationRun(1704067200, 15000, 'Monthly revaluation - gain');

      // Verify journal entry was created automatically
      const fxEntry = fixture.db.prepare(`
        SELECT * FROM journal_entry
        WHERE note LIKE '%Foreign Exchange Revaluation%'
      `)?.get() ?? {};
      t.assert.equal(!!fxEntry, true, 'FX revaluation journal entry should be created');
      t.assert.equal(!!fxEntry.post_time, true, 'FX entry should be posted automatically');

      // Verify journal entry lines for gain
      const fxLines = fixture.db.prepare(`
        SELECT * FROM journal_entry_line
        WHERE journal_entry_ref = ?
        ORDER BY line_order
      `).all(fxEntry.ref);

      t.assert.equal(fxLines.length, 2, 'Should have 2 journal entry lines');
      t.assert.equal(fxLines[0].account_code, 11500, 'First line should be FX asset account');
      t.assert.equal(fxLines[0].db, 15000, 'Should debit FX asset for gain');
      t.assert.equal(fxLines[1].account_code, 71200, 'Second line should be FX gain account');
      t.assert.equal(fxLines[1].cr, 15000, 'Should credit FX gain');

      // Verify link back to revaluation run
      const revaluationRun = fixture.db.prepare(`
        SELECT journal_entry_ref FROM fx_revaluation_run WHERE id = ?
      `)?.get(revalRunId) ?? {};
      t.assert.equal(revaluationRun.journal_entry_ref, fxEntry.ref, 'Should link back to journal entry');
    });

    await t.test('should create journal entries for unrealized losses', async function () {
      const fixture = new ForeignExchangeTestFixture('fx_revaluation_losses');
      await fixture.setup();

      // Create FX revaluation run with unrealized loss using fixture utility
      fixture.createFxRevaluationRun(1704067200, -8000, 'Monthly revaluation - loss');

      // Verify journal entry was created automatically
      const fxEntry = fixture.db.prepare(`
        SELECT * FROM journal_entry
        WHERE note LIKE '%Foreign Exchange Revaluation%'
      `)?.get() ?? {};
      t.assert.equal(!!fxEntry, true, 'FX revaluation journal entry should be created');
      t.assert.equal(!!fxEntry.post_time, true, 'FX entry should be posted automatically');

      // Verify journal entry lines for loss
      const fxLines = fixture.db.prepare(`
        SELECT * FROM journal_entry_line
        WHERE journal_entry_ref = ?
        ORDER BY line_order
      `).all(fxEntry.ref);

      t.assert.equal(fxLines.length, 2, 'Should have 2 journal entry lines');
      t.assert.equal(fxLines[0].account_code, 71300, 'First line should be FX loss account');
      t.assert.equal(fxLines[0].db, 8000, 'Should debit FX loss');
      t.assert.equal(fxLines[1].account_code, 21500, 'Second line should be FX liability account');
      t.assert.equal(fxLines[1].cr, 8000, 'Should credit FX liability for loss');

      fixture.cleanup();
    });

    await t.test('should not create journal entry for zero amount', async function () {
      const fixture = new ForeignExchangeTestFixture('fx_revaluation_zero');
      await fixture.setup();

      // Create FX revaluation run with zero gain/loss using fixture utility
      fixture.createFxRevaluationRun(1704067200, 0, 'Monthly revaluation - no change');

      // Verify no journal entry was created
      const fxEntry = fixture.db.prepare(`
        SELECT * FROM journal_entry
        WHERE note LIKE '%Foreign Exchange Revaluation%'
      `)?.get();
      t.assert.equal(fxEntry, undefined, 'No journal entry should be created for zero revaluation');

      fixture.cleanup();
    });

    await t.test('should handle multiple revaluations correctly', async function () {
      const fixture = new ForeignExchangeTestFixture('fx_revaluation_multiple');
      await fixture.setup();

      // Create multiple FX revaluation runs using fixture utilities
      fixture.createFxRevaluationRun(1704067200, 8000, 'Week 1 revaluation');
      fixture.createFxRevaluationRun(1704672000, -5000, 'Week 2 revaluation');

      // Verify both journal entries were created
      const fxEntries = fixture.db.prepare(`
        SELECT * FROM journal_entry
        WHERE note LIKE '%Foreign Exchange Revaluation%'
        ORDER BY transaction_time
      `).all();

      t.assert.equal(fxEntries.length, 2, 'Should create journal entries for both revaluations');
      t.assert.equal(fxEntries[0].transaction_time, 1704067200, 'First entry should be for week 1');
      t.assert.equal(fxEntries[1].transaction_time, 1704672000, 'Second entry should be for week 2');

      // Verify first revaluation (gain)
      const week1Lines = fixture.db.prepare(`
        SELECT * FROM journal_entry_line
        WHERE journal_entry_ref = ?
      `).all(fxEntries[0].ref);
      t.assert.equal(week1Lines.length, 2, 'Week 1 should have 2 lines');

      // Verify second revaluation (loss)
      const week2Lines = fixture.db.prepare(`
        SELECT * FROM journal_entry_line
        WHERE journal_entry_ref = ?
      `).all(fxEntries[1].ref);
      t.assert.equal(week2Lines.length, 2, 'Week 2 should have 2 lines');

      fixture.cleanup();
    });

    fixture.cleanup();
  });
});
