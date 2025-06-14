// @ts-check

import { useRouter } from 'vue-router';

/**
 * Creates a hierarchical navigation map
 * @param {Object} routes - Route symbols object
 * @returns {Map<symbol, symbol>}
 */
function createHierarchyMap(routes) {
  const {
    AppPanelAccountCreationRoute,
    AppPanelAccountEditRoute,
    AppPanelAccountItemRoute,
    AppPanelAccountListRoute,
    AppPanelCurrencyCreationRoute,
    AppPanelCurrencyEditRoute,
    AppPanelCurrencyItemRoute,
    AppPanelCurrencyListRoute,
    AppPanelDashboardRoute,
  } = routes;

  return new Map([
    // Account management hierarchy
    [AppPanelAccountListRoute, AppPanelDashboardRoute],
    [AppPanelAccountCreationRoute, AppPanelAccountListRoute],
    [AppPanelAccountItemRoute, AppPanelAccountListRoute],
    [AppPanelAccountEditRoute, AppPanelAccountItemRoute],

    // Currency management hierarchy
    [AppPanelCurrencyListRoute, AppPanelDashboardRoute],
    [AppPanelCurrencyCreationRoute, AppPanelCurrencyListRoute],
    [AppPanelCurrencyItemRoute, AppPanelCurrencyListRoute],
    [AppPanelCurrencyEditRoute, AppPanelCurrencyItemRoute],
  ]);
}

/**
 * Composable for hierarchical navigation
 * @returns {Object}
 */
export function useHierarchicalNavigation() {
  const router = useRouter();

  /**
   * Navigate to the hierarchical parent of the current route
   * This replaces the current entry in browser history to maintain hierarchical navigation
   * @param {symbol} currentRoute - The current route symbol
   * @param {Object} routes - Route symbols object
   * @param {Object} [currentParams] - Current route parameters
   */
  function navigateToParent(currentRoute, routes, currentParams = {}) {
    const hierarchyMap = createHierarchyMap(routes);
    const parentRoute = hierarchyMap.get(currentRoute);

    if (!parentRoute) {
      console.warn('No hierarchical parent found for route:', currentRoute);
      return;
    }

    // For item edit routes, we need to pass the item identifier to the parent
    /** @type {Record<string, any>} */
    let parentParams = {};
    if (currentRoute === routes.AppPanelAccountEditRoute && currentParams.accountCode) {
      parentParams = { accountCode: currentParams.accountCode };
    } else if (currentRoute === routes.AppPanelCurrencyEditRoute && currentParams.currencyCode) {
      parentParams = { currencyCode: currentParams.currencyCode };
    }

    // Replace current history entry to maintain hierarchical navigation
    router.replace({ name: parentRoute, params: parentParams });
  }

  /**
   * Get the hierarchical parent route for a given route
   * @param {symbol} route - The route symbol
   * @param {Object} routes - Route symbols object
   * @returns {symbol|undefined} The parent route symbol
   */
  function getParentRoute(route, routes) {
    const hierarchyMap = createHierarchyMap(routes);
    return hierarchyMap.get(route);
  }

  /**
   * Check if a route has a hierarchical parent
   * @param {symbol} route - The route symbol
   * @param {Object} routes - Route symbols object
   * @returns {boolean}
   */
  function hasParent(route, routes) {
    const hierarchyMap = createHierarchyMap(routes);
    return hierarchyMap.has(route);
  }

  return {
    navigateToParent,
    getParentRoute,
    hasParent,
  };
}
