// @ts-check

import { reactive } from 'vue';

/**
 * @template T
 * @template P
 * @typedef {object} UseAsyncIteratorState
 * @property {T | undefined} state
 * @property {unknown} error
 * @property {(...args: Array<P>) => Promise<void>} run
 */

/**
 * @template T
 * @template R
 * @template P
 * @param {(...args: Array<P>) => AsyncGenerator<T, R, unknown>} fn
 * @return {UseAsyncIteratorState<T | R, P>}
 */
export function useAsyncIterator(fn) {
  const data = reactive({
    state: undefined,
    error: undefined,
    /**  @param {Array<P>} args */
    async run(...args) {
      try {
        data.state = undefined;
        data.error = undefined;
        for await (const value of fn(...args)) {
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
