<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { computed, reactive, useCssModule } from 'vue';

import { assertInstanceOf } from '../../public/service-worker/tools/assertion.js';

import type { AppI18a } from '@/i18n/i18n.ts';
import TextWithLoadingIndicator from '@/components/TextWithLoadingIndicator.vue';

const style = useCssModule();
const { t } = useI18n<AppI18a>();

const submission = reactive({
  action: undefined as 'open' | 'new' | undefined,
  error: undefined as unknown,
});

const ctaDisabled = computed(function () {
  return submission.action !== undefined;
});

async function handleCtaSubmission(event: Event) {
  try {
    submission.action = undefined;
    submission.error = undefined;
    assertInstanceOf(SubmitEvent, event, 'Expect event to be a SubmitEvent');
    const submitter = event.submitter;
    assertInstanceOf(HTMLButtonElement, submitter, 'Expect target to be a HTMLButtonElement');
    const action = submitter.value as 'open' | 'new';
    submission.action = action;
    if (action === 'open') await openFile();
    else if (action === 'new') await newFile();
    else throw new Error(`Unknown action: ${action}`);
  }
  catch (error) {
    console.debug('Error handling CTA submission:', error);
    submission.error = error;
  }
  finally {
    submission.action = undefined;
  }
}

async function newFile() {
  await new Promise(function (resolve) {
    setTimeout(function () {
      resolve(undefined);
    }, 200000);
  });
}

async function openFile() {
  alert('not implemented');
  throw new Error('not implemented');
}
</script>

<template>
  <main>
    <form :class="style.content" @submit.prevent="handleCtaSubmission">
      <h1>{{ t('onboardingTitle') }}</h1>
      <p>{{ t('onboardingSubtitle') }}</p>
      <div :class="style.buttonGroup">
        <button
          type="submit"
          name="action"
          value="open"
          :disabled="ctaDisabled"
        >
          <TextWithLoadingIndicator
            :busy="submission.action === 'open'"
            :busy-label="t('onboardingOpenFileCtaProgressLabel')"
          >{{ t('onboardingOpenFileCtaDefaultLabel') }}</TextWithLoadingIndicator>
        </button>
        <button
          type="submit"
          name="action"
          value="new"
          :disabled="ctaDisabled"
        >
          <TextWithLoadingIndicator
            :busy="submission.action === 'new'"
            :busy-label="t('onboardingNewFileCtaProgressLabel')"
          >{{ t('onboardingNewFileCtaDefaultLabel') }}</TextWithLoadingIndicator>
        </button>
      </div>
    </form>
  </main>
</template>

<style module scoped>
main {
  height: 100%;
}
.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.buttonGroup {
  display: flex;
  gap: 1rem;
}
</style>
