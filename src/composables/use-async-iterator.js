// @ts-check

import { reactive } from 'vue';

/**
 * @template T
 * @typedef {object} UseAsyncIteratorState
 * @property {T | undefined} state
 * @property {unknown} error
 * @property {() => Promise<void>} run
 */

/**
 * @template T
 * @template R
 * @param {() => AsyncGenerator<T, R, unknown>} fn
 * @return {UseAsyncIteratorState<T | R>}
 */
export function useAsyncIterator(fn) {
  const data = reactive({
    state: undefined,
    error: undefined,
    async run() {
      try {
        data.state = undefined;
        data.error = undefined;
        for await (const value of fn()) {
          data.state = value;
        }
      }
      catch (error) {
        data.state = undefined;
        data.error = error;
      }
    },
  });
  return data;
}
