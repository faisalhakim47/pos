// @ts-check

import { onBeforeUnmount, onMounted, reactive } from 'vue';

export function useLocation() {
  const state = reactive({
    pathname: /** @type {string | undefined} */ (undefined),
    hash: /** @type {string | undefined} */ (undefined),
    hashName: /** @type {string | undefined} */ (undefined),
    hashParams: /** @type {Array<string | undefined>} */ ([]),
  });

  function updateLocation() {
    const pathname = window.location.pathname;
    const hash = window.location.hash;
    if (pathname !== state.pathname) {
      state.pathname = pathname;
    }
    if (hash !== state.hash) {
      state.hash = hash;
      const hashParts = hash.split('!');
      state.hashName = hashParts[0] ?? undefined;
      state.hashParams = hashParts[1]?.split(',') ?? [];
    }
  }

  onMounted(function () {
    updateLocation();
    window.addEventListener('hashchange', updateLocation);
    window.addEventListener('popstate', updateLocation);
    onBeforeUnmount(function () {
      window.removeEventListener('hashchange', updateLocation);
      window.removeEventListener('popstate', updateLocation);
    });
  });

  return state;
}
