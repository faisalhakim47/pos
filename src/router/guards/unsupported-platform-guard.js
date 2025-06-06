// @ts-check

import { usePlatform } from '@/src/context/platform.js';

/** @typedef {import('vue').App} App */
/** @typedef {import('vue-router').Router} Router */

/**
 * @param {App} app
 * @param {Router} router
 */
export async function installUnsupportedPlatformGuard(app, router) {
  const removeListener = router.beforeEach(async function (destination) {
    const isSupported = await app.runWithContext(async function () {
      const platform = usePlatform();
      return platform.isSupported;
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
