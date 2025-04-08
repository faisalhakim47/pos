<script setup lang="ts">
import { reactive, useCssModule } from 'vue';
import { useI18n } from 'vue-i18n';

import type { AppMessage } from '@/i18n/i18n.ts';
import { sleep } from '@/tools/promise.ts';

const style = useCssModule();
const { t } = useI18n<{ message: AppMessage }>();

const swInstallation = reactive({
  isOnProgress: false,
  isInstalled: false,
  error: undefined as unknown,
});

async function installServiceWorker() {
  try {
    swInstallation.isOnProgress = true;
    swInstallation.isInstalled = false;
    swInstallation.error = undefined;
    await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/',
      type: 'module',
      updateViaCache: 'none',
    });
    await navigator.serviceWorker.ready;
    await sleep(1000);
    window.location.reload();
  }
  catch (error) {
    swInstallation.error = error;
  }
  finally {
    swInstallation.isOnProgress = false;
  }
}
</script>

<template>
  <div :class="style.container">
    <h1>{{ t('onboardingTitle') }}</h1>
    <p>{{ t('onboardingSubtitle') }}</p>
    <div :class="style.swInstallationAction">
      <button
        type="button"
        @click="installServiceWorker()"
      >{{ swInstallation.isInstalled ? t('onboardingSwInstallationCtaCompleted') : t('onboardingSwInstallationCta') }}</button>
      <span v-if="swInstallation.isOnProgress">{{ t('onboardingSwInstallationProgressLabel') }}</span>
    </div>
  </div>
</template>

<style module>
.container {
  display: block flow-root;
  padding: 1rem;
  max-width: var(--app-recommended-width);
}

.swInstallationAction {
  display: flex;
  align-items: center;
  gap: 1rem;
}
</style>
