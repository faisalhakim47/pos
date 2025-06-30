// @ts-check

import { join } from 'node:path';

import { CoreAccountingTestFixture } from './core-accounting-test-fixture.js';

/** @typedef {import('node:sqlite').DatabaseSync} DatabaseSync */

const __dirname = new URL('.', import.meta.url).pathname;

/**
 * Foreign Exchange Test Fixture
 *
 * Extends CoreAccountingTestFixture to provide foreign exchange specific testing utilities.
 * Includes functionality for multi-currency transactions, exchange rate management,
 * and FX revaluation testing.
 */
export class ForeignExchangeTestFixture extends CoreAccountingTestFixture {
  /**
   * @param {string} label - Label for the test case (should be unique per test case)
   */
  constructor(label) {
    super(label);
    this.fxSchemaPath = join(__dirname, '../002_foreign_exchange.sql');
  }

  /**
   * Sets up the database with core accounting and foreign exchange schemas
   * @returns {Promise<DatabaseSync>} The initialized database
   */
  async setup() {
    await this.setupWithAdditionalSchemas([this.fxSchemaPath]);
    return this.db;
  }

  /**
   * Sets up the database with initial capital and common FX test data
   * @param {number} amount - Initial capital amount in cents (default: 100000 = $1000)
   * @returns {Promise<DatabaseSync>} The initialized database
   */
  async setupWithInitialCapital(amount = 100000) {
    await this.setup();
    this.createAndPostJournalEntry('Initial capital', [
      { accountCode: 10100, debit: amount, credit: 0 }, // Cash
      { accountCode: 30100, debit: 0, credit: amount }, // Common Stock
    ]);
    return this.db;
  }

  /**
   * Creates a foreign currency account
   * @param {number} code - Account code
   * @param {string} name - Account name
   * @param {string} accountType - Account type name
   * @param {string} currencyCode - Currency code
   * @returns {number} Account code
   */
  createForeignCurrencyAccount(code, name, accountType, currencyCode) {
    this.db.prepare(`
      INSERT INTO account (code, name, account_type_name, currency_code)
      VALUES (?, ?, ?, ?)
    `).run(code, name, accountType, currencyCode);
    return code;
  }

  /**
   * Creates a foreign currency journal entry with explicit functional amounts
   * @param {string} note - Transaction note
   * @param {string} currencyCode - Foreign currency code
   * @param {number} exchangeRate - Exchange rate to functional currency
   * @returns {number} The journal entry reference number
   */
  createForeignCurrencyEntry(note, currencyCode = 'EUR', exchangeRate = 1.1050) {
    const ref = this.nextJournalEntryRef++;
    this.db.prepare(`
      INSERT INTO journal_entry (ref, transaction_time, note, transaction_currency_code, exchange_rate_to_functional)
      VALUES (?, ?, ?, ?, ?)
    `).run(ref, Math.floor(Date.now() / 1000), note, currencyCode, exchangeRate);

    return ref;
  }

