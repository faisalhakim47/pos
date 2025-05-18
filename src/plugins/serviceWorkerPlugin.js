// @ts-check

import { inject, reactive } from 'vue';

import { platformKey } from '@/plugins/platformPlugin.js';

import ServiceWorkerUrl from '/service-worker.js?worker&url';

/** @template T @typedef {import('vue').InjectionKey<T>} InjectionKey */
/** @template T @typedef {import('vue').Plugin<T>} Plugin */
/** @template T @typedef {import('vue').Ref<T>} Ref */

/**
 * @typedef {object} ServiceWorkerContext
 * @property {() => Promise<void>} register
 * @property {(input: string, init?: RequestInit) => Promise<Response>} fetch
 * @property {boolean} [isReady]
 * @property {boolean} [isInstalling]
 * @property {boolean} [isWaiting]
 * @property {boolean} [isInstalled]
 * @property {number} [updateFoundTime] the service worker on the waiting state
 * @property {number} [controllerChangeTime]
 * @property {unknown} [installationError]
 */

const serviceWorkerKey = /** @type {InjectionKey<ServiceWorkerContext>} */ (Symbol());

export const serviceWorkerPlugin = /** @type {Plugin<unknown>} */ ({
  install(app) {
    const platform = inject(platformKey);

    if (!platform) {
      throw new Error('ServiceWorkerPlugin requires PlatformPlugin to be installed');
    }

    if (!platform.serviceWorkerContainer) {
      throw new Error('ServiceWorkerPlugin requires service worker support');
    }

    const state = reactive(/** @type {ServiceWorkerContext} */({
      async register() {
        await platform.serviceWorkerContainer.register(ServiceWorkerUrl, {
          scope: '/',
          type: 'module',
          updateViaCache: 'none',
        });
        await navigator.serviceWorker.ready;
      },
      async fetch(input, init) {
        if (!state.isInstalled) {
          throw new Error('Service worker is not ready yet');
        }
        return fetch(input, init);
      },
    }));

    platform.serviceWorkerContainer.getRegistration('/')
      .then(function (registration) {
        if (registration) {
          state.isInstalled = registration.active instanceof ServiceWorker;
          state.isWaiting = registration.waiting instanceof ServiceWorker;
        }
        else {
          state.isInstalled = false;
          state.isWaiting = false;
        }
      })
      .finally(function () {
        state.isReady = true;
      });

    let numOfInstalling = 0;
    platform.serviceWorkerContainer.ready.then(function (registration) {
      registration.addEventListener('updatefound', function () {
        state.updateFoundTime = Date.now();
        state.isWaiting = true;
        const installingSw = registration.installing;
        if (installingSw) {
          numOfInstalling++;
          state.isInstalling = numOfInstalling !== 0;
          function installingSwStateChangeListener() {
            if (
              false
              || installingSw.state === 'installed'
              || installingSw.state === 'redundant'
              || installingSw.state === 'activating'
              || installingSw.state === 'activated'
            ) {
              installingSw.removeEventListener('statechange', installingSwStateChangeListener);
              numOfInstalling--;
              state.isInstalling = numOfInstalling !== 0;
            }
          }
          installingSw.addEventListener('statechange', installingSwStateChangeListener);
          installingSw.addEventListener('error', function (error) {
            state.installationError = error;
            installingSw.removeEventListener('statechange', installingSwStateChangeListener);
            numOfInstalling--;
          }, { once: true });
        }
      });
    });

    platform.serviceWorkerContainer.addEventListener('controllerchange', function (event) {
      state.controllerChangeTime = Date.now();
    });

    app.provide(serviceWorkerKey, state);
  },
});

export function useServiceWorker() {
  const serviceWorker = inject(serviceWorkerKey);

  if (!serviceWorker) {
    throw new Error('useServiceWorker requires ServiceWorkerPlugin to be installed');
  }

  return serviceWorker;
}
