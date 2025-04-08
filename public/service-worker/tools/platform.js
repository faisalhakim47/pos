/**
 * Check ServiceWorkerGlobalScope instance without referencing ServiceWorkerGlobalScope object.
 *
 * @param {unknown} maybeServiceWorkerGlobalScope
 * @returns {maybeServiceWorkerGlobalScope is ServiceWorkerGlobalScope}
 */
export function isServiceWorkerGlobalScope(maybeServiceWorkerGlobalScope) {
  return true
    && typeof maybeServiceWorkerGlobalScope === 'object'
    && maybeServiceWorkerGlobalScope !== null
    && 'ServiceWorkerGlobalScope' in maybeServiceWorkerGlobalScope
    && maybeServiceWorkerGlobalScope.ServiceWorkerGlobalScope === maybeServiceWorkerGlobalScope.constructor
  ;
}
