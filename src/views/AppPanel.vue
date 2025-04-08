<script setup lang="ts">
import { useCssModule } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterView } from 'vue-router';

import type { AppMessage } from '@/i18n/i18n.ts';

const { t } = useI18n<{ message: AppMessage }>();
const style = useCssModule();
</script>

<template>
  <div :class="style.container">
    <header :class="style.header">
      <h1 :class="style.headerTitle">{{ t('appBrand') }}</h1>
    </header>
    <div :class="style.content">
      <RouterView></RouterView>
    </div>
  </div>
</template>

<style module>
.container {
  display: grid;
  grid-template-columns: 100px 1fr;
  grid-template-rows: 100px 1fr;
  grid-template-areas:
    "header header"
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
  height: 100px;
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

.content {
  grid-area: content;
}
</style>
