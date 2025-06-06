import { createRouter, createWebHistory } from 'vue-router';

import AppRoot from '@/src/views/AppRoot.vue';
import AppPanel from '@/src/views/AppPanel.vue';
import AppPanelDashboard from '@/src/views/AppPanelDashboard.vue';
import AppUnsupportedPlatform from '@/src/views/AppUnsupportedPlatform.vue';
import AppPanelOnboarding from '@/src/views/AppPanelOnboarding.vue';
import { installUnsupportedPlatformGuard } from '@/src/router/guards/unsupported-platform-guard.js';

/** @type {import('vue').ObjectPlugin<unknown>} */
export const router = {
  install(app) {
    const router = createRouter({
      history: createWebHistory(import.meta.env.BASE_URL ?? '/'),
      routes: [
        {
          name: 'AppRoot',
          component: AppRoot,
          path: '',
          children: [
            { name: 'AppIndex', path: '', redirect: { name: 'AppPanelIndex', replace: true } },
            { name: 'AppUnsupportedPlatform', component: AppUnsupportedPlatform, path: 'unsupported' },
            {
              name: 'AppPanel',
              component: AppPanel,
              path: 'panel',
              children: [
                { name: 'AppPanelIndex', path: '', redirect: { name: 'AppPanelOnboarding', replace: true } },
                { name: 'AppPanelDashboard', component: AppPanelDashboard, path: 'dashboard' },
                { name: 'AppPanelOnboarding', component: AppPanelOnboarding, path: 'onboarding' },
              ],
            },
          ],
        },
      ],
    });

    installUnsupportedPlatformGuard(app, router);

    app.use(router);
  },
};
