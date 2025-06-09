<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import TextWithLoadingIndicator from '@/src/components/TextWithLoadingIndicator.vue';
import UnhandledError from '@/src/components/UnhandledError.vue';
import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelCurrencyListRoute } from '@/src/router/router.js';
import { assertInstanceOf } from '@/src/tools/assertion.js';

const { sql } = useDb();
const { t } = useI18n();
const router = useRouter();

const currencyForm = ref(null);

const currencyFormInputs = computed(function () {
  const form = currencyForm.value;
  assertInstanceOf(HTMLFormElement, form);
  const currencyCodeInput = form.elements.namedItem('currencyCode');
  const currencyNameInput = form.elements.namedItem('currencyName');
  const currencySymbolInput = form.elements.namedItem('currencySymbol');
  const currencyDecimalsInput = form.elements.namedItem('currencyDecimals');
  assertInstanceOf(HTMLInputElement, currencyCodeInput);
  assertInstanceOf(HTMLInputElement, currencyNameInput);
  assertInstanceOf(HTMLInputElement, currencySymbolInput);
  assertInstanceOf(HTMLInputElement, currencyDecimalsInput);
  return {
    currencyCodeInput,
    currencyNameInput,
    currencySymbolInput,
    currencyDecimalsInput,
  };
});

const currencyCreator = useAsyncIterator(async function* () {
  try {
    yield 'creating';

    const {
      currencyCodeInput,
      currencyNameInput,
      currencySymbolInput,
      currencyDecimalsInput,
    } = currencyFormInputs.value;

    const currencyCode = currencyCodeInput.value.trim().toUpperCase();
    const currencyName = currencyNameInput.value.trim();
    const currencySymbol = currencySymbolInput.value.trim();
    const currencyDecimals = parseInt(currencyDecimalsInput.value.trim(), 10);

    await sql`begin transaction`;
    const currencyCreationResult = await sql`
      insert into currency (
        code,
        name,
        symbol,
        decimals,
        is_functional_currency,
        is_active
      ) values (
        ${currencyCode},
        ${currencyName},
        ${currencySymbol},
        ${currencyDecimals},
        0,
        1
      )
      returning code, name, symbol, decimals
    `;
    if (currencyCreationResult[0].values.length !== 1) {
      throw new Error('Currency creation failed');
    }
    await sql`commit transaction`;

    await router.replace({ name: AppPanelCurrencyListRoute });
  }
  catch (error) {
    await sql`rollback transaction`;
    throw error;
  }
});

const disabledCurrencyForm = computed(function () {
  return currencyCreator.state === 'creating';
});

</script>

<template>
  <main class="page">
    <header>
      <h1>{{ t('currencyCreationTitle') }}</h1>
    </header>
    <form
      @submit.prevent="currencyCreator.run"
      :aria-disabled="disabledCurrencyForm"
      style="max-width: 480px;"
    >
      <label
        for="currencyCodeInput"
      >{{ t('currencyFormCodeLabel') }}</label>
      <input
        id="currencyCodeInput"
        name="currencyCode"
        :placeholder="t('currencyFormCodePlaceholder')"
        type="text"
        minlength="3"
        required
        :disabled="disabledCurrencyForm"
        style="text-transform: uppercase;"
      />
      <label
        for="currencyNameInput"
      >{{ t('currencyFormNameLabel') }}</label>
      <input
        id="currencyNameInput"
        name="currencyName"
        :placeholder="t('currencyFormNamePlaceholder')"
        type="text"
        required
        :disabled="disabledCurrencyForm"
      />
      <label
        for="currencySymbolInput"
      >{{ t('currencyFormSymbolLabel') }}</label>
      <input
        id="currencySymbolInput"
        name="currencySymbol"
        :placeholder="t('currencyFormSymbolPlaceholder')"
        type="text"
        required
        :disabled="disabledCurrencyForm"
      />
      <label
        for="currencyDecimalsInput"
      >{{ t('currencyFormDecimalsLabel') }}</label>
      <input
        id="currencyDecimalsInput"
        name="currencyDecimals"
        :placeholder="t('currencyFormDecimalsPlaceholder')"
        type="number"
        min="0" required
        :disabled="disabledCurrencyForm"
        aria-describedby="currencyDecimalsHelpText"
      />
      <p id="currencyDecimalsHelpText">{{ t('currencyFormDecimalsHelpText') }}</p>
      <div>
        <button
          type="submit"
          :disabled="disabledCurrencyForm"
        >
          <TextWithLoadingIndicator
            :busy="currencyCreator.state === 'creating'"
            :busy-label="t('currencyCreationSaveCtaProgressLabel')"
          >{{ t('currencyCreationSaveCtaLabel') }}</TextWithLoadingIndicator>
        </button>
      </div>
      <UnhandledError :error="currencyCreator.error"/>
    </form>
  </main>
</template>
