// @ts-check

/** @typedef {import('@/service-worker/pos-file.js').PosFileContext} PosFileContext */
/** @typedef {import('@/service-worker/api/request.js').ApiRequest} ApiRequest */
/** @typedef {import('@/service-worker/api/response.js').ApiResponse} ApiResponse */

/**
 * @param {PosFileContext} context
 * @param {ApiRequest} req
 * @param {ApiResponse} res
 */
export async function apiV1FileList(context, req, res) {
  const { posFiles } = context;
  return res.withStatus(200).withJson(posFiles);
}
