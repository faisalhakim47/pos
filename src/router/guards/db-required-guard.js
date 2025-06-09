// @ts-check

import { useDb } from '@/src/context/db.js';
import { AppPanelDashboardRoute, AppOnboardingRoute } from '@/src/router/router.js';

/** @typedef {import('vue').App} App */
/** @typedef {import('vue-router').Router} Router */

/**
 * @param {App} app
 * @param {Router} router
 */
export async function installDbRequiredGuard(app, router) {
  const removeListener = router.beforeEach(async function (destination) {
    const isDbOpen = await app.runWithContext(async function () {
      const db = useDb();
      return db.isOpen;
    });
    if (isDbOpen) {
      if (destination.name === AppOnboardingRoute) {
        return { name: AppPanelDashboardRoute, replace: true };
      }
    }
    else {
      return destination.name === AppOnboardingRoute
        ? true
        : { name: AppOnboardingRoute, replace: true };
    }
    removeListener();
    return true;
  });
}
