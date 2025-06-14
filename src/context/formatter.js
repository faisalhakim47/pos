// @ts-check

import { inject } from 'vue';

/** @template T @typedef {import('vue').InjectionKey<T>} InjectionKey */
/** @template T @typedef {import('vue').Plugin<T>} Plugin */

/** @typedef {number|bigint|Intl.StringNumericLiteral} Numeric */

/**
 * @typedef {object} FormatterContext
 * @property {(numeric: Numeric) => string} formatNumber
 * @property {(amount: number, currencyCode?: string, decimals?: number) => string} formatCurrency
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

    // Cache for currency formatters to avoid creating new instances repeatedly
    const currencyFormatterCache = new Map();

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
      formatCurrency(amount, currencyCode = 'USD', decimals = 2) {
        if (isNaN(amount)) {
          return 'Invalid';
        }

        // Create cache key for the currency formatter
        const cacheKey = `${currencyCode}-${decimals}`;

        // Get or create formatter for this currency
        if (!currencyFormatterCache.has(cacheKey)) {
          try {
            const formatter = new Intl.NumberFormat(detectedLocale, {
              style: 'currency',
              currency: currencyCode,
              roundingMode: 'halfEven',
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            });
            currencyFormatterCache.set(cacheKey, formatter);
          } catch {
            // Fallback for invalid currency codes
            const formatter = new Intl.NumberFormat(detectedLocale, {
              style: 'currency',
              currency: 'USD',
              roundingMode: 'halfEven',
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            });
            currencyFormatterCache.set(cacheKey, formatter);
          }
        }

        const formatter = currencyFormatterCache.get(cacheKey);
        // Convert from smallest unit (e.g., cents) to main unit (e.g., dollars)
        const divisor = Math.pow(10, decimals);
        return formatter.format(amount / divisor);
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
