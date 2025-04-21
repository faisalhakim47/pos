import { createRouter as create, createWebHistory } from 'vue-router';

import App from '@/views/App.vue';
import AppPanel from '@/views/AppPanel.vue';
import AppPanelDashboard from '@/views/AppPanelDashboard.vue';
import AppPanelProductList from '@/views/AppPanelProductList.vue';
import AppUnsupportedPlatform from '@/views/AppUnsupportedPlatform.vue';
import { isServiceWorkerInstalled, isServiceWorkerSupported } from '@/tools/platform.ts';
import AppServiceWorkerSetup from '@/views/AppServiceWorkerSetup.vue';
import AppPanelOnboarding from '@/views/AppPanelOnboarding.vue';
import { loadFonts } from '@/font.ts';

export function createRouter() {
  const router = create({
    history: createWebHistory(import.meta.env.BASE_URL ?? '/'),
    routes: [
      {
        name: 'App',
        component: App,
        path: '',
        children: [
          { name: 'AppIndex', path: '', redirect: { name: 'AppPanelIndex', replace: true } },
          { name: 'AppServiceWorkerSetup', component: AppServiceWorkerSetup, path: 'onboarding' },
          { name: 'AppUnsupportedPlatform', component: AppUnsupportedPlatform, path: 'unsupported' },
          {
            name: 'AppPanel',
            component: AppPanel,
            path: 'panel',
            children: [
              { name: 'AppPanelIndex', path: '', redirect: { name: 'AppPanelOnboarding', replace: true } },
              { name: 'AppPanelDashboard', component: AppPanelDashboard, path: 'dashboard' },
              { name: 'AppPanelOnboarding', component: AppPanelOnboarding, path: 'onboarding' },
              { name: 'AppPanelProductList', component: AppPanelProductList, path: 'products' },
            ],
          },
        ],
      },
    ],
  });

  const resolveFirstNavigation = router.beforeEach(async function (destination) {
    const supportConditions = await Promise.all([
      loadFonts(),
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

    resolveFirstNavigation();

    return true;
  });

  return router;
}
