// @ts-check

import { isAsyncGenerator } from 'webapp/lib/data/assertion.js';

/**
 * @template T
 * @typedef {import('webapp/lib/data/data.js').DataIterable<T>} DataIterable
 */

/**
 * @template T
 * @param {...T} args
 * @returns {DataIterable<T>}
 */
export async function* anyToAsyncGenerator(...args) {
  for (const arg of args) {
    if (isAsyncGenerator(arg)) {
      for await (const value of arg) {
        // @ts-ignore
        yield value;
      }
    }
    else if (arg instanceof Promise) {
      yield await arg;
    }
    else {
      yield arg;
    }
  }
}
