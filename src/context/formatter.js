// @ts-check

import { inject } from 'vue';

/** @template T @typedef {import('vue').InjectionKey<T>} InjectionKey */
/** @template T @typedef {import('vue').Plugin<T>} Plugin */

/** @typedef {number|bigint|Intl.StringNumericLiteral} Numeric */

/**
 * @typedef {object} FormatterContext
 * @property {(numeric: Numeric) => string} formatNumber
 * @property {(amount: number) => string} formatCurrency
 * @property {(date: Date) => string} formatDate
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

    const currencyFormatter = new Intl.NumberFormat(detectedLocale, {
      style: 'currency',
      currency: 'USD',
      roundingMode: 'halfEven',
    });

    const dateFormatter = new Intl.DateTimeFormat(detectedLocale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
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
      formatCurrency(amount) {
        if (isNaN(amount)) {
          return 'Invalid';
        }
        // Convert from cents to dollars
        return currencyFormatter.format(amount / 100);
      },
      formatDate(date) {
        return dateFormatter.format(date);
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
