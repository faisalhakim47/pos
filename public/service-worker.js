// @ts-check

import { apiResponse } from './service-worker/api/response.js';
import { assertInstanceOf } from './service-worker/tools/assertion.js';
import { isServiceWorkerGlobalScope } from './service-worker/tools/platform.js';

const serviceWorker = self;

if (!isServiceWorkerGlobalScope(serviceWorker)) {
  throw new Error('This script must be executed on service worker context.');
}

serviceWorker.addEventListener('fetch', function (event) {
  assertInstanceOf(FetchEvent, event);

  const method = event.request.method.toUpperCase();
  const url = new URL(event.request.url);

  if (method === 'HEAD' && url.pathname === '/api/v1/file') {
    return event.respondWith(
      apiResponse()
        .withStatus(200)
        .withJson({ message: 'HEAD request received' }),
    );
  }

  if (method === 'POST' && url.pathname === '/api/v1/file') {
  }

  if (url.pathname.startsWith('/api')) {
    return event.respondWith(
      apiResponse()
        .withStatus(404)
        .withJson({ message: 'The API' }),
    );
  }

  const cachedResponse = (async function () {
    const cachedResponse = await self.caches.match(event.request);
    return cachedResponse ?? await fetch(event.request).catch(function (error) {
      console.info('Error fetching the request:', error);
      throw error;
    });
  })();
  event.waitUntil(cachedResponse);
  event.respondWith(cachedResponse);
});
