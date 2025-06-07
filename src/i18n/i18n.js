// @ts-check

import { createI18n, useI18n as vueUseI18n } from 'vue-i18n';

import en from '@/src/i18n/langs/en.js';

/** @template T @typedef {import('vue').Plugin<T>} Plugin */

/**
 * @typedef {object} AppI18a
 * @property {typeof en} messages
 */

/** @type {Plugin<unknown>} */
export const i18n = {
  install(app) {
    const detectedLocale = navigator.language;
    const i18n = createI18n({
      legacy: false,
      locale: detectedLocale,
      fallbackLocale: 'en',
      messages: {
        en,
        id: en,
      },
    });
    app.use(i18n);
  },
};

/** @typedef {import('vue-i18n').Composer<AppI18a>} AppI18nComposer */

/**
 * @returns {AppI18nComposer}
 */
export function useI18n() {
  return /** @type {any} */ (vueUseI18n());
}
