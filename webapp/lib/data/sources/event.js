// @ts-check

/**
 * @template T
 * @typedef {import('webapp/lib/data/data.js').DataIterable<T>} DataIterable
 */

/**
 * @source
 * @param {EventTarget} eventTarget
 * @param {string} eventName
 * @returns {DataIterable<Event>}
 */
export async function* iterableEvents(eventTarget, eventName) {
  /** @type {PromiseWithResolvers<Event>} */
  let { promise, resolve } = Promise.withResolvers();
  /** @type {EventListenerOrEventListenerObject} */
  const listener = function (event) {
    resolve(event);
  };
  eventTarget.addEventListener(eventName, listener);
  try {
    while (true) {
      yield await promise;
      ({ promise, resolve } = Promise.withResolvers());
    }
  }
  finally {
    eventTarget.removeEventListener(eventName, listener);
  }
}
