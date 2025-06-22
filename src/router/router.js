// @ts-check

import { watchEffect } from 'vue';
import { createRouter, createWebHistory, useRoute } from 'vue-router';

import { useDb } from '@/src/context/db.js';
import { installDbRequiredGuard } from '@/src/router/guards/db-required-guard.js';
import { installUnsupportedPlatformGuard } from '@/src/router/guards/unsupported-platform-guard.js';
import AppPanelOnboarding from '@/src/views/app-onboarding.vue';
import AppPanelAccountCreation from '@/src/views/app-panel-account-creation.vue';
import AppPanelAccountEdit from '@/src/views/app-panel-account-edit.vue';
import AppPanelAccountItem from '@/src/views/app-panel-account-item.vue';
import AppPanelAccountList from '@/src/views/app-panel-account-list.vue';
import AppPanelCurrencyCreation from '@/src/views/app-panel-currency-creation.vue';
import AppPanelCurrencyEdit from '@/src/views/app-panel-currency-edit.vue';
import AppPanelCurrencyItem from '@/src/views/app-panel-currency-item.vue';
import AppPanelCurrencyList from '@/src/views/app-panel-currency-list.vue';
import AppPanelDashboard from '@/src/views/app-panel-dashboard.vue';
import AppPanelFinanceStatementConfigEdit from '@/src/views/app-panel-finance-statement-config-edit.vue';
import AppPanelFinanceStatementConfigItem from '@/src/views/app-panel-finance-statement-config-item.vue';
import AppPanelJournalEntryCreation from '@/src/views/app-panel-journal-entry-creation.vue';
import AppPanelJournalEntryItem from '@/src/views/app-panel-journal-entry-item.vue';
import AppPanelJournalEntryList from '@/src/views/app-panel-journal-entry-list.vue';
import AppPanel from '@/src/views/app-panel.vue';
import AppRoot from '@/src/views/app-root.vue';
import AppUnsupportedPlatform from '@/src/views/app-unsupported-platform.vue';

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
export const AppPanelFinanceStatementConfigEditRoute = Symbol('AppPanelFinanceStatementConfigEdit');
export const AppPanelFinanceStatementConfigItemRoute = Symbol('AppPanelFinanceStatementConfigItem');
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
            { name: AppPanelFinanceStatementConfigEditRoute, component: AppPanelFinanceStatementConfigEdit, path: 'finance-statement-config/edit' },
            { name: AppPanelFinanceStatementConfigItemRoute, component: AppPanelFinanceStatementConfigItem, path: 'finance-statement-config' },
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
