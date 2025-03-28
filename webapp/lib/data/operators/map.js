// @ts-check

import { isAsyncGenerator } from 'webapp/lib/data/assertion.js';
import { takeUntil } from 'webapp/lib/data/operators/take-until.js';

/**
 * @template T
 * @typedef {import('webapp/lib/data/data.js').DataIterable<T>} DataIterable
 */

/**
 * @template TIn, TOut
 * @param {DataIterable<TIn>} iterable
 * @param {(value: TIn) => TOut|Promise<TOut>|DataIterable<TOut>} mapper
 * @returns {DataIterable<TOut>}
 */
async function* map(iterable, mapper) {
  for await (const value of iterable) {
    const mappedValue = mapper(value);
    if (isAsyncGenerator(mappedValue)) {
      yield* takeUntil(mappedValue, iterable);
    }
    else if (mappedValue instanceof Promise) {
      yield await mappedValue;
    }
    else {
      yield mappedValue;
    }
  }
}
