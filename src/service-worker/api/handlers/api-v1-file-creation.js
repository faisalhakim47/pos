// @ts-check

import { createPosDb } from '@/service-worker/db/db.js';
import { assertPropertyExists, assertPropertyString } from '@/tools/assertion.js';

/** @typedef {import('@/service-worker/service-worker.js').ServiceWorkerContext} ServiceWorkerContext */
/** @typedef {import('@/service-worker/pos-file.js').PosFileContext} PosFileContext */
/** @typedef {import('@/service-worker/api/request.js').ApiRequest} ApiRequest */
/** @typedef {import('@/service-worker/api/response.js').ApiResponse} ApiResponse */

/** @param {unknown} data */
export function validateFileCreationRequestData(data) {
  assertPropertyExists(data, 'uid', 'Expect uid to be defined');
  assertPropertyString(data, 'uid', 'Expect uid to be a string');
  return data;
}

/**
 * @param {PosFileContext & ServiceWorkerContext} context
 * @param {ApiRequest} req
 * @param {ApiResponse} res
 */
export async function apiV1FileCreation(context, req, res) {
  const { date, posFiles } = context;

  const reqTime = date().getTime();
  const reqBody = validateFileCreationRequestData(await req.json());

  posFiles.push({
    uid: reqBody.uid,
    sqlite: await createPosDb(),
    lastModified: reqTime,
    lastSaved: reqTime,
  });

  return res.withStatus(200).withJson({
    message: 'File created successfully',
  });
}
