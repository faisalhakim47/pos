// @ts-check

import sqlite3InitModule from '@/vendor/@antonz/sqlean/dist/sqlean.js';

/** @typedef {import('@/vendor/@antonz/sqlean/dist/sqlean.js').Sqlite3Static} Sqlite3Static */

export async function createPosDb() {
  const sqlite3 = await sqlite3InitModule({
    print(...messeges) {
      console.log('[sqlean]', ...messeges);
    },
    printErr(...messeges) {
      console.error('[sqlean]', ...messeges);
    },
  });
  const migrationSqlResp = await fetch('/service-worker/db/pos.sql');
  const migrationSql = await migrationSqlResp.text();
  const db = new sqlite3.oo1.DB();
  return db;
}
