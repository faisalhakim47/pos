// @ts-check

import { inject } from 'vue';

/** @template T @typedef {import('vue').InjectionKey<T>} InjectionKey */
/** @template T @typedef {import('vue').Plugin<T>} Plugin */

/** @typedef {number|bigint|Intl.StringNumericLiteral} Numeric */

/**
 * @typedef {object} FormatterContext
 * @property {(numeric: Numeric) => string} formatNumber
 */

export const formatterKey = /** @type {InjectionKey<FormatterContext>} */ (Symbol());

/** @type {Plugin<unknown>} */
export const formatter = {
  install(app) {
    const detectedLocale = navigator.language ?? 'en-UK';

    const numberFormatter = new Intl.NumberFormat(detectedLocale, {
      roundingMode: 'halfEven', // Banker's Rounding
      maximumFractionDigits: 0,
    });

    app.provide(formatterKey, {
      formatNumber(numeric) {
        if (isNaN(Number(numeric))) {
          return 'Invalid';
        }
        else if (typeof numeric === 'bigint') {
          return numberFormatter.format(Number(numeric));
        }
        else {
          return numberFormatter.format(numeric);
        }
      },
    });
  },
};

/**
 * @returns {FormatterContext}
 */
export function useFormatter() {
  const formatter = inject(formatterKey);
  if (!formatter) {
    throw new Error('Formatter context is not provided');
  }
  return formatter;
}
