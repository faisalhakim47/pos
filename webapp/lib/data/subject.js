// @ts-check

/**
 * @template T
 * @typedef {import('webapp/lib/data/data.js').DataIterable<T>} DataIterable
 */

/**
 * @template T
 */
export class SubjectIterator {
  /** @type {(value: T) => void} */
  #resolve;

  /** @type {T} */
  #lastValue;
  /**
   * @param {T} value
   */
  push(value) {
    this.#resolve(value);
  }

  /**
   * @returns {DataIterable<T>}
   */
  async *iterate() {
    if (this.#lastValue !== undefined) {
      yield this.#lastValue;
    }
    while (true) {
      /** @type {PromiseWithResolvers<T>} */
      const { promise, resolve } = Promise.withResolvers();
      this.#resolve = resolve;
      this.#lastValue = yield await promise;
    }
  }
}
