// @ts-check

import { createFetchHandler } from '@/service-worker/fetch.js';
import { isServiceWorkerGlobalScope } from '@/tools/platform.js';

/** @typedef {import('@/service-worker/pos-file.js').PosFileContext} PosFileContext */
/** @typedef {import('@/service-worker/service-worker.js').ServiceWorkerContext} ServiceWorkerContext */

const serviceWorker = self;

if (!isServiceWorkerGlobalScope(serviceWorker)) {
  throw new Error('This script must be executed on service worker context.');
}

/** @type {ServiceWorkerContext} */
const serviceWorkerContext = {
  date() { return new Date(); },
};

/** @type {PosFileContext} */
const posFileContext = {
  posFiles: [],
};


serviceWorker.addEventListener('fetch', createFetchHandler({
  ...posFileContext,
  ...serviceWorkerContext,
}));
