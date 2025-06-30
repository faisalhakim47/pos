// @ts-check

import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { TestFixture } from './test-fixture.js';

const __dirname = new URL('..', import.meta.url).pathname;

/**
 * Core Accounting Test Fixture
 *
 * This fixture provides a structured foundation for testing core accounting functionality.
 * It includes utilities for creating journal entries with their lines and can be extended
 * by other schema migration test fixtures.
 */
export class CoreAccountingTestFixture extends TestFixture {
  /**
   * @param {string} label
   */
  constructor(label) {
    super(label);
    this.schemaFilePath = join(__dirname, '001_core_accounting.sql');
    this.schemaFileContent = null;
    this.setupDb = null;
    this.dbPath = null;
    this.nextJournalEntryRef = 1;
  }

  get db() {
    if (this.setupDb instanceof DatabaseSync) {
      return this.setupDb;
    }
    throw new Error('Database not initialized. Call setup() first.');
  }

  /**
   * Initializes the journal entry reference counter
   */
  initializeJournalEntryRef() {
    // Get the maximum existing ref and set the next ref accordingly
    const result = this.db.prepare('SELECT MAX(ref) as max_ref FROM journal_entry').get();
    this.nextJournalEntryRef = Number(result?.max_ref || 0) + 1;
  }

  /**
   * Sets up the database with core accounting schema
   * @returns {Promise<DatabaseSync>} The initialized database
   */
  async setup() {
    this.schemaFileContent = await readFile(this.schemaFilePath, { encoding: 'utf8' });
    const tempDir = join(tmpdir(), 'pos-sql-tests');
    await mkdir(tempDir, { recursive: true });
    this.dbPath = join(
      tempDir,
      `${this.testRunId}_core_accounting_${this.label}.db`,
    );
    this.setupDb = new DatabaseSync(this.dbPath);
    this.db.exec(this.schemaFileContent);
    this.initializeJournalEntryRef();
    return this.db;
  }

