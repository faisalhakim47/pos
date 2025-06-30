// @ts-check

/**
 * @param {number} duration
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
export async function sleep(duration, signal) {
  return new Promise(function (resolve, reject) {
    let isResolved = false;
    const timeout = setTimeout(function () {
      signal?.removeEventListener('abort', abortHandler);
      resolve();
      isResolved = true;
    }, duration);
    const abortHandler = function () {
      if (isResolved) return;
      clearTimeout(timeout);
      reject(new Error('Aborted', { cause: signal?.reason }));
    };
    signal?.addEventListener('abort', abortHandler);
  });
}
