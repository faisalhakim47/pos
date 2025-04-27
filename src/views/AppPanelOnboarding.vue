<script setup>
import { computed, reactive, useCssModule } from 'vue';

import TextWithLoadingIndicator from '@/components/TextWithLoadingIndicator.vue';
import { useI18n } from '@/i18n/i18n.js';
import { assertInstanceOf } from '@/tools/assertion.js';

const style = useCssModule();
const { t } = useI18n();

const submission = reactive({
  action: /** @type {'open' | 'new' | undefined} */ (undefined),
  error: /** @type {unknown} */ (undefined),
});

const ctaDisabled = computed(function () {
  return submission.action !== undefined;
});

/**
 * @param {unknown} event
 */
async function handleCtaSubmission(event) {
  try {
    submission.action = undefined;
    submission.error = undefined;
    assertInstanceOf(SubmitEvent, event, 'Expect event to be a SubmitEvent');
    const submitter = event.submitter;
    assertInstanceOf(HTMLButtonElement, submitter, 'Expect target to be a HTMLButtonElement');
    const action = /** @type {'open' | 'new'} */ (submitter.value);
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
