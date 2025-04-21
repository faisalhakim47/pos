import { createI18n as create } from 'vue-i18n';

import en from '@/i18n/langs/en.ts';

export type AppMessage = typeof en;
export type AppI18a = {
  message: AppMessage;
};

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
