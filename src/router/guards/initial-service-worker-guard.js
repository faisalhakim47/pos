// @ts-check

/** @typedef {import('vue-router').Router} Router */

import { isServiceWorkerInstalled } from '@/tools/platform.js';

/**
 * @param {Router} router
 */
export async function installInitialServiceWorkerGuard(router) {
  const removeListener = router.beforeEach(async function (destination) {
    const serviceWorkerInstalled = await isServiceWorkerInstalled();
    if (serviceWorkerInstalled) {
      if (destination.name === 'AppServiceWorkerSetup') {
        return { name: 'AppPanelIndex', replace: true };
      }
    }
    else {
      return destination.name === 'AppServiceWorkerSetup'
        ? true
        : { name: 'AppServiceWorkerSetup', replace: true };
    }
    removeListener();
    return true;
  });
}
