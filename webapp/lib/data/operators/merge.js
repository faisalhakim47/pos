// @ts-check

/**
 * @template T
 * @typedef {import('webapp/lib/data/data.js').DataIterable<T>} DataIterable
 */

/**
 * @template T
 * @typedef {import('webapp/lib/data/data.js').TypeOfDataIterable<T>} TypeOfDataIterable
 */

/**
 * @template {Array<DataIterable<unknown>>} T
 * @param {T} iterables
 * @returns {DataIterable<[number, TypeOfDataIterable<T[number]>]>}
 */
export async function* merge(iterables) {
  /**
   * @template T
   * @param {DataIterable<T>} iterable
   * @param {number} index
   */
  const next = async function (iterable, index) {
    return {
      index,
      result: await iterable.next(),
    };
  };
  const promises = iterables.map(next);
  while (true) {
    if (promises.length === 0) {
      break;
    }
    const first = await Promise.race(promises);
    // @ts-ignore
    yield [first.index, first.result.value];
    if (first.result.done) {
      promises.splice(first.index, 1);
    } else {
      promises[first.index] = next(iterables[first.index], first.index);
    }
  }
}
