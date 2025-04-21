export class ApiRequest extends Request {
  /**
   * @param {Request} request
   * @returns {ApiRequest}
   */
  static from(request) {
    if (!(request instanceof Request)) {
      throw new TypeError('Expected request to be an instance of Request');
    }
    return new ApiRequest(request);
  }

  /**
   * @param {string} name
   * @returns {string | undefined}
   */
  query(name) {
    const url = new URL(this.url);
    const value = url.searchParams.get(name);
    if (typeof value === 'string') {
      return value;
    }
    return undefined;
  }

  /**
   * @param {string} name
   * @returns {number | undefined}
   */
  queryNumber(name) {
    const value = this.query(name);
    if (value === undefined) {
      return undefined;
    }
    const numberValue = parseFloat(value);
    if (Number.isNaN(numberValue)) {
      return undefined;
    }
    return numberValue;
  }

  /**
   * @param {string} name
   * @returns {boolean | undefined}
   */
  queryBoolean(name) {
    const value = this.query(name);
    return value === '1' || value === 'true' || value === 'yes';
  }
}
