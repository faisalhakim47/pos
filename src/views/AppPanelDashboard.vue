<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

import { AppPanelAccountListRoute } from '@/src/router/router.js';

const router = useRouter();

onMounted(function () {
  /** @todo implement dashboard */
  router.push({ name: AppPanelAccountListRoute, replace: true });
});
</script>

<template>
  <main>
    <h1>Dashboard</h1>
  </main>
</template>
