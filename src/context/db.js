// @ts-check

import { inject, reactive } from 'vue';

import dbWorkerUrl from '@/src/context/db.worker.js?url';
import baseDbUrl from '@/src/assets/pos.db?url';
import { assertPropertyExists, assertPropertyNumber } from '@/src/tools/assertion.js';
import { crc32 } from '@/src/tools/crc32.js';

/** @typedef {import('sql.js').QueryExecResult} QueryExecResult */

/** @template T @typedef {import('vue').InjectionKey<T>} InjectionKey */
/** @template T @typedef {import('vue').Plugin<T>} Plugin */
/** @template T @typedef {import('vue').Ref<T>} Ref */

/**
 * @typedef {object} DbContext
 * @property {boolean} isOpen
 * @property {() => Promise<unknown>} initNewDb
 * @property {(strings: TemplateStringsArray, ...values: Array<unknown>) => Promise<Array<QueryExecResult>>} sql
 */

export const dbContextKey = /** @type {InjectionKey<DbContext>} */ (Symbol());

/**
 * @type {Plugin<unknown>}
 */
export const db = {
  install(app) {
    const rpc = createRpcWorkerClient();
    const dbContext = /** @type {DbContext} */ (reactive({
      isOpen: false,
      async initNewDb() {
        const baseDbResp = await fetch(baseDbUrl);
        if (!baseDbResp.ok) {
          throw new Error(`Failed to fetch base database: ${baseDbResp.statusText}`);
        }
        const baseDbBuffer = await baseDbResp.arrayBuffer();
        await rpc.loadSqliteBuffer(baseDbBuffer);
        dbContext.isOpen = true;
      },
      async sql(strings, ...values) {
        return await rpc.call('exec', [
          strings.join('?'),
          values,
        ]);
      },
    }));
    app.provide(dbContextKey, dbContext);
  },
};

export function useDb() {
  const db = inject(dbContextKey);
  if (!db) {
    throw new Error('Database context not found. Ensure that the db plugin is installed.');
  }
  return db;
}

function createRpcWorkerClient() {
  const server = new Worker(dbWorkerUrl, {
    type: 'module',
  });
  let reqIdInc = 0;
  /** @type {Map<Number, PromiseWithResolvers<unknown>>} */
  const reqQueueMap = new Map();
  server.addEventListener('message', function (ev) {
    const data = /** @type {unknown} */ (ev.data);
    assertPropertyExists(data, 'id');
    assertPropertyNumber(data, 'id');
    const resolvers = reqQueueMap.get(data.id);
    if (!resolvers) {
      throw new Error(`No resolvers found for request ID ${data.id}.`);
    }
    if ('result' in data) {
      assertPropertyExists(data, 'result');
      resolvers.resolve(data.result);
      reqQueueMap.delete(data.id);
    }
    else if ('error' in data) {
      assertPropertyExists(data, 'error');
      assertPropertyExists(data.error, 'message');
      resolvers.reject(new Error(`Error from worker: ${data.error.message}`));
      reqQueueMap.delete(data.id);
    }
    else {
      throw new Error(`Unexpected message from worker: ${JSON.stringify(data)}`);
    }
  });
  server.addEventListener('error', function (error) {
    console.error('Worker error:', error);
  });
  return {
    /**
     * @param {ArrayBuffer} buffer
     */
    async loadSqliteBuffer(buffer) {
      const reqId = crc32(buffer);
      if (reqQueueMap.has(reqId)) {
        return await reqQueueMap.get(reqId).promise;
      }
      /** @type {PromiseWithResolvers<unknown>} */
      const resolvers = Promise.withResolvers();
      reqQueueMap.set(reqId, resolvers);
      server.postMessage(buffer);
      return await resolvers.promise;
    },
    /**
     * @param {string} method
     * @param {Array<unknown>} [params]
     */
    async call(method, params) {
      const reqId = ++reqIdInc;
      if (reqQueueMap.has(reqId)) {
        throw new Error(`Request ID ${reqId} already exists.`);
      }
      /** @type {PromiseWithResolvers<unknown>} */
      const resolvers = Promise.withResolvers();
      reqQueueMap.set(reqId, resolvers);
      server.postMessage({
        id: reqId,
        method: method,
        params: params || [],
      });
      return await resolvers.promise;
    },
  };
}
