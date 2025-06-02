// @ts-check

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
      message ?? `Expected instance of ${constructor.name}, but got ${typeof value}`,
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
