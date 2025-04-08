export async function sleep(duration: number, signal?: AbortSignal) {
  return new Promise<void>(function (resolve, reject) {
    let isResolved = false;
    const timeout = setTimeout(function () {
      signal?.removeEventListener('abort', abortHandler);
      resolve();
      isResolved = true;
    });
    const abortHandler = function () {
      if (isResolved) return;
      clearTimeout(timeout);
      reject(new Error('Aborted', { cause: signal?.reason }));
    };
    signal?.addEventListener('abort', abortHandler);
  });
}
