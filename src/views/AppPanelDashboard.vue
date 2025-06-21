<script setup>
import { useI18n } from '@/src/i18n/i18n.js';

const { t } = useI18n();
</script>

<template>
  <main class="page">
    <header>
      <h1>{{ t('dashboardTitle') }}</h1>
    </header>
    <p>TODO: Implement Dashboard</p>
  </main>
</template>
