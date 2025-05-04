// @ts-check

import { reactive } from 'vue';

/** @template T @typedef {import('vue').InjectionKey<T>} InjectionKey */
/** @template T @typedef {import('vue').Plugin<T>} Plugin */
/** @template T @typedef {import('vue').Ref<T>} Ref */

/**
 * @typedef {object} PlatformContext
 * @property {boolean} isSupported
 * @property {ServiceWorkerContainer} [serviceWorker]
 * @property {Crypto} [crypto]
 * @property {string} [unsupportedMessage]
 * @property {Array<{ name: string, url: string }>} [supportedBrowsers]
 */

const platformKey = /** @type {InjectionKey<PlatformContext>} */ (Symbol());

export const platformPlugin = /** @type {Plugin<unknown>} */ ({
  install(app) {
    const errors = /** @type {Array<string>} */ ([]);

    const isMainThreadBrowser = 'window' in globalThis
      && 'Window' in globalThis
      && globalThis instanceof globalThis.Window;
    if (!isMainThreadBrowser) {
      errors.push('This app is only supported in the main thread of a browser.');
    }

    const isServiceWorkerSupported = 'serviceWorker' in globalThis.navigator;
    if (!isServiceWorkerSupported) {
      errors.push('This app requires service worker support.');
    }

    const isCryptoSupported = 'crypto' in globalThis;
    if (!isCryptoSupported) {
      errors.push('This app requires crypto support.');
    }

    const isSupported = errors.length === 0;

    const state = reactive(/** @type {PlatformContext} */ ({
      isSupported,
      unsupportedMessage: errors.length > 0
        ? errors.join('; ')
        : undefined,
      serviceWorker: globalThis?.navigator?.serviceWorker,
      crypto: globalThis?.crypto,
      supportedBrowsers: [
        { name: 'Chrome', url: 'https://www.google.com/chrome/' },
      ],
    }));

    app.provide(platformKey, state);
  },
});


