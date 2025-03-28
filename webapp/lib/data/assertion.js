// @ts-check

/**
 * @param {unknown} instance
 * @returns {instance is AsyncGenerator<unknown, unknown, unknown>}
 */
export function isAsyncGenerator(instance) {
  return typeof instance === 'object'
    && instance !== null
    && Symbol.asyncIterator in instance;
}
