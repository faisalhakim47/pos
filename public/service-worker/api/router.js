// @ts-check

import { apiResponse } from './response.js';

/** @typedef {import('../db/db.js').DbContext} DbContext */
/** @typedef {import('./request.js').ApiRequest} ApiRequest */
/** @typedef {import('./response.js').ApiResponse} ApiResponse */

/**
 * @param {DbContext} ctx
 * @param {ApiRequest} req
 * @param {ApiResponse} res
 * @returns {ApiResponse}
 */
export function router(ctx, req, res) {
  const { dbs } = ctx;

  const method = req.method.toUpperCase();
  const url = new URL(req.url);

  if (method === 'GET' && url.pathname === '/api/v1/files') {
    return apiResponse().withStatus(200).withJson([]);
  }

  if (method === 'POST' && url.pathname === '/api/v1/files') {
    const fileUid = Date.now().toString(36).toUpperCase();
    return apiResponse().withStatus(200).withJson({
      fileUid,
    });
  }

  throw res;
}
