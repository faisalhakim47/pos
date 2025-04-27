import { createRouter as create, createWebHistory } from 'vue-router';

import App from '@/views/App.vue';
import AppPanel from '@/views/AppPanel.vue';
import AppPanelDashboard from '@/views/AppPanelDashboard.vue';
import AppPanelProductList from '@/views/AppPanelProductList.vue';
import AppUnsupportedPlatform from '@/views/AppUnsupportedPlatform.vue';
import AppServiceWorkerSetup from '@/views/AppServiceWorkerSetup.vue';
import AppPanelOnboarding from '@/views/AppPanelOnboarding.vue';
import { installFontLoadGuard } from '@/router/guards/font-load-guard.js';
import { installUnsupportedPlatformGuard } from '@/router/guards/unsupported-platform-guard.js';
import { installInitialServiceWorkerGuard } from '@/router/guards/initial-service-worker-guard.js';

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

  installFontLoadGuard(router);
  installUnsupportedPlatformGuard(router);
  installInitialServiceWorkerGuard(router);

  return router;
}
