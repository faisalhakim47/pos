<script setup lang="ts">
import { computed, defineProps, onMounted, reactive } from 'vue';
import { useI18n } from 'vue-i18n';

import type { AppI18a } from '@/i18n/i18n.ts';

const props = defineProps({
  isOpen: { type: Boolean, default: false },
});

const { t } = useI18n<AppI18a>();

const installationState = reactive({
  isReady: false,
  isOnProgress: false,
  isInstalled: undefined as boolean | undefined,
  error: undefined as unknown,
});

onMounted(async function () {
  try {
    installationState.isReady = false;
    installationState.isOnProgress = true;
    const registration = await navigator.serviceWorker.getRegistration('/');
    installationState.isInstalled = !(registration instanceof ServiceWorkerRegistration);
  }
  catch (error) {
    installationState.error = error;
  }
  finally {
    installationState.isOnProgress = false;
    installationState.isReady = true;
  }
});

const disabledInstallationCta = computed(function () {
  return !installationState.isReady || installationState.isOnProgress;
});

const installationCtaLabel = computed(function () {
  if (installationState.isOnProgress) {
    return t('serviceWorkerInstallationCtaInProgress');
  }
  if (installationState.isInstalled) {
    return t('serviceWorkerInstallationCtaInstalled');
  }
  if (installationState.error) {
    return t('serviceWorkerInstallationCtaError');
  }
  return t('serviceWorkerInstallationCta');
});

async function install() {

}
</script>

<template>
  <dialog :open="props.isOpen">
    <div class="dialog-container">
      <header class="dialog-header">
        {{ t('serviceWorkerInstallationTitle') }}
      </header>
      <section class="dialog-content">
        {{ t ('serviceWorkerInstallationSubtitle') }}
      </section>
      <footer class="dialog-footer">
        <button
          type="button"
          :disabled="disabledInstallationCta"
          @click="install"
        >{{ installationCtaLabel }}</button>
      </footer>
    </div>
  </dialog>
</template>
