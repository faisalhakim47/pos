export async function isServiceWorkerSupported() {
  return 'serviceWorker' in navigator
    && 'ServiceWorkerContainer' in window
    && navigator.serviceWorker instanceof ServiceWorkerContainer;
}

export async function isServiceWorkerInstalled() {
  return navigator?.serviceWorker?.controller instanceof ServiceWorker;
}
