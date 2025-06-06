// @ts-check

import { inject } from 'vue';

/** @template T @typedef {import('vue').InjectionKey<T>} InjectionKey */
/** @template T @typedef {import('vue').Plugin<T>} Plugin */
/** @template T @typedef {import('vue').Ref<T>} Ref */

/**
 * @typedef {object} DbContext
 * @property {(strings: TemplateStringsArray, ...values: Array<unknown>) => Promise<unknown>} sql
 */

const dbContext = /** @type {InjectionKey<DbContext>} */ (Symbol());

/**
 * @type {Plugin<unknown>}
 */
export const db = {
  install(app) {
    app.provide(dbContext, {
      async sql(strings, ...values) {
        throw new Error('Database connection not implemented. This is a placeholder for future database functionality.');
      },
    });
  },
};

export function useDb() {
  const db = inject(dbContext);
  if (!db) {
    throw new Error('Database context not found. Ensure that the db plugin is installed.');
  }
  return db;
}
