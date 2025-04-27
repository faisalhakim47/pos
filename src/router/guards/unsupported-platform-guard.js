// @ts-check

/** @typedef {import('vue-router').Router} Router */

import { isServiceWorkerSupported } from '@/tools/platform.js';

/**
 * @param {Router} router
 */
export async function installUnsupportedPlatformGuard(router) {
  const removeListener = router.beforeEach(async function (destination) {
    const supportConditions = await Promise.all([
      isServiceWorkerSupported(),
    ]);
    const isSupported = supportConditions.every(function (condition) {
      return condition;
    });
    if (isSupported) {
      if (destination.name === 'AppUnsupportedPlatform') {
        return { name: 'AppPanelIndex', replace: true };
      }
    }
    else {
      return destination.name === 'AppUnsupportedPlatform'
        ? true
        : { name: 'AppUnsupportedPlatform', replace: true };
    }
    removeListener();
    return true;
  });
}
