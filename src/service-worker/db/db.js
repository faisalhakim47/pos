// @ts-check

import sqlite3InitModule from '@/vendor/@antonz/sqlean/dist/sqlean.js';
import sqlite3WasmUrl from '@/vendor/@antonz/sqlean/dist/sqlean.wasm?url';
import posDbSql from '@/service-worker/db/pos.sql?raw';

/** @typedef {import('@/vendor/@antonz/sqlean/dist/sqlean.js').Sqlite3Static} Sqlite3Static */

export async function createPosDb() {
  const wasmBinaryResp = await fetch(sqlite3WasmUrl);
  if (!wasmBinaryResp.ok) {
    throw new Error(`Failed to fetch wasm binary: ${wasmBinaryResp.statusText}`);
  }
  const wasmBinary = await wasmBinaryResp.arrayBuffer();
  /** @type {Sqlite3Static} */
  const sqlite3 = await sqlite3InitModule(/** @type {any} */ ({
    wasmBinary,
    print(...messeges) {
      console.log('[sqlean]', ...messeges);
    },
    printErr(...messeges) {
      console.error('[sqlean]', ...messeges);
    },
  }));
  const db = new sqlite3.oo1.DB();
  db.exec(posDbSql);
  return db;
}
