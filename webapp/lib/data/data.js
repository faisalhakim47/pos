// @ts-check

/**
 * @template T
 * @typedef {AsyncGenerator<T, void, undefined>} DataIterable
 */


/**
 * @template T
 * @typedef {T extends DataIterable<infer U> ? U : never} TypeOfDataIterable
 */
