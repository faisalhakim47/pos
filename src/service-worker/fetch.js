// @ts-check

import { ApiRequest } from '@/service-worker/api/request.js';
import { ApiResponse } from '@/service-worker/api/response.js';
import { router } from '@/service-worker/api/router.js';
import { assertInstanceOf } from '@/tools/assertion.js';

/** @typedef {import('@/service-worker/pos-file.js').PosFileContext} PosFileContext */
/** @typedef {import('@/service-worker/service-worker.js').ServiceWorkerContext} ServiceWorkerContext */

/**
 * @param {PosFileContext & ServiceWorkerContext} context
 */
export function createFetchHandler(context) {
  /** @param {unknown} event */
  return function (event) {
    assertInstanceOf(FetchEvent, event);
    const response = (async function () {
      const apiReq = ApiRequest.from(event.request);
      const apiRes = new ApiResponse();
      const routedRes = await router(context, apiReq, apiRes)
        .catch(function (error) {
          if (error instanceof Response) {
            return error;
          }
          console.error('[SW] router error:', error);
          return apiRes.withStatus(500).withJson({
            message: 'Internal server error',
          });
        });
      if (routedRes instanceof Response) {
        return routedRes;
      }
      else {
        const cachedRes = await self.caches.match(event.request);
        return cachedRes ?? await fetch(event.request)
          .catch(function (error) {
            console.error('[SW] fetch error:', error);
            throw error;
          });
      }
    })();
    event.waitUntil(response);
    event.respondWith(response);
  };
}
