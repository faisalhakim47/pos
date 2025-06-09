// @ts-check

import { reactive } from 'vue';

/**
 * @template T
 * @typedef {object} UseAsyncState
 * @property {boolean} isReady
 * @property {boolean} isLoading
 * @property {T | undefined} data
 * @property {Error | undefined} error
 * @property {(...args: Array<unknown>) => void} run
 */

/**
 * @template T
 * @param {(...args: Array<unknown>) => Promise<T>} fn
 * @returns {UseAsyncState<T>}
 */
export function useAsync(fn) {
  const state = reactive({
    isReady: false,
    isLoading: false,
    data: undefined,
    error: undefined,
    /**
     * @param {...unknown} args
     */
    async run(...args) {
      try {
        state.isLoading = true;
        state.isReady = false;
        state.error = null;
        state.data = await fn(...args);
      }
      catch (err) {
        state.error = err;
      }
      finally {
        state.isLoading = false;
      }
    },
  });
  return state;
}
