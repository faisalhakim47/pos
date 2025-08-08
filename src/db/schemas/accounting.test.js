// @ts-check

import { test } from 'node:test';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

import { DatabaseSync } from 'node:sqlite';

const __dirname = new URL('.', import.meta.url).pathname;

await test('Accounting Schema', async function (t) {
  const schemaFilePath = join(__dirname, 'accounting.sql');
  const schemaFileContent = await readFile(schemaFilePath, { encoding: 'utf8' });
  const db = new DatabaseSync(':memory:');

  await t.test('Migration', async function (t) {
    t.assert.doesNotThrow(
      function () {
        db.exec(schemaFileContent);
      },
      'expect no error during migration',
    );
  });

  await t.test('Account type constraint', async function (t) {
    t.assert.throws(
      function () {
        db
          .prepare(`
          insert into account (code, name, account_type_name, balance)
          values (?, ?, ?, ?)
        `)
          .run(9999, 'Invalid', 'Invalid Account Type', 0);
      },
      function (error) {
        return error instanceof Error && error.message.includes('constraint failed');
      },
      'expect constraint error for invalid account type',
    );
  });

  await t.test('Journal entry correctly', async function (t) {
    db.exec('BEGIN');
    db.prepare(`
      insert into journal_entry (ref, transaction_time, note)
      values (?, ?, ?)
    `).run(1, 1000000000, 'Initial capital');

    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_number, account_code, debit, credit)
      values (?, ?, ?, ?, ?)
    `).run(1, 0, 1010, 100000, 0);
    db.prepare(`
      insert into journal_entry_line (journal_entry_ref, line_number, account_code, debit, credit)
      values (?, ?, ?, ?, ?)
    `).run(1, 1, 3010, 0, 100000);

    db.prepare(`
      update journal_entry set post_time = ? where ref = ?
    `).run(1000000001, 1);
    db.exec('COMMIT');

    const cash = db.prepare('select balance from account where code = ?').get(1010).balance;
    const equity = db.prepare('select balance from account where code = ?').get(3010).balance;

    t.assert.equal(cash, 100000, 'Cash account should be debited (increased) by 100000');
    t.assert.equal(equity, 100000, 'Owner Equity account should be credited (increased) by 100000');
  });

});
