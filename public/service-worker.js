// @ts-check

import { assertInstanceOf } from './service-worker/tools/assertion.js';
import { isServiceWorkerGlobalScope } from './service-worker/tools/platform.js';

const serviceWorker = self;

if (!isServiceWorkerGlobalScope(serviceWorker)) {
  throw new Error('This script must be executed on service worker context.');
}

/** @type {FileSystemFileHandle|undefined} */
let dataFileHandle;

serviceWorker.addEventListener('message', function (event) {
  const { data } = event;
  if (data instanceof FileSystemFileHandle) {
    dataFileHandle = data;
  }
});

serviceWorker.addEventListener('fetch', function (event) {
  assertInstanceOf(FetchEvent, event);

  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api')) {
    if (dataFileHandle === undefined) {
      return event.respondWith(new Response(JSON.stringify({
        message: 'No file handle available',
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      }));
    }

    return event.respondWith(new Response(JSON.stringify({
      message: 'The Api',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }));
  }

  const cachedResponse = (async function () {
    const cachedResponse = await self.caches.match(event.request);
    return cachedResponse ?? await fetch(event.request);
  })();
  event.waitUntil(cachedResponse);
  event.respondWith(cachedResponse);
});
