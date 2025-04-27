// @ts-check

/** @typedef {import('vue-router').Router} Router */

import { loadFonts } from '@/font.js';
import { isServiceWorkerSupported } from '@/tools/platform.js';

export function installFontLoadGuard(router) {
  const fontLoadPromise = Promise.all([
    loadFonts(),
    isServiceWorkerSupported(),
  ]);
  const removeListener = router.beforeEach(async function () {
    await fontLoadPromise;
    removeListener();
    return true;
  });
}
