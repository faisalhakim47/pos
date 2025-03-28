// @ts-check

import { merge } from 'webapp/lib/data/operators/merge.js';

/**
 * @template T
 * @typedef {import('webapp/lib/data/data.js').DataIterable<T>} DataIterable
 */

/**
 * @template T
 * @param {DataIterable<T>} iterable
 * @param {DataIterable<unknown>} until
 * @returns {DataIterable<T>}
 */
export async function* takeUntil(iterable, until) {
  for await (const value of merge([iterable, until])) {
    if (value[0] === 1) {
      break;
    }
    // @ts-ignore
    yield value[1];
  }
}
