// @ts-check

import { inject, reactive, watchEffect } from 'vue';
import { provide } from 'vue';

/** @template T @typedef {import('vue').InjectionKey<T>} InjectionKey */
/** @template T @typedef {import('vue').Ref<T>} Ref */

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

/** @typedef {Ref<RequestInit & { url: string }>} HttpReqOptions */

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
    response: /** @type {Response | undefined} */ (undefined),
    error: /** @type {unknown} */ (undefined),
  });

  watchEffect(async function () {
    state.isReady = false;
    state.response = undefined;
    state.error = undefined;
    const url = options.value.url.startsWith('http')
      ? new URL(options.value.url)
      : new URL(options.value.url, httpReqContext.baseUrl);
    fetch(url, options.value)
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
