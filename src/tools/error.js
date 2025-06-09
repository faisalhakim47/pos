// @ts-check

/**
 * @param {unknown} error
 * @returns {object}
 */
export function unknownErrorToPlain(error) {
  if (error instanceof Error) {
    return errorToPlain(error);
  }
  if (typeof error === 'string') {
    return {
      message: error,
    };
  }
  if (typeof error === 'object' && 'constructor' in error && typeof error.constructor === 'function') {
    return {
      message: `Error is instance of: ${error.constructor.name}`,
      details: error,
    };
  }
  if (typeof error === 'object' && error !== null) {
    return error;
  }
  if (typeof error === 'undefined') {
    return undefined;
  }
  return {
    message: `Unhandled Type Error: ${error}`,
  };
}

/**
 * @param {unknown} error
 * @returns {string}
 */
export function unknownErrorToString(error) {
  return JSON.stringify(unknownErrorToPlain(error), null, 2);
}

/**
 * @param {Error} error
 * @returns {object}
 */
function errorToPlain(error) {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: error.cause instanceof Error
      ? unknownErrorToPlain(error.cause)
      : error.cause,
  };
}
