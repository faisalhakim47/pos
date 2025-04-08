import { createRouter as create, createWebHistory } from 'vue-router';

import App from '@/views/App.vue';
import AppPanel from '@/views/AppPanel.vue';
import AppPanelDashboard from '@/views/AppPanelDashboard.vue';
import AppPanelProductList from '@/views/AppPanelProductList.vue';
import AppUnsupportedPlatform from '@/views/AppUnsupportedPlatform.vue';
import { isServiceWorkerInstalled, isServiceWorkerSupported } from '@/tools/platform.ts';
import AppPanelMenu from '@/views/AppPanelMenu.vue';
import AppOnboarding from '@/views/AppOnboarding.vue';

export function createRouter() {
  const router = create({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
      {
        name: 'App',
        component: App,
        path: '',
        children: [
          { name: 'AppIndex', path: '', redirect: { name: 'AppPanelIndex', replace: true } },
          { name: 'AppUnsupportedPlatform', component: AppUnsupportedPlatform, path: 'unsupported' },
          { name: 'AppOnboarding', component: AppOnboarding, path: 'onboarding' },
          {
            name: 'AppPanel',
            component: AppPanel,
            path: 'panel',
            children: [
              { name: 'AppPanelIndex', path: '', redirect: { name: 'AppPanelMenu', replace: true } },
              { name: 'AppPanelMenu', component: AppPanelMenu, path: 'menu' },
              { name: 'AppPanelDashboard', component: AppPanelDashboard, path: 'dashboard' },
              { name: 'AppPanelProductList', component: AppPanelProductList, path: 'products' },
            ],
          },
        ],
      },
    ],
  });

  const resolveFirstNavigation = router.beforeEach(async function (to) {
    const supportConditions = await Promise.all([
      isServiceWorkerSupported(),
    ]);
    const isSupported = supportConditions.every(function (condition) {
      return condition;
    });
    if (isSupported) {
      if (to.name === 'AppUnsupportedPlatform') {
        return { name: 'AppPanelIndex', replace: true };
      }
    }
    else {
      return to.name === 'AppUnsupportedPlatform'
        ? true
        : { name: 'AppUnsupportedPlatform', replace: true };
    }

    const serviceWorkerInstalled = await isServiceWorkerInstalled();

    if (serviceWorkerInstalled) {
      if (to.name === 'AppOnboarding') {
        return { name: 'AppPanelIndex', replace: true };
      }
    }
    else {
      return to.name === 'AppOnboarding'
        ? true
        : { name: 'AppOnboarding', replace: true };
    }

    resolveFirstNavigation();

    return true;
  });


  return router;
}
