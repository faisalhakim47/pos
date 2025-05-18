<script setup>
// @ts-check

import { onMounted, reactive, useCssModule } from 'vue';

import ServiceWorkerUrl from '/service-worker.js?worker&url';

import { sleep } from '@/tools/promise';
import { useLocation } from '@/composables/useLocation';
import { useI18n } from '@/i18n/i18n.js';

const style = useCssModule();
const { t } = useI18n();

const location = useLocation();

const swInstallation = reactive({
  isOnProgress: false,
  isInstalled: false,
  error: /** @type {unknown} */ (undefined),
});

onMounted(function () {
  navigator.serviceWorker.getRegistration('/')
    .then(function (registration) {
      if (registration) {
        swInstallation.isInstalled = true;
        swInstallation.isOnProgress = false;
        swInstallation.error = undefined;
      }
    })
    .catch(function (error) {
      swInstallation.isInstalled = false;
      swInstallation.isOnProgress = false;
      swInstallation.error = error;
    });
});

async function installServiceWorker() {
  try {
    swInstallation.isOnProgress = true;
    swInstallation.isInstalled = false;
    swInstallation.error = undefined;
    await navigator.serviceWorker.register(ServiceWorkerUrl, {
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
