// @ts-check

import { apiV1FileCreation } from '@/service-worker/api/handlers/api-v1-file-creation.js';

/** @typedef {import('@/service-worker/pos-file.js').PosFileContext} PosFileContext */
/** @typedef {import('@/service-worker/service-worker.js').ServiceWorkerContext} ServiceWorkerContext */
/** @typedef {import('@/service-worker/api/request.js').ApiRequest} ApiRequest */
/** @typedef {import('@/service-worker/api/response.js').ApiResponse} ApiResponse */

/**
 * @param {PosFileContext & ServiceWorkerContext} context
 * @param {ApiRequest} req
 * @param {ApiResponse} res
 * @returns {Promise<ApiResponse|undefined>}
 */
export async function router(context, req, res) {
  const { posFiles } = context;

  const method = req.method.toUpperCase();
  const url = new URL(req.url);

  if (method === 'GET' && url.pathname === '/api/v1/files') {
    return res.withStatus(200).withJson(posFiles.map(function (posFile) {
      return {
        uid: posFile.uid,
      };
    }));
  }

  if (method === 'POST' && url.pathname === '/api/v1/files') {
    return await apiV1FileCreation(context, req, res);
  }
}
