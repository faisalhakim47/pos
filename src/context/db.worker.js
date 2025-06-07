// @ts-check

import initSqlJs from 'sql.js';
import sqlJsWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

import { assertPropertyArray, assertPropertyExists, assertPropertyNumber, assertPropertyString } from '@/src/tools/assertion.js';
import { crc32 } from '@/src/tools/crc32.js';

/** @typedef {import('sql.js').Database} Database */

const worker = self;

if (!(worker instanceof WorkerGlobalScope)) {
  throw new Error('This script must be run in a Web Worker context.');
}

const sqlite3Promise = initSqlJs({
  print(message) {
    console.log('SQLite3 Print', message);
  },
  printErr(message) {
    console.error('SQLite3 PrintErr', message);
  },
  locateFile() {
    return sqlJsWasmUrl;
  },
});

let db = /** @type {Database} */ (null);

worker.addEventListener('message', async function (ev) {
  const data = /** @type {unknown} */ (ev.data);
  // deserialize ArrayBuffer into sqlite3 Database
  if (data instanceof ArrayBuffer) {
    const reqId = crc32(data);
    try {
      const sqlite3 = await sqlite3Promise;
      if (db !== null) {
        throw new Error('Database already initialized. Close it before opening a new one.');
      }
      db = new sqlite3.Database(new Uint8Array(data));
      worker.postMessage({
        id: reqId,
        result: {
          isOpen: true,
          message: 'Database initialized successfully.',
        },
      });
    }
    catch (error) {
      worker.postMessage({
        id: reqId,
        error: {
          message: error.message,
        },
      });
      /** debug */ throw error;
    }
  }
  else {
    assertPropertyExists(data, 'id');
    assertPropertyNumber(data, 'id');
    assertPropertyExists(data, 'method');
    assertPropertyString(data, 'method');
    if (data.method === 'info') {
      worker.postMessage({
        id: data.id,
        result: {
          isOpen: db !== null,
        },
      });
    }
    else if (data.method === 'exec') {
      try {
        if (db === null) {
          throw new Error('Database not initialized. Call "open" method first.');
        }
        assertPropertyExists(data, 'params');
        assertPropertyArray(data, 'params');
        assertPropertyExists(data.params, 0);
        assertPropertyString(data.params, 0);
        assertPropertyExists(data.params, 1);
        assertPropertyArray(data.params, 1);
        const result = db.exec(data.params[0], data.params[1].map(function (value) {
          return (
            typeof value === 'string'
            || typeof value === 'number'
          ) ? value : null;
        }));
        worker.postMessage({
          id: data.id,
          result,
        });
      }
      catch (error) {
        worker.postMessage({
          id: data.id,
          error: {
            message: error.message,
            stack: error.stack,
          },
        });
        /** debug */ throw error;
      }
    }
    else {
      throw new Error(`Unsupported method: ${JSON.stringify(data)}`);
    }
  }
});

worker.addEventListener('error', function (ev) {
  console.error('General Worker Error:', ev);
});
