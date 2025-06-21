// @ts-check

import { unknownErrorToString } from '@/src/tools/error.js';

/**
 * @template {keyof any} K
 * @template T
 * @typedef {{ [P in K]?: T }} NullableRecord
 */

/**
 * @template T
 * @param {new (...args: never) => T} constructor
 * @param {unknown} value
 * @param {string} [message]
 * @returns {asserts value is T}
 */
export function assertInstanceOf(constructor, value, message) {
  if (!(value instanceof constructor)) {
    throw new TypeError(
      message ?? `Expected instance of ${constructor.name}, but got ${unknownErrorToString(value)}`,
    );
  }
}

/**
 * @template {number|string|symbol} K
 * @template {unknown} T
 * @param {T} object
 * @param {K} property
 * @returns {T is T & Record<K, unknown>}
 */
export function isPropertyExists(object, property) {
  if (object === null || object === undefined) {
    return false;
  }
  return property in (object ?? {});
}

/**
 * @template {number|string|symbol} K
 * @template {unknown} T
 * @param {T} object
 * @param {K} property
 * @param {string} [message]
 * @returns {asserts object is T & Record<K, unknown>}
 */
export function assertPropertyExists(object, property, message) {
  if (!isPropertyExists(object, property)) {
    throw new Error(
      message ?? `Property ${property.toString()} does not exist on object`,
    );
  }
}

/**
 * @template {number|string|symbol} K
 * @template T
 * @param {T} object
 * @param {K} property
 * @param {string} [message]
 * @returns {asserts object is T & Record<K, string>}
 */
export function assertPropertyString(object, property, message) {
  assertPropertyExists(object, property, message);
  if (typeof object[property] !== 'string') {
    throw new TypeError(
      message ?? `Expected property ${property.toString()} to be a string, but got ${typeof object[property]}`,
    );
  }
}

/**
 * @template {number|string|symbol} K
 * @template T
 * @param {T} object
 * @param {K} property
 * @param {string} [message]
 * @returns {asserts object is T & NullableRecord<K, string>}
 */
export function assertPropertyMaybeString(object, property, message) {
  if (isPropertyExists(object, property)) {
    /** this assertion should not be necessary, but the isPropertyExists type guard does not work */
    assertPropertyExists(object, property, message);
    if (typeof object[property] !== 'string') {
      throw new TypeError(
        message ?? `Expected property ${property.toString()} to be a string or undefined, but got ${typeof object[property]}`,
      );
    }
  }
}

/**
 * @template {number|string|symbol} K
 * @template {Record<K, T[K]>} T
 * @param {T} object
 * @param {K} property
 * @param {string} [message]
 * @returns {asserts object is T & Record<K, number>}
 */
export function assertPropertyNumber(object, property, message) {
  if (typeof object[property] !== 'number') {
    throw new TypeError(
      message ?? `Expected property ${property.toString()} to be a number, but got ${typeof object[property]}`,
    );
  }
}

/**
 * @template {number|string|symbol} K
 * @template {Record<K, T[K]>} T
 * @param {T} object
 * @param {K} property
 * @param {string} [message]
 * @returns {asserts object is T & Record<K, Array<unknown>>}
 */
export function assertPropertyArray(object, property, message) {
  if (!Array.isArray(object[property])) {
    throw new TypeError(
      message ?? `Expected property ${property.toString()} to be an array, but got ${typeof object[property]}`,
    );
  }
}
