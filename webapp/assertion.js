// @ts-check

/**
 * @template T
 * @param {new (...args: Array<unknown>) => T} constructor
 * @param {unknown} instance
 * @param {string} [message]
 * @returns {asserts instance is T}
 */
export function assertInstanceOf(constructor, instance, message) {
  if (!(instance instanceof constructor)) {
    if (typeof message === 'string') {
      throw new Error(message);
    }
    else {
      throw new Error(`Expected instance of ${constructor.name}, got ${instance}`);
    }
  }
}