  /**
   * Sets up the database with initial capital entry
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
   * Creates a journal entry with multiple lines
   * @param {string} note - Journal entry note/description
   * @param {Array<{accountCode: number, debit: number, credit: number, foreignCurrencyAmount?: number, foreignCurrencyCode?: string, exchangeRate?: number}>} lines - Journal entry lines
   * @param {Object} options - Additional options
   * @param {string} [options.transactionCurrencyCode] - Transaction currency code
   * @param {number} [options.exchangeRateToFunctional] - Exchange rate to functional currency
   * @param {number} [options.transactionTime] - Unix timestamp for transaction
   * @returns {number} The journal entry reference number
   */
  createJournalEntry(note, lines, options = {}) {
    const ref = this.nextJournalEntryRef++;
    const {
      transactionCurrencyCode = 'USD',
      exchangeRateToFunctional = 1.0,
      transactionTime = 1000000000,
    } = options;

    this.db.exec('begin');

    try {
      // Insert journal entry header
      this.db.prepare(`
        insert into journal_entry (ref, transaction_time, note, transaction_currency_code, exchange_rate_to_functional)
        values (?, ?, ?, ?, ?)
      `).run(ref, transactionTime, note, transactionCurrencyCode, exchangeRateToFunctional);

      // Insert journal entry lines
      lines.forEach((line, index) => {
        const {
          accountCode,
          debit,
          credit,
          foreignCurrencyAmount = null,
          foreignCurrencyCode = null,
          exchangeRate = null,
        } = line;

        // Calculate functional currency amounts
        const dbFunctional = Math.round(debit * exchangeRateToFunctional);
        const crFunctional = Math.round(credit * exchangeRateToFunctional);

        this.db.prepare(`
          insert into journal_entry_line (
            journal_entry_ref, line_order, account_code, db, cr, db_functional, cr_functional,
            foreign_currency_amount, foreign_currency_code, exchange_rate
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          ref, index, accountCode, debit, credit, dbFunctional, crFunctional,
          foreignCurrencyAmount, foreignCurrencyCode, exchangeRate,
        );
      });

      this.db.exec('commit');
      return ref;
    }
    catch (error) {
      this.db.exec('rollback');
      throw error;
    }
  }

  /**
   * Creates and immediately posts a journal entry
   * @param {string} note - Journal entry note/description
   * @param {Array<{accountCode: number, debit: number, credit: number, foreignCurrencyAmount?: number, foreignCurrencyCode?: string, exchangeRate?: number}>} lines - Journal entry lines
   * @param {Object} options - Additional options
   * @returns {number} The journal entry reference number
   */
  createAndPostJournalEntry(note, lines, options = {}) {
    const ref = this.createJournalEntry(note, lines, options);
    this.postJournalEntry(ref, options.transactionTime || 1000000000);
    return ref;
  }

  /**
   * Posts a journal entry (makes it immutable)
   * @param {number} ref - Journal entry reference number
   * @param {number} [postTime] - Unix timestamp for posting (default: transaction time)
   */
  postJournalEntry(ref, postTime) {
    if (postTime === undefined) {
      const entry = this.db.prepare('SELECT transaction_time FROM journal_entry WHERE ref = ?').get(ref);
      postTime = Number(entry?.transaction_time) || 1000000000;
    }

    this.db.prepare(`
      UPDATE journal_entry SET post_time = ? WHERE ref = ?
    `).run(postTime, ref);
  }

  /**
   * Creates a simple cash sale transaction
   * @param {number} amount - Sale amount in cents
   * @param {string} note - Transaction note (default: 'Cash sale')
   * @param {Object} options - Additional options
   * @returns {number} The journal entry reference number
   */
  createCashSale(amount, note = 'Cash sale', options = {}) {
    return this.createAndPostJournalEntry(note, [
      { accountCode: 10100, debit: amount, credit: 0 }, // Cash
      { accountCode: 40100, debit: 0, credit: amount }, // Sales Revenue
    ], options);
  }

  /**
   * Creates a cash expense transaction
   * @param {number} amount - Expense amount in cents
   * @param {number} expenseAccountCode - Expense account code
   * @param {string} note - Transaction note
   * @param {Object} options - Additional options
   * @returns {number} The journal entry reference number
   */
  createCashExpense(amount, expenseAccountCode, note, options = {}) {
    return this.createAndPostJournalEntry(note, [
      { accountCode: expenseAccountCode, debit: amount, credit: 0 }, // Expense
      { accountCode: 10100, debit: 0, credit: amount },              // Cash
    ], options);
  }

  /**
   * Creates an asset purchase transaction
   * @param {number} amount - Purchase amount in cents
   * @param {number} assetAccountCode - Asset account code
   * @param {string} note - Transaction note
   * @param {Object} options - Additional options
   * @returns {number} The journal entry reference number
   */
  createAssetPurchase(amount, assetAccountCode, note, options = {}) {
    return this.createAndPostJournalEntry(note, [
      { accountCode: assetAccountCode, debit: amount, credit: 0 }, // Asset
      { accountCode: 10100, debit: 0, credit: amount },            // Cash
    ], options);
  }

  /**
   * Creates a foreign currency transaction
   * @param {string} note - Transaction note
   * @param {Array} lines - Journal entry lines
   * @param {string} foreignCurrency - Foreign currency code
   * @param {number} exchangeRate - Exchange rate to functional currency
   * @param {Object} options - Additional options
   * @returns {number} The journal entry reference number
   */
  createForeignCurrencyTransaction(note, lines, foreignCurrency, exchangeRate, options = {}) {
    const enhancedLines = lines.map(line => {
      let debit = line.debit;
      let credit = line.credit;

      // If both debit and credit are 0, calculate from foreign currency amount
      if (debit === 0 && credit === 0 && line.foreignCurrencyAmount) {
        const functionalAmount = Math.round(Math.abs(line.foreignCurrencyAmount) * exchangeRate);
        if (line.foreignCurrencyAmount > 0) {
          debit = functionalAmount;
        }
        else {
          credit = functionalAmount;
        }
      }

      return {
        ...line,
        debit: debit,
        credit: credit,
        foreignCurrencyAmount: line.foreignCurrencyAmount || (debit - credit),
        foreignCurrencyCode: foreignCurrency,
        exchangeRate: exchangeRate,
      };
    });

    return this.createAndPostJournalEntry(note, enhancedLines, {
      ...options,
      transactionCurrencyCode: foreignCurrency,
      exchangeRateToFunctional: exchangeRate,
    });
  }

  /**
   * Creates a journal entry reversal
   * @param {number} originalRef - Reference number of the journal entry to reverse
   * @returns {number|undefined} The reversal journal entry reference number
   */
  createJournalEntryReversal(originalRef) {
    // Get current max ref before the operation
    const beforeMaxRef = Number(this.db.prepare('SELECT MAX(ref) as max_ref FROM journal_entry').get()?.max_ref || 0);

    this.db.prepare('INSERT INTO journal_entry_reversal (original_ref) VALUES (?)').run(originalRef);

    // Get the new max ref after the operation
    const afterMaxRef = Number(this.db.prepare('SELECT MAX(ref) as max_ref FROM journal_entry').get()?.max_ref || 0);

    // Update our counter to ensure no conflicts
    this.nextJournalEntryRef = afterMaxRef + 1;

    // Return the ref of the newly created reversal entry
    return afterMaxRef > beforeMaxRef ? afterMaxRef : undefined;
  }

  /**
   * Creates a journal entry correction
   * @param {number} originalRef - Reference number of the journal entry to correct
   * @returns {number|undefined} The correction journal entry reference number
   */
  createJournalEntryCorrection(originalRef) {
    // Get current max ref before the operation
    const beforeMaxRef = Number(this.db.prepare('SELECT MAX(ref) as max_ref FROM journal_entry').get()?.max_ref || 0);

    this.db.prepare('INSERT INTO journal_entry_correction (original_ref) VALUES (?)').run(originalRef);

    // Get the new max ref after the operation
    const afterMaxRef = Number(this.db.prepare('SELECT MAX(ref) as max_ref FROM journal_entry').get()?.max_ref || 0);

    // Update our counter to ensure no conflicts
    this.nextJournalEntryRef = afterMaxRef + 1;

    // Return the ref of the newly created correction entry
    return afterMaxRef > beforeMaxRef ? afterMaxRef : undefined;
  }

  /**
   * Gets account balance
   * @param {number} accountCode - Account code
   * @returns {number} Account balance in functional currency
   */
  getAccountBalance(accountCode) {
    const result = this.db.prepare('SELECT balance FROM account WHERE code = ?').get(accountCode);
    return result ? Number(result.balance) : 0;
  }

  /**
   * Gets journal entry details
   * @param {number} ref - Journal entry reference number
   * @returns {Object} Journal entry with lines
   */
  getJournalEntry(ref) {
    const entry = this.db.prepare('SELECT * FROM journal_entry WHERE ref = ?').get(ref);
    if (!entry) return null;

    const lines = this.db.prepare(`
      SELECT * FROM journal_entry_line
      WHERE journal_entry_ref = ?
      ORDER BY line_order
    `).all(ref);

    return { ...entry, lines };
  }

  /**
   * Validates that all accounts balance to zero (accounting equation)
   * @returns {boolean} True if accounting equation is satisfied
   */
  validateAccountingEquation() {
    const result = this.db.prepare(`
      SELECT
        SUM(CASE WHEN at.name IN ('asset', 'contra_asset')
            THEN CASE WHEN at.name = 'asset' THEN a.balance
                      WHEN at.name = 'contra_asset' THEN -a.balance
                      ELSE 0 END
            ELSE 0 END) as total_assets,
        SUM(CASE WHEN at.name IN ('liability', 'contra_liability')
            THEN CASE WHEN at.name = 'liability' THEN a.balance
                      WHEN at.name = 'contra_liability' THEN -a.balance
                      ELSE 0 END
            ELSE 0 END) as total_liabilities,
        SUM(CASE WHEN at.name IN ('equity', 'contra_equity', 'revenue', 'contra_revenue', 'expense', 'contra_expense', 'cogs')
            THEN CASE WHEN at.name IN ('equity', 'revenue') THEN a.balance
                      WHEN at.name IN ('contra_equity', 'contra_revenue', 'expense', 'cogs') THEN -a.balance
                      WHEN at.name = 'contra_expense' THEN a.balance
                      ELSE 0 END
            ELSE 0 END) as total_equity_and_income
      FROM account a
      JOIN account_type at ON a.account_type_name = at.name
      WHERE a.balance != 0
    `).get();

    if (!result) return false;

    const assets = Number(result.total_assets) || 0;
    const liabilities = Number(result.total_liabilities) || 0;
    const equityAndIncome = Number(result.total_equity_and_income) || 0;

    // For the basic accounting equation: Assets = Liabilities + Equity (including retained earnings)
    // In a closed system: Assets = Liabilities + Equity + (Revenue - Expenses)
    return Math.abs(assets - (liabilities + equityAndIncome)) < 1; // Allow for rounding differences
  }

  /**
   * Validates trial balance (debits = credits)
   * @returns {boolean} True if trial balance is in balance
   */
  validateTrialBalance() {
    const result = this.db.prepare(`
      SELECT
        SUM(debit_balance_functional) as total_debits,
        SUM(credit_balance_functional) as total_credits
      FROM trial_balance_multicurrency
    `).get();

    if (!result) return false;

    const debits = Number(result.total_debits) || 0;
    const credits = Number(result.total_credits) || 0;

    return Math.abs(debits - credits) < 1; // Allow for rounding differences
  }

  /**
   * Sets up exchange rates for testing multi-currency scenarios
   * @param {Array<{from: string, to: string, rate: number, date?: number}>} rates - Exchange rate definitions
   */
  setupExchangeRates(rates) {
    rates.forEach(({ from, to, rate, date = 1000000000 }) => {
      this.db.prepare(`
        INSERT INTO exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source, created_time)
        VALUES (?, ?, ?, ?, 'test', ?)
      `).run(from, to, date, rate, date);
    });
  }

  /**
   * Creates a foreign currency account
   * @param {number} code - Account code
   * @param {string} name - Account name
   * @param {string} accountType - Account type name
   * @param {string} currencyCode - Currency code
   * @param {number} initialBalance - Initial balance in account currency
   * @returns {number} Account code
   */
  createForeignCurrencyAccount(code, name, accountType, currencyCode, initialBalance = 0) {
    this.db.prepare(`
      INSERT INTO account (code, name, account_type_name, currency_code, balance)
      VALUES (?, ?, ?, ?, ?)
    `).run(code, name, accountType, currencyCode, initialBalance);

    return code;
  }

  /**
   * Sets up the database with additional schema files for advanced features
   * @param {string[]} additionalSchemaFiles - Additional schema file paths
   * @returns {Promise<DatabaseSync>} The initialized database with all schemas
   */
  async setupWithAdditionalSchemas(additionalSchemaFiles = []) {
    const allSchemaFiles = [this.schemaFilePath, ...additionalSchemaFiles];

    this.schemaFileContent = null; // Reset to use multiple files
    const tempDir = join(tmpdir(), 'pos-sql-tests');
    await mkdir(tempDir, { recursive: true });
    this.dbPath = join(
      tempDir,
      `${this.testRunId}_advanced_accounting_${this.label}.db`,
    );
    this.setupDb = new DatabaseSync(this.dbPath);

    // Load all schema files in order
    for (const schemaFilePath of allSchemaFiles) {
      const schemaContent = await readFile(schemaFilePath, { encoding: 'utf8' });
      this.db.exec(schemaContent);
    }

    this.initializeJournalEntryRef();
    return this.db;
  }

  /**
   * Sets up the database with advanced features and initial data
   * @returns {Promise<DatabaseSync>} The initialized database with initial capital
   */
  async setupWithAdvancedFeaturesAndInitialData() {
    const additionalSchemaFiles = [
      join(__dirname, '002_foreign_exchange.sql'),
      join(__dirname, '003_asset_register.sql'),
      join(__dirname, '099_finance_reporting.sql'),
    ];

    await this.setupWithAdditionalSchemas(additionalSchemaFiles);

    // Create initial capital entry
    this.createAndPostJournalEntry('Initial capital', [
      { accountCode: 10100, debit: 100000, credit: 0 }, // Cash $1000
      { accountCode: 30100, debit: 0, credit: 100000 }, // Common Stock $1000
    ]);

    return this.db;
  }

  /**
   * Creates a comprehensive business scenario with multiple transactions
   * @param {Object} options - Configuration options
   * @returns {Object} Summary of created transactions
   */
  createBusinessScenario(options = {}) {
    const {
      initialCapital = 100000,
      sales = [{ amount: 50000, note: 'Sales transaction' }],
      expenses = [{ amount: 30000, accountCode: 60100, note: 'Salary expense' }],
      assetPurchases = [{ amount: 25000, accountCode: 12400, note: 'Equipment purchase' }],
    } = options;

    const transactions = [];

    // Initial capital
    if (initialCapital > 0) {
      const ref = this.createAndPostJournalEntry('Initial capital', [
        { accountCode: 10100, debit: initialCapital, credit: 0 },
        { accountCode: 30100, debit: 0, credit: initialCapital },
      ]);
      transactions.push({ type: 'capital', ref, amount: initialCapital });
    }

    // Sales transactions
    sales.forEach(sale => {
      const ref = this.createCashSale(sale.amount, sale.note);
      transactions.push({ type: 'sale', ref, amount: sale.amount });
    });

    // Expense transactions
    expenses.forEach(expense => {
      const ref = this.createCashExpense(expense.amount, expense.accountCode, expense.note);
      transactions.push({ type: 'expense', ref, amount: expense.amount });
    });

    // Asset purchases
    assetPurchases.forEach(purchase => {
      const ref = this.createAssetPurchase(purchase.amount, purchase.accountCode, purchase.note);
      transactions.push({ type: 'asset', ref, amount: purchase.amount });
    });

    return {
      transactions,
      totalTransactions: transactions.length,
      totalSales: sales.reduce((sum, s) => sum + s.amount, 0),
      totalExpenses: expenses.reduce((sum, e) => sum + e.amount, 0),
      totalAssetPurchases: assetPurchases.reduce((sum, a) => sum + a.amount, 0),
    };
  }

  /**
   * Validates complete accounting integrity
   * @returns {Object} Validation results
   */
  validateAccountingIntegrity() {
    return {
      accountingEquation: this.validateAccountingEquation(),
      trialBalance: this.validateTrialBalance(),
      cashBalance: this.getAccountBalance(10100),
      totalJournalEntries: this.db.prepare('SELECT COUNT(*) as count FROM journal_entry WHERE post_time IS NOT NULL').get()?.count || 0,
    };
  }

  /**
   * Gets summarized account balances by type
   * @returns {Object} Account balances grouped by type
   */
  getAccountBalancesByType() {
    const balances = this.db.prepare(`
      SELECT
        at.name as account_type,
        SUM(a.balance) as total_balance
      FROM account a
      JOIN account_type at ON a.account_type_name = at.name
      WHERE a.balance != 0
      GROUP BY at.name
      ORDER BY at.name
    `).all();

    return balances.reduce((acc, row) => {
      const accountType = String(row.account_type);
      const balance = Number(row.total_balance);

      // For assets and expenses, positive balances are normal
      // For liabilities, equity, and revenue, positive balances are normal
      // The balance field in the database stores the actual balance according to normal balance convention
      acc[accountType] = balance > 0 ? balance : 0;
      return acc;
    }, {});
  }

  /**
   * Cleanup database resources
   */
  cleanup() {
    if (this.setupDb) {
      this.setupDb.close();
      this.setupDb = null;
    }
  }
}
