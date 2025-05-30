// @ts-check

import { test } from 'node:test';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert';

import { DatabaseSync } from 'node:sqlite';

const __dirname = new URL('.', import.meta.url).pathname;

await test('Accounting Schema', async function (t) {
  const schemaFilePath = join(__dirname, 'accounting.sql');
  const schemaFileContent = await readFile(schemaFilePath, { encoding: 'utf8' });
  const db = new DatabaseSync(':memory:');

  await t.test('Migration', async function () {
    db.exec(schemaFileContent);
  });

  await t.test('Tables exist', async function () {
    const tables = db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\'').all().map(r => r.name);
    for (const table of [
      'account_type', 'account', 'journal_entry', 'journal_entry_line',
      'fiscal_year_config', 'fiscal_year', 'fiscal_period_report', 'fiscal_period_balance']) {
      assert(tables.includes(table), `Table ${table} should exist`);
    }
  });

  await t.test('Primary data inserted', async function () {
    const accountTypes = db.prepare('SELECT * FROM account_type').all();
    assert(accountTypes.length >= 7, 'Should have at least 7 account types');
    const accounts = db.prepare('SELECT * FROM account').all();
    assert(accounts.length >= 10, 'Should have at least 10 accounts');
    const fyConfig = db.prepare('SELECT * FROM fiscal_year_config').get();
    assert(fyConfig, 'Fiscal year config should exist');
  });

  await t.test('Account type constraint', async function () {
    assert.throws(() => {
      db.prepare('INSERT INTO account (code, name, account_type_name, balance) VALUES (?, ?, ?, ?)')
        .run(9999, 'Invalid', 'NotAType', 0);
    }, /account type must be one of the predefined account types/);
  });

  await t.test('Cannot use parent account in journal_entry_line', async function () {
    db.prepare('INSERT INTO journal_entry (ref, transaction_time) VALUES (?, ?)').run(1, 1);
    assert.throws(() => {
      db.prepare('INSERT INTO journal_entry_line (journal_entry_ref, line_number, account_code, debit, credit) VALUES (?, ?, ?, ?, ?)')
        .run(1, 0, 1000, 100, 0); // 1000 is a parent account (has children)
    }, /cannot use parent account, please use specific account/);
  });

  await t.test('Cannot unpost journal entry', async function () {
    db.prepare('INSERT INTO journal_entry (ref, transaction_time) VALUES (?, ?)').run(2, 2);
    db.prepare('INSERT INTO journal_entry_line (journal_entry_ref, line_number, account_code, debit, credit) VALUES (?, ?, ?, ?, ?)')
      .run(2, 0, 1010, 100, 0);
    db.prepare('INSERT INTO journal_entry_line (journal_entry_ref, line_number, account_code, debit, credit) VALUES (?, ?, ?, ?, ?)')
      .run(2, 1, 3010, 0, 100);
    db.prepare('UPDATE journal_entry SET post_time = ? WHERE ref = ?').run(3, 2);
    assert.throws(() => {
      db.prepare('UPDATE journal_entry SET post_time = NULL WHERE ref = ?').run(2);
    }, /cannot unpost journal entry after journal entry is posted/);
  });

  await t.test('Debit and credit must balance', async function () {
    db.prepare('INSERT INTO journal_entry (ref, transaction_time) VALUES (?, ?)').run(3, 3);
    db.prepare('INSERT INTO journal_entry_line (journal_entry_ref, line_number, account_code, debit, credit) VALUES (?, ?, ?, ?, ?)')
      .run(3, 0, 1010, 100, 0);
    assert.throws(() => {
      db.prepare('UPDATE journal_entry SET post_time = ? WHERE ref = ?').run(4, 3);
    }, /debit and credit must balance/);
  });

  await t.test('Posting journal entry updates account balance', async function () {
    db.prepare('INSERT INTO journal_entry (ref, transaction_time) VALUES (?, ?)').run(4, 4);
    db.prepare('INSERT INTO journal_entry_line (journal_entry_ref, line_number, account_code, debit, credit) VALUES (?, ?, ?, ?, ?)')
      .run(4, 0, 1010, 200, 0);
    db.prepare('INSERT INTO journal_entry_line (journal_entry_ref, line_number, account_code, debit, credit) VALUES (?, ?, ?, ?, ?)')
      .run(4, 1, 3010, 0, 200);
    db.prepare('UPDATE journal_entry SET post_time = ? WHERE ref = ?').run(5, 4);
    const cash = db.prepare('SELECT balance FROM account WHERE code = ?').get(1010).balance;
    const equity = db.prepare('SELECT balance FROM account WHERE code = ?').get(3010).balance;
    assert.strictEqual(cash, 200, 'Cash account should be 200');
    assert.strictEqual(equity, -200, 'Owner Equity should be -200');
  });

  await t.test('Fiscal year config validation', async function () {
    assert.throws(() => {
      db.prepare('INSERT INTO fiscal_year_config (id, revenue_account_code, contra_revenue_account_code, expense_account_code, income_summary_account_code, dividend_account_code, retained_earnings_account_code) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(2, 1010, 4200, 5000, 3030, 3040, 3020); // 1010 is not a parent account
    }, /cannot use specific revenue account, please use parent account/);
  });

  await t.test('Fiscal year insert validation', async function () {
    db.prepare('INSERT INTO fiscal_year (begin_time, end_time) VALUES (?, ?)').run(0, 100);
    assert.throws(() => {
      db.prepare('INSERT INTO fiscal_year (begin_time, end_time) VALUES (?, ?)').run(50, 200);
    }, /begin_time must be the same as last fiscal year end_time/);
  });
});
