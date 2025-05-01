// @ts-check

/** @template T @typedef {import('@/service-worker/api/response.js').JsonApiResponse<T>} JsonApiResponse */

/**
 * @template {(...args: any) => Promise<JsonApiResponse<any>>} T
 * @typedef {T extends (...args: any) => Promise<JsonApiResponse<infer R>> ? R : any} JsonApiHandlerType
 */
