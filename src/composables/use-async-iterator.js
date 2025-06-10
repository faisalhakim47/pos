// @ts-check

import { reactive, ref } from 'vue';

/**
 * @template T
 * @template P
 * @typedef {object} UseAsyncIteratorState
 * @property {boolean} ready
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
  const ready = ref(true);
  const data = reactive({
    get ready() {
      return ready.value;
    },
    state: undefined,
    error: undefined,
    /**  @param {Array<P>} args */
    async run(...args) {
      if (!ready.value) {
        throw new Error('useAsyncIterator only supports one active iterator at a time');
      }
      try {
        ready.value = false;
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
      finally {
        ready.value = true;
      }
    },
  });
  return data;
}
