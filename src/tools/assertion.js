// @ts-check

import { unknownErrorToString } from '@/src/tools/error.js';

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
 * @param {string} [message]
 * @returns {asserts object is T & Record<K, unknown>}
 */
export function assertPropertyExists(object, property, message) {
  if (object === null || object === undefined) {
    throw new TypeError(
      message ?? `Expected object to be defined, but got ${object}`,
    );
  }
  if (!(property in (object ?? {}))) {
    throw new Error(
      message ?? `Property ${property.toString()} does not exist on object`,
    );
  }
}

/**
 * @template {number|string|symbol} K
 * @template {Record<K, T[K]>} T
 * @param {T} object
 * @param {K} property
 * @param {string} [message]
 * @returns {asserts object is T & Record<K, string>}
 */
export function assertPropertyString(object, property, message) {
  if (typeof object[property] !== 'string') {
    throw new TypeError(
      message ?? `Expected property ${property.toString()} to be a string, but got ${typeof object[property]}`,
    );
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
