// @ts-check

/**
 * @param {unknown} value
 * @returns {value is AsyncIterable<unknown, void, unknown>}
 */
function isAsyncIterable(value) {
  return typeof value === 'object'
    && value !== null
    && Symbol.asyncIterator in value;
}

/**
 * @param {number} [interval]
 * @returns {AsyncGenerator<undefined, void, unknown>}
 */
async function* createInterval(interval) {
  while (true) {
    await new Promise(function (resolve) {
      setTimeout(resolve, interval);
    });
    yield undefined;
  }
}

/**
 * @template TInput, TOutput
 * @param {AsyncGenerator<TInput, void, unknown>} generator
 * @param {(value: TInput) => TOutput} mapper
 * @returns {AsyncGenerator<TOutput, void, unknown>}
 */
async function* map(generator, mapper) {
  for await (const value of generator) {
    yield mapper(value);
  }
}

/**
 * @template T
 * @param {AsyncGenerator<T, void, unknown>} generator
 * @param {(value: T) => boolean} predicate
 */
async function* filter(generator, predicate) {
  for await (const value of generator) {
    if (predicate(value)) {
      yield value;
    }
  }
}

/**
 * @template T
 * @param {Array<AsyncGenerator<T, void, unknown>>} generators
 */
async function* combineLatest(...generators) {
  const values = await Promise.all(generators.map(async function (generator) {
    return generator.next();
  }));
  yield values.slice();
  const promises = generators.map(async function (generator, index) {
    return {
      index,
      value: await generator.next(),
    };
  });
  while (true) {
    const next = await Promise.race(promises);
    values[next.index] = next.value;
    yield values.slice();
    promises[next.index] = (async function () {
      return {
        index: next.index,
        value: await generators[next.index].next(),
      };
    })();
  }
}

/**
 * @template T, TReturn, TNext
 * @param {AsyncGenerator<T, TReturn, TNext>} generator
 * @param {AsyncGenerator<unknown, void, unknown>} signal
 */
async function* takeUntil(generator, signal) {
  const stopSignal = Symbol('stopSignal');
  const signalPromise = signal.next().then(function () {
    return stopSignal;
  });
  while (true) {
    const next = await Promise.race([generator.next(), signalPromise]);
    if (next === stopSignal) {
      break;
    }
    yield next;
  }
}
