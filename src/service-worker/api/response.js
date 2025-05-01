export class ApiResponse extends Response {
  /**
   * @param {number} status
   * @returns {ApiResponse}
   */
  withStatus(status) {
    return new ApiResponse(this.body, {
      status,
      headers: this.headers,
    });
  }

  /**
   * @template T
   * @param {T} body
   * @returns {JsonApiResponse<T>}
   */
  withJson(body) {
    return new JsonApiResponse(body, {
      status: this.status,
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
    });
  }

  withNoContent() {
    return new ApiResponse(null, {
      status: this.status || 204,
      headers: this.headers,
    });
  }
}

/**
 * @template T
 * @extends {ApiResponse}
 */
export class JsonApiResponse extends ApiResponse {
  /**
   * @param {T} body
   * @param {ResponseInit} init
   */
  constructor(body, init) {
    if (typeof body !== 'object') {
      throw new TypeError('body must be an object');
    }
    super(JSON.stringify(body), init);
  }
}