  /**
   * Add journal entry line with foreign currency amounts (manual approach)
   * @param {number} entryRef - Journal entry reference
   * @param {number} accountCode - Account code
   * @param {number} dbAmount - Debit amount in original currency
   * @param {number} crAmount - Credit amount in original currency
   * @param {number} functionalDbAmount - Debit amount in functional currency
   * @param {number} functionalCrAmount - Credit amount in functional currency
   * @param {number} foreignAmount - Foreign currency amount
   * @param {string} foreignCurrency - Foreign currency code
   * @param {number} exchangeRate - Exchange rate
   */
  addForeignCurrencyLine(entryRef, accountCode, dbAmount, crAmount, functionalDbAmount, functionalCrAmount, foreignAmount, foreignCurrency, exchangeRate) {
    this.db.prepare(`
      INSERT INTO journal_entry_line_auto_number (
        journal_entry_ref, account_code, db, cr,
        db_functional, cr_functional,
        foreign_currency_amount, foreign_currency_code, exchange_rate
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entryRef, accountCode, dbAmount, crAmount,
      functionalDbAmount, functionalCrAmount,
      foreignAmount, foreignCurrency, exchangeRate,
    );
  }

  /**
   * Post a journal entry
   * @param {number} ref - Journal entry reference
   */
  postEntry(ref) {
    this.db.prepare(`
      UPDATE journal_entry
      SET post_time = unixepoch()
      WHERE ref = ?
    `).run(ref);
  }

  /**
   * Creates a foreign currency transaction with proper exchange rate handling
   * @param {string} note - Transaction note
   * @param {Array} lines - Journal entry lines with foreign currency details
   * @param {string} foreignCurrency - Foreign currency code
   * @param {number} exchangeRate - Exchange rate to functional currency
   * @returns {number} The journal entry reference number
   */
  createForeignCurrencyTransaction(note, lines, foreignCurrency, exchangeRate) {
    return super.createForeignCurrencyTransaction(note, lines, foreignCurrency, exchangeRate);
  }

  /**
   * Creates and posts an FX revaluation run with automatic journal entry creation
   * @param {number} revaluationDate - Unix timestamp for revaluation date
   * @param {number} totalGainLoss - Total unrealized gain/loss amount in functional currency cents
   * @param {string} notes - Revaluation notes
   * @returns {number} The FX revaluation run ID
   */
  createFxRevaluationRun(revaluationDate, totalGainLoss, notes = 'Test FX revaluation') {
    const result = this.db.prepare(`
      INSERT INTO fx_revaluation_run (
        revaluation_date, functional_currency_code, total_unrealized_gain_loss,
        created_time, notes
      ) VALUES (?, 'USD', ?, ?, ?)
    `).run(revaluationDate, totalGainLoss, revaluationDate, notes);

    return Number(result.lastInsertRowid);
  }

  /**
   * Adds an FX revaluation detail record
   * @param {number} runId - FX revaluation run ID
   * @param {number} accountCode - Account code
   * @param {string} originalCurrency - Original currency code
   * @param {number} balance - Balance in original currency
   * @param {number} oldRate - Old exchange rate
   * @param {number} newRate - New exchange rate
   * @returns {number} The FX revaluation detail ID
   */
  addFxRevaluationDetail(runId, accountCode, originalCurrency, balance, oldRate, newRate) {
    const oldFunctional = Math.round(balance * oldRate);
    const newFunctional = Math.round(balance * newRate);
    const gainLoss = newFunctional - oldFunctional;

    const result = this.db.prepare(`
      INSERT INTO fx_revaluation_detail (
        fx_revaluation_run_id, account_code, original_currency_code,
        balance_original_currency, old_exchange_rate, new_exchange_rate,
        old_functional_balance, new_functional_balance, unrealized_gain_loss
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(runId, accountCode, originalCurrency, balance, oldRate, newRate,
      oldFunctional, newFunctional, gainLoss);

    return Number(result.lastInsertRowid);
  }

  /**
   * Gets the latest exchange rate for a currency pair
   * @param {string} fromCurrency - From currency code
   * @param {string} toCurrency - To currency code
   * @returns {number|null} Latest exchange rate or null if not found
   */
  getLatestExchangeRate(fromCurrency, toCurrency) {
    const result = this.db.prepare(`
      SELECT rate FROM latest_exchange_rate
      WHERE from_currency_code = ? AND to_currency_code = ?
    `).get(fromCurrency, toCurrency);

    return result ? Number(result.rate) : null;
  }

  /**
   * Gets FX exposure summary for all foreign currency accounts
   * @returns {Array} FX exposure data by currency
   */
  getFxExposure() {
    return this.db.prepare(`
      SELECT currency_code, account_count, total_balance_original,
             total_balance_functional, current_exchange_rate
      FROM fx_exposure_summary
      ORDER BY currency_code
    `).all();
  }

  /**
   * Gets accounts that need FX revaluation
   * @returns {Array} Accounts requiring revaluation
   */
  getFxRevaluationCandidates() {
    return this.db.prepare(`
      SELECT code, name, currency_code, balance_original_currency,
             current_functional_balance, current_exchange_rate
      FROM fx_revaluation_candidates
      ORDER BY code
    `).all();
  }

  /**
   * Validates FX accounting principles (balance sheet equation with FX adjustments)
   * @returns {boolean} True if FX accounting is balanced
   */
  validateFxAccountingEquation() {
    return this.validateAccountingEquation() && this.validateTrialBalance();
  }
}
