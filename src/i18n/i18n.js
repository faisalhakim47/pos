// @ts-check

import { createI18n as create , useI18n as vueUseI18n } from 'vue-i18n';

import en from '@/i18n/langs/en.js';

/**
 * @typedef {object} AppI18a
 * @property {typeof en} messages
 */

/** @typedef {import('vue-i18n').Composer<AppI18a>} AppComposer */

export function createI18n() {
  const detectedLocale = navigator.language;
  return create({
    legacy: false,
    locale: detectedLocale,
    fallbackLocale: 'en',
    messages: {
      en,
      id: en,
    },
  });
}

/**
 * @returns {AppComposer}
 */
export function useI18n() {
  return /** @type {any} */ (vueUseI18n());
}
