<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { useCssModule } from 'vue';

import type { AppMessage } from '@/i18n/i18n.ts';

const style = useCssModule();
const { t } = useI18n<{ message: AppMessage }>({

});
</script>

<template>
  <div>
    <nav>
      <ul :class="style.menuGroupList">
        <li :class="style.menuGroupItem">
          <ul :class="style.submenuList">
            <li :class="style.submenuItem">
              <RouterLink :to="{ name: 'AppPanelDashboard' }">
                <span>{{ t('menuItemDashboardLabel') }}</span>
              </RouterLink>
            </li>
          </ul>
        </li>
        <li :class="style.menuGroupItem">
          <h2 :class="style.menuGroupLabel">{{ t('menuGroupInventoryLabel') }}</h2>
          <ul :class="style.submenuList">
            <li :class="style.submenuItem">
              <RouterLink :to="{ name: 'AppPanelProductList' }">
                {{ t('menuItemProductListLabel') }}
              </RouterLink>
            </li>
          </ul>
        </li>
      </ul>
    </nav>
  </div>
</template>

<style module>
.menuGroupList {
  list-style: none;
  margin: 0px;
  padding: 0px;
}

.menuGroupItem {
}

.menuGroupLabel {
  font-size: 1rem;
}

.submenuList {
  list-style: none;
  margin: 0px;
  padding: 0px;
}

.submenuItem {
}
</style>
