// @ts-check

import { createRouter, createWebHistory, useRoute } from 'vue-router';
import { watchEffect } from 'vue';

import { installDbRequiredGuard } from '@/src/router/guards/db-required-guard.js';
import { installUnsupportedPlatformGuard } from '@/src/router/guards/unsupported-platform-guard.js';
import { useDb } from '@/src/context/db.js';
import AppPanel from '@/src/views/AppPanel.vue';
import AppPanelAccountList from '@/src/views/AppPanelAccountList.vue';
import AppPanelDashboard from '@/src/views/AppPanelDashboard.vue';
import AppPanelOnboarding from '@/src/views/AppPanelOnboarding.vue';
import AppRoot from '@/src/views/AppRoot.vue';
import AppUnsupportedPlatform from '@/src/views/AppUnsupportedPlatform.vue';

export const AppPanelRoute = Symbol('AppPanel');
export const AppPanelAccountListRoute = Symbol('AppPanelAccountList');
export const AppPanelDashboardRoute = Symbol('AppPanelDashboard');
export const AppPanelOnboardingRoute = Symbol('AppPanelOnboarding');
export const AppRootRoute = Symbol('AppRoot');
export const AppUnsupportedPlatformRoute = Symbol('AppUnsupportedPlatform');

export const AppIndexRoute = Symbol('AppIndex');
export const AppPanelIndexRoute = Symbol('AppPanelIndex');

/** @template T @typedef {import('vue').Plugin<T>} Plugin */

/** @type {Plugin<unknown>} */
export const router = {
  install(app) {
    const router = createRouter({
      history: createWebHistory(import.meta.env.BASE_URL ?? '/'),
      routes: [
        {
          name: AppRootRoute,
          component: AppRoot,
          path: '',
          children: [
            { name: AppIndexRoute, path: '', redirect: { name: AppPanelIndexRoute, replace: true } },
            { name: AppUnsupportedPlatformRoute, component: AppUnsupportedPlatform, path: 'unsupported' },
            {
              name: AppPanelRoute,
              component: AppPanel,
              path: 'panel',
              children: [
                { name: AppPanelIndexRoute, path: '', redirect: { name: AppPanelOnboardingRoute, replace: true } },
                { name: AppPanelAccountListRoute, component: AppPanelAccountList, path: 'accounts' },
                { name: AppPanelDashboardRoute, component: AppPanelDashboard, path: 'dashboard' },
                { name: AppPanelOnboardingRoute, component: AppPanelOnboarding, path: 'onboarding' },
              ],
            },
          ],
        },
      ],
    });

    installUnsupportedPlatformGuard(app, router);
    installDbRequiredGuard(app, router);

    app.use(router);

    app.runWithContext(function () {
      const db = useDb();
      const route = useRoute();
      watchEffect(function () {
        if (db.isOpen && route.name === AppPanelOnboardingRoute) {
          router.push({ name: AppPanelDashboardRoute, replace: true });
        }
      });
    });
  },
};
