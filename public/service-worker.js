// @ts-check

import { assertInstanceOf } from './service-worker/tools/assertion.js';
import { isServiceWorkerGlobalScope } from './service-worker/tools/platform.js';

const serviceWorker = self;

if (!isServiceWorkerGlobalScope(serviceWorker)) {
  throw new Error('This script must be executed on service worker context.');
}

serviceWorker.addEventListener('fetch', function (event) {
  assertInstanceOf(FetchEvent, event);
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api')) {
    event.respondWith(new Response(JSON.stringify({
      message: 'The Api',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }));
  }
  else {
    const cachedResponse = (async function () {
      const cachedResponse = await self.caches.match(event.request);
      return cachedResponse ?? await fetch(event.request);
    })();
    event.waitUntil(cachedResponse);
    event.respondWith(cachedResponse);
  }
});
