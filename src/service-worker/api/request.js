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
   * @param {string} defaultValue
   * @returns {string}
   */
  query(name, defaultValue) {
    const url = new URL(this.url);
    const value = url.searchParams.get(name);
    if (typeof value === 'string') {
      return value;
    }
    return defaultValue;
  }

  /**
   * @param {string} name
   * @param {number} defaultValue
   * @returns {number}
   */
  queryNumber(name, defaultValue) {
    const value = this.query(name, '');
    if (value === '') {
      return defaultValue;
    }
    const numberValue = parseFloat(value);
    if (Number.isNaN(numberValue)) {
      return defaultValue;
    }
    return numberValue;
  }

  /**
   * @param {string} name
   * @param {boolean} defaultValue
   * @returns {boolean}
   */
  queryBoolean(name, defaultValue) {
    const value = this.query(name, '');
    if (value === '') {
      return defaultValue;
    }
    return value === '1' || value === 'true' || value === 'yes';
  }
}
