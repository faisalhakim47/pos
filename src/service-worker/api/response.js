export class ApiResponse extends Response {
  /**
   * @param {number} status
   * @returns {ApiResponse}
   */
  withStatus(status){
    return new ApiResponse(this.body, {
      status,
      headers: this.headers,
    });
  }

  /**
   * @param {unknown} body
   * @returns {ApiResponse}
   */
  withJson(body) {
    return new ApiResponse(JSON.stringify(body), {
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
