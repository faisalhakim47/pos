<script setup>
import { useCssModule } from 'vue';
import { RouterView, RouterLink } from 'vue-router';

import { MaterialSymbolAccountUrl, MaterialSymbolDashboardUrl, MaterialSymbolUniversalCurrencyAltUrl } from '@/src/assets/material-symbols.js';
import SvgIcon from '@/src/components/SvgIcon.vue';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelAccountListRoute, AppPanelCurrencyListRoute, AppPanelDashboardRoute } from '@/src/router/router.js';

const { t } = useI18n();
const style = useCssModule();
</script>

<template>
  <div :class="style.container">
    <aside :class="style.sidebar">
      <nav>
        <ul :class="style.sidebarMenuList">
          <li :class="style.sidebarMenuItem">
            <RouterLink :to="{ name: AppPanelDashboardRoute }">
              <SvgIcon :src="MaterialSymbolDashboardUrl" :alt="t('menuItemDashboardLabel')" />
            </RouterLink>
          </li>
          <li :class="style.sidebarMenuItem">
            <RouterLink :to="{ name: AppPanelCurrencyListRoute }">
              <SvgIcon :src="MaterialSymbolUniversalCurrencyAltUrl" :alt="t('menuItemCurrencyListLabel')" />
            </RouterLink>
          </li>
          <li :class="style.sidebarMenuItem">
            <RouterLink :to="{ name: AppPanelAccountListRoute }">
              <SvgIcon :src="MaterialSymbolAccountUrl" :alt="t('menuItemAccountLabel')" />
            </RouterLink>
          </li>
        </ul>
      </nav>
    </aside>
    <div :class="style.content">
      <RouterView></RouterView>
    </div>
  </div>
</template>

<style module>
.container {
  display: grid;
  grid-template-columns: 56px 1fr;
  grid-template-rows: 1fr;
  grid-template-areas: "sidebar content";
  height: 100%;
  width: 100%;
  max-width: 1368px;
  margin: 0 auto;
}

.sidebar {
  grid-area: sidebar;
  padding: 8px 0;
}

.sidebarMenuList {
  display: flex;
  flex-direction: column;
  gap: 2px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.sidebarMenuItem {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 40px;
  width: 56px;
}

.sidebarMenuItem a {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 500;
  background-color: var(--app-btnflat-default-bg-color);
  color: var(--app-btnflat-default-text-color);
  transition-duration: 100ms;
  transition-property: background-color, color;
}

@media (prefers-reduced-motion) {
  .sidebarMenuItem a {
    transition-duration: 0ms;
  }
}

.sidebarMenuItem a:hover {
  background-color: var(--app-btnflat-hover-bg-color);
  color: var(--app-btnflat-hover-fg-color);
}

.sidebarMenuItem a:active {
  background-color: var(--app-btnflat-active-bg-color);
  color: var(--app-btnflat-active-fg-color);
}

.sidebarMenuItem a:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--app-default-focus-outline-color);
}

.sidebarMenuItem a img {
  width: 30px;
  height: 30px;
}

.sidebarMenuItem a span {
  font-size: 0.75em;
}

.content {
  grid-area: content;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-slate-200) transparent;
}
</style>
