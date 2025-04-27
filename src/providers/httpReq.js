// @ts-check

import { inject, reactive, watchEffect } from 'vue';
import { provide } from 'vue';

/** @template T @typedef {import('vue').InjectionKey<T>} InjectionKey */

/**
 * @typedef {object} HttpReqContext
 * @property {string} baseUrl
 */

const httpReqKey = /** @typedef {InjectionKey<HttpReqContext>} */ (Symbol());

/**
 * @param {HttpReqContext} context
 */
export function provideHttpReq(context) {
  provide(httpReqKey, context);
}

/** @typedef {RequestInit & { url: string }} HttpReqOptions */

/**
 * @param {HttpReqOptions} options
 */
export function useHttpReq(options) {
  const httpReqContext = inject(httpReqKey);

  if (!httpReqContext) {
    throw new Error('useHttpReq must be used within a provideHttpReq');
  }

  const state = reactive({
    isReady: false,
    /** @param {(input: string | URL | globalThis.Request, init?: RequestInit) => void} [initMap] */
    request(initMap) {
      fetch(options.url, {
        ...options,
        ...initMap,
      });
    },
    response: /** @type {Response | undefined} */ (undefined),
    error: /** @type {unknown} */ (undefined),
  });

  watchEffect(async function () {
    state.isReady = false;
    state.response = undefined;
    state.error = undefined;
    const url = options.url.startsWith('http')
      ? new URL(options.url)
      : new URL(options.url, httpReqContext.baseUrl);
    fetch(url, options)
      .then(function (response) {
        state.response = response;
      })
      .catch(function (error) {
        state.error = error;
      })
      .finally(function () {
        state.isReady = true;
      });
  });

  return state;
}
