// @ts-check

import { inject, reactive } from 'vue';

/** @template T @typedef {import('vue').InjectionKey<T>} InjectionKey */
/** @template T @typedef {import('vue').Plugin<T>} Plugin */
/** @template T @typedef {import('vue').Ref<T>} Ref */

/**
 * @typedef {object} ServiceWorkerContext
 * @property {boolean} isReady
 */

const serviceWorkerKey = /** @type {InjectionKey<ServiceWorkerContext>} */ (Symbol());

export const serviceWorkerPlugin = /** @type {Plugin<unknown>} */ ({
  install(app) {
    const state = reactive(/** @type {ServiceWorkerContext} */ ({
      isReady: false,
    }));

    app.provide(serviceWorkerKey, state);
  },
});

export function useServiceWorker() {
  const serviceWorkerContext = inject(serviceWorkerKey);

  if (!serviceWorkerContext) {
    throw new Error('useServiceWorker requires ServiceWorkerPlugin to be installed');
  }

  return serviceWorkerContext;
}
