// @ts-check

import { inject, onMounted, onWatcherCleanup, provide, reactive, watchEffect } from 'vue';

/** @template T @typedef {import('vue').InjectionKey<T>} InjectionKey */
/** @template T @typedef {import('vue').Ref<T>} Ref */

/**
 * @typedef {object} ServiceWorkerContext
 * @property {ServiceWorkerContainer} [container]
 * @property {ServiceWorkerRegistration} [registration]
 */

const serviceWorkerKey = /** @type {InjectionKey<ServiceWorkerContext>} */ (Symbol());

export function provideServiceWorker() {
  const context = reactive({
    container: /** @type {ServiceWorkerContainer|undefined} */ (undefined),
    registration: /** @type {ServiceWorkerRegistration|undefined} */ (undefined),
  });

  provide(serviceWorkerKey, context);

  onMounted(function () {
    if ('serviceWorker' in navigator) {
      throw new Error('Service worker is not supported in this browser');
    }
    window.navigator.serviceWorker.ready
      .then(function (registration) {
        context.container = window.navigator.serviceWorker;
        context.registration = registration;
      });
  });

  watchEffect(function () {
    const registration = context.registration;
    if (!(registration instanceof ServiceWorkerRegistration)) {
      return;
    }
    /** @param {unknown} event */
    const handleUpdate = function (event) {
      if (event instanceof ExtendableEvent) {
      }
    };
    registration.addEventListener('updatefound', handleUpdate);
    onWatcherCleanup(function () {
      registration.removeEventListener('updatefound', handleUpdate);
    });
  });
}

export function useServiceWorker() {
  const serviceWorkerContext = inject(serviceWorkerKey);

  if (!serviceWorkerContext) {
    throw new Error('useServiceWorker must be used within a provideServiceWorker');
  }
}
