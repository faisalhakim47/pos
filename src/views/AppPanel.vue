<script setup>
import { useCssModule } from 'vue';
import { RouterView, RouterLink } from 'vue-router';

import MaterialSymbolDashboard from '@/assets/material-symbols/dashboard_24dp_E3E3E3_FILL1_wght400_GRAD0_opsz24.svg';
import { useI18n } from '@/i18n/i18n.js';

const { t } = useI18n();
const style = useCssModule();
</script>

<template>
  <div :class="style.container">
    <header :class="style.header">
      <h1 :class="style.headerTitle">{{ t('appBrand') }}</h1>
    </header>
    <aside :class="style.sidebar">
      <nav>
        <ul :class="style.sidebarMenuList">
          <li :class="style.sidebarMenuItem">
            <RouterLink :to="{ name: 'AppPanelDashboard' }">
              <img :src="MaterialSymbolDashboard" :alt="t('menuItemDashboardLabel')" />
              <span>{{ t('menuItemDashboardLabel') }}</span>
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
  grid-template-columns: 100px 1fr;
  grid-template-rows: 64px 1fr;
  grid-template-areas:
    "header content"
    "sidebar content";
  height: 100%;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
}

.header {
  grid-area: header;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 64px;
}

.headerTitle {
  font-size: 2rem;
  font-weight: bold;
  padding: 0;
  margin: 0;
}

.headerDescription {
  font-size: 1rem;
  margin: 0;
}

.sidebar {
  grid-area: sidebar;
}

.sidebarMenuList {
  list-style: none;
  margin: 0;
  padding: 0;
}

.sidebarMenuItem {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 72px;
  width: 100px;
}

.sidebarMenuItem a {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
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
  box-shadow: 0 0 0 3px var(--app-default-focus-outline-color);
}

.sidebarMenuItem a img {
  width: 32px;
  height: 32px;
}

.sidebarMenuItem a span {
  font-size: 0.8em;
}

.content {
  grid-area: content;
}
</style>
