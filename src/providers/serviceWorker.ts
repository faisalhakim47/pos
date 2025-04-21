import { inject, onMounted, onWatcherCleanup, provide, reactive, watchEffect, type InjectionKey } from 'vue';

type ServiceWorkerContext = {
  container?: ServiceWorkerContainer;
  registration?: ServiceWorkerRegistration;
};

const serviceWorkerKey = Symbol() as InjectionKey<ServiceWorkerContext>;

export function provideServiceWorker() {
  const context = reactive({
    container: undefined as ServiceWorkerContainer|undefined,
    registration: undefined as ServiceWorkerRegistration|undefined,
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
    const handleUpdate = function (event: unknown) {
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
