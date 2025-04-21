// @ts-check

import sqlite3InitModule from '../../vendor/@antonz/sqlean/dist/sqlean.js';

/** @typedef {import('../../vendor/@antonz/sqlean/dist/sqlean.js').Sqlite3Static} Sqlite3Static */

/**
 * @typedef {object} DbContext
 * @prop {Array<Db>} dbs
 */

export async function createDb() {
  const sqlite3 = await sqlite3InitModule({
    print(...messeges) {
      console.log('[sqlean]', ...messeges);
    },
    printErr(...messeges) {
      console.error('[sqlean]', ...messeges);
    },
  });
  const db = new Db(sqlite3);
}

class Db {
  /**
   * @param {Sqlite3Static} sqlite
   */
  constructor(sqlite) {
    this.sqlite = sqlite;
    this.db = new sqlite.oo1.DB();
  }
}
