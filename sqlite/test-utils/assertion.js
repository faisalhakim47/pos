// @ts-check

/**
 * @param {unknown} value
 * @param {string} message
 * @returns {asserts value is number}
 */
export function assertTypeofNumber(value, message) {
  if (typeof value !== 'number') {
    throw new Error(`Expected value to be a number. ${message || ''}`);
  }
}
