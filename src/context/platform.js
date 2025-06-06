// @ts-check

import { inject } from 'vue';

/** @template T @typedef {import('vue').InjectionKey<T>} InjectionKey */
/** @template T @typedef {import('vue').Plugin<T>} Plugin */
/** @template T @typedef {import('vue').Ref<T>} Ref */

/**
 * @typedef {object} PlatformContext
 * @property {() => Date} date
 * @property {Crypto} [crypto]
 * @property {WebAssembly} [webAssembly]
 * @property {boolean} isSupported
 * @property {string} [unsupportedMessage]
 * @property {Array<{ name: string, url: string }>} [supportedBrowsers]
 */

export const platformKey = /** @type {InjectionKey<PlatformContext>} */ (Symbol());

/** @type {Plugin<unknown>} */
export const platform = {
  install(app) {
    const errors = /** @type {Array<string>} */ ([]);

    const isMainThreadBrowser = 'window' in globalThis
      && 'Window' in globalThis
      && globalThis instanceof globalThis.Window;
    if (!isMainThreadBrowser) {
      errors.push('This app is only supported in the main thread of a browser.');
    }

    const isCryptoSupported = 'crypto' in globalThis;
    if (!isCryptoSupported) {
      errors.push('This app requires crypto support.');
    }

    const isWebAssemblySupported = 'WebAssembly' in globalThis;
    if (!isWebAssemblySupported) {
      errors.push('This app requires WebAssembly support.');
    }

    const isSupported = errors.length === 0;

    app.provide(platformKey, {
      isSupported,
      date() { return new Date(); },
      unsupportedMessage: errors.length > 0 ? errors.join('; ') : undefined,
      crypto: globalThis?.crypto,
      webAssembly: globalThis?.WebAssembly,
      supportedBrowsers: [
        { name: 'Chrome', url: 'https://www.google.com/chrome/' },
      ],
    });
  },
};

export function usePlatform() {
  const platform = inject(platformKey);

  if (!platform) {
    throw new Error('usePlatform requires PlatformPlugin to be installed');
  }

  return platform;
}
