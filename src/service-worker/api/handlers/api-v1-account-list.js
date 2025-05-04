// @ts-check

/** @typedef {import('@/service-worker/pos-file.js').PosFileContext} PosFileContext */
/** @typedef {import('@/service-worker/api/request.js').ApiRequest} ApiRequest */
/** @typedef {import('@/service-worker/api/response.js').ApiResponse} ApiResponse */

/**
 * @param {PosFileContext} context
 * @param {ApiRequest} req
 * @param {ApiResponse} res
 */
export async function apiV1AccountList(context, req, res) {
  const { posFiles } = context;

  const posFileUid = req.query('posFileUid', '');

  if (posFileUid === '') {
    throw res.withStatus(400).withJson({
      message: 'posFileUid query parameter is required',
    });
  }

  const posFile = posFiles.find(function (posFile) {
    return posFile.uid === posFileUid;
  });

  if (!posFile) {
    throw res.withStatus(404).withJson({
      message: `posFile with uid ${posFileUid} not found`,
    });
  }

  const accountList = posFile.sqlite.selectObjects(`
    SELECT * FROM account_detail
  `);

  return res.withStatus(200).withJson(accountList);
}
