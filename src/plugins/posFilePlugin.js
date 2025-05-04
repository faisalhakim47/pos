// @ts-check

/** @template T @typedef {import('vue').InjectionKey<T>} InjectionKey */
/** @template T @typedef {import('vue').Plugin<T>} Plugin */
/** @template T @typedef {import('vue').Ref<T>} Ref */

/**
 * @typedef {object} PosFileContext
 * @property {string} [uid]
 */

const posFileKey = /** @type {InjectionKey<PosFileContext>} */ (Symbol());

export const posFilePlugin = /** @type {Plugin<unknown>} */ ({
  install(app) {
    app.provide(posFileKey, {
      uid: undefined,
    });
  },
});
