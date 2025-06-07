<script setup>
import { useCssModule, onMounted } from 'vue';
import { useRouter } from 'vue-router';

import { AppPanelAccountListRoute } from '@/src/router/router.js';

const router = useRouter();
const style = useCssModule();

onMounted(function () {
  /** @todo implement dashboard */
  router.push({ name: AppPanelAccountListRoute, replace: true });
});
</script>

<template>
  <div :class="style.container">
    <h1>Dashboard</h1>
  </div>
</template>

<style module>
.container {
  /* grid layout style here */
}
</style>
