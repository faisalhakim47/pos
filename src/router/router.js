// @ts-check

import { watchEffect } from 'vue';
import { createRouter, createWebHistory, useRoute } from 'vue-router';

import { useDb } from '@/src/context/db.js';
import { installDbRequiredGuard } from '@/src/router/guards/db-required-guard.js';
import { installUnsupportedPlatformGuard } from '@/src/router/guards/unsupported-platform-guard.js';
import AppPanelOnboarding from '@/src/views/AppOnboarding.vue';
import AppPanel from '@/src/views/AppPanel.vue';
import AppPanelAccountCreation from '@/src/views/AppPanelAccountCreation.vue';
import AppPanelAccountEdit from '@/src/views/AppPanelAccountEdit.vue';
import AppPanelAccountItem from '@/src/views/AppPanelAccountItem.vue';
import AppPanelAccountList from '@/src/views/AppPanelAccountList.vue';
import AppPanelCurrencyCreation from '@/src/views/AppPanelCurrencyCreation.vue';
import AppPanelCurrencyEdit from '@/src/views/AppPanelCurrencyEdit.vue';
import AppPanelCurrencyItem from '@/src/views/AppPanelCurrencyItem.vue';
import AppPanelCurrencyList from '@/src/views/AppPanelCurrencyList.vue';
import AppPanelDashboard from '@/src/views/AppPanelDashboard.vue';
import AppPanelJournalEntryCreation from '@/src/views/AppPanelJournalEntryCreation.vue';
import AppPanelJournalEntryItem from '@/src/views/AppPanelJournalEntryItem.vue';
import AppPanelJournalEntryList from '@/src/views/AppPanelJournalEntryList.vue';
import AppRoot from '@/src/views/AppRoot.vue';
import AppUnsupportedPlatform from '@/src/views/AppUnsupportedPlatform.vue';

/** @template T @typedef {import('vue').Plugin<T>} Plugin */
/** @typedef {import('vue-router').RouteRecordRaw} RouteRecordRaw */

export const AppOnboardingRoute = Symbol('AppPanelOnboarding');
export const AppPanelAccountCreationRoute = Symbol('AppPanelAccountCreation');
export const AppPanelAccountEditRoute = Symbol('AppPanelAccountEdit');
export const AppPanelAccountItemRoute = Symbol('AppPanelAccountItem');
export const AppPanelAccountListRoute = Symbol('AppPanelAccountList');
export const AppPanelCurrencyCreationRoute = Symbol('AppPanelCurrencyCreation');
export const AppPanelCurrencyEditRoute = Symbol('AppPanelCurrencyEdit');
export const AppPanelCurrencyItemRoute = Symbol('AppPanelCurrencyItem');
export const AppPanelCurrencyListRoute = Symbol('AppPanelCurrencyList');
export const AppPanelDashboardRoute = Symbol('AppPanelDashboard');
export const AppPanelJournalEntryCreationRoute = Symbol('AppPanelJournalEntryCreation');
export const AppPanelJournalEntryItemRoute = Symbol('AppPanelJournalEntryItem');
export const AppPanelJournalEntryListRoute = Symbol('AppPanelJournalEntryList');
export const AppPanelRoute = Symbol('AppPanel');
export const AppRootRoute = Symbol('AppRoot');
export const AppUnsupportedPlatformRoute = Symbol('AppUnsupportedPlatform');

export const AppIndexRoute = Symbol('AppIndex');
export const AppPanelIndexRoute = Symbol('AppPanelIndex');

/**
 * @return {RouteRecordRaw[]}
 */
function createRoutes() {
  return [
    {
      name: AppRootRoute,
      component: AppRoot,
      path: '',
      children: [
        { name: AppIndexRoute, path: '', redirect: { name: AppPanelIndexRoute, replace: true } },
        { name: AppOnboardingRoute, component: AppPanelOnboarding, path: 'onboarding' },
        { name: AppUnsupportedPlatformRoute, component: AppUnsupportedPlatform, path: 'unsupported' },
        {
          name: AppPanelRoute,
          component: AppPanel,
          path: 'panel',
          children: [
            { name: AppPanelIndexRoute, path: '', redirect: { name: AppOnboardingRoute, replace: true } },
            { name: AppPanelAccountCreationRoute, component: AppPanelAccountCreation, path: 'accounts/create' },
            { name: AppPanelAccountEditRoute, component: AppPanelAccountEdit, path: 'accounts/:accountCode/edit' },
            { name: AppPanelAccountItemRoute, component: AppPanelAccountItem, path: 'accounts/:accountCode' },
            { name: AppPanelAccountListRoute, component: AppPanelAccountList, path: 'accounts' },
            { name: AppPanelCurrencyCreationRoute, component: AppPanelCurrencyCreation, path: 'currencies/create' },
            { name: AppPanelCurrencyEditRoute, component: AppPanelCurrencyEdit, path: 'currencies/:currencyCode/edit' },
            { name: AppPanelCurrencyItemRoute, component: AppPanelCurrencyItem, path: 'currencies/:currencyCode' },
            { name: AppPanelCurrencyListRoute, component: AppPanelCurrencyList, path: 'currencies' },
            { name: AppPanelDashboardRoute, component: AppPanelDashboard, path: 'dashboard' },
            { name: AppPanelJournalEntryCreationRoute, component: AppPanelJournalEntryCreation, path: 'journal-entries/create' },
            { name: AppPanelJournalEntryItemRoute, component: AppPanelJournalEntryItem, path: 'journal-entries/:journalEntryRef' },
            { name: AppPanelJournalEntryListRoute, component: AppPanelJournalEntryList, path: 'journal-entries' },
          ],
        },
      ],
    },
  ];
}

/** @typedef {ReturnType<createRoutes>} RoutesDefinition */

/** @type {Plugin<unknown>} */
export const router = {
  install(app) {
    const router = createRouter({
      history: createWebHistory(import.meta.env.BASE_URL ?? '/'),
      routes: createRoutes(),
    });

    installUnsupportedPlatformGuard(app, router);
    installDbRequiredGuard(app, router);

    app.use(router);

    app.runWithContext(function () {
      const db = useDb();
      const route = useRoute();
      watchEffect(function () {
        if (db.isOpen && route.name === AppOnboardingRoute) {
          router.push({ name: AppPanelDashboardRoute, replace: true });
        }
      });
    });
  },
};
