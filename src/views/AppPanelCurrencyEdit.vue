<script setup>
import { computed, onMounted, ref, watchPostEffect } from 'vue';
import { useRoute } from 'vue-router';

import TextWithLoadingIndicator from '@/src/components/TextWithLoadingIndicator.vue';
import UnhandledError from '@/src/components/UnhandledError.vue';
import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { assertInstanceOf } from '@/src/tools/assertion.js';
import { sleep } from '@/src/tools/promise.js';

const { sql } = useDb();
const { t } = useI18n();
const route = useRoute();

const currencyUpdateForm = ref(null);

const currencyUpdateFormInputs = computed(function () {
  const form = currencyUpdateForm.value;
  assertInstanceOf(HTMLFormElement, form);
  const currencyCodeInput = form.elements.namedItem('currencyCode');
  const currencyNameInput = form.elements.namedItem('currencyName');
  const currencySymbolInput = form.elements.namedItem('currencySymbol');
  const currencyDecimalPlacesInput = form.elements.namedItem('currencyDecimalPlaces');
  assertInstanceOf(HTMLInputElement, currencyCodeInput);
  assertInstanceOf(HTMLInputElement, currencyNameInput);
  assertInstanceOf(HTMLInputElement, currencySymbolInput);
  assertInstanceOf(HTMLInputElement, currencyDecimalPlacesInput);
  return {
    currencyCodeInput,
    currencyNameInput,
    currencySymbolInput,
    currencyDecimalPlacesInput,
  };
});

const currencyFetcher = useAsyncIterator(async function* () {
  yield 'fetching';
  const currencyCode = route.params?.currencyCode;
  if (typeof currencyCode !== 'string' || currencyCode.length < 3) {
    throw new Error('Invalid currency code');
  }
  const currencyQueryRes = await sql`
    select
      code,
      name,
      symbol,
      decimal_places
    from currency
    where code = ${currencyCode}
  `;
  if (currencyQueryRes[0].values.length !== 1) {
    throw new Error('Currency not found');
  }
  const row = currencyQueryRes[0].values[0];
  yield {
    code: String(row[0]),
    name: String(row[1]),
    symbol: String(row[2]),
    decimalPlaces: Number(row[3]),
  };
});

watchPostEffect(function () {
  if (typeof currencyFetcher.state === 'object') {
    const {
      currencyCodeInput,
      currencyNameInput,
      currencySymbolInput,
      currencyDecimalPlacesInput,
    } = currencyUpdateFormInputs.value;
    currencyCodeInput.value = currencyFetcher.state.code;
    currencyNameInput.value = currencyFetcher.state.name;
    currencySymbolInput.value = currencyFetcher.state.symbol;
    currencyDecimalPlacesInput.value = String(currencyFetcher.state.decimalPlaces);
  }
});

onMounted(currencyFetcher.run);

const currencyUpdater = useAsyncIterator(async function* () {
  try {
    yield 'updating';

    const currencyCode = route.params?.currencyCode;
    if (typeof currencyCode !== 'string' || currencyCode.length < 3) {
      throw new Error('Invalid currency code');
    }

    const {
      currencyDecimalPlacesInput,
      currencyNameInput,
      currencySymbolInput,
    } = currencyUpdateFormInputs.value;

    const currencyName = currencyNameInput.value.trim();
    const currencySymbol = currencySymbolInput.value.trim();
    const currencyDecimalPlaces = parseInt(currencyDecimalPlacesInput.value.trim(), 10);

    await sql`begin transaction`;
    await sql`
      update currency set
        name = ${currencyName},
        symbol = ${currencySymbol},
        decimal_places = ${currencyDecimalPlaces}
      where code = ${currencyCode}
    `;
    await sql`commit transaction`;

    yield 'reporting';

    await Promise.all([
      currencyFetcher.run(),
      sleep(2000),
    ]);

    yield 'updated';
  }
  catch (error) {
    await sql`rollback transaction`;
    throw error;
  }
});

const disabledCurrencyForm = computed(function () {
  return currencyFetcher.state === 'fetching'
    || currencyUpdater.state === 'updating'
    || currencyUpdater.state === 'reporting';
});
</script>

<template>
  <main class="page">
    <header>
      <h1>{{ t('currencyEditTitle') }}</h1>
    </header>
    <form
      ref="currencyUpdateForm"
      @submit.prevent="currencyUpdater.run"
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
        disabled
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
        for="currencyDecimalPlacesInput"
      >{{ t('currencyFormDecimalPlacesLabel') }}</label>
      <input
        id="currencyDecimalPlacesInput"
        name="currencyDecimalPlaces"
        :placeholder="t('currencyFormDecimalPlacesPlaceholder')"
        type="number"
        min="0" required
        :disabled="disabledCurrencyForm"
        aria-describedby="currencyDecimalPlacesHelpText"
      />
      <p id="currencyDecimalPlacesHelpText">{{ t('currencyFormDecimalPlacesHelpText') }}</p>
      <div>
        <button
          type="submit"
          :disabled="disabledCurrencyForm"
        ><TextWithLoadingIndicator
          :busy="currencyUpdater.state === 'updating'"
          :busy-label="t('currencyEditUpdateCtaProgressLabel')"
        >{{
          currencyUpdater.state === 'reporting'
            ? t('currencyEditUpdateCtaSuccessLabel')
            : t('currencyEditUpdateCtaLabel')
        }}</TextWithLoadingIndicator></button>
      </div>
      <UnhandledError :error="currencyFetcher.error"/>
      <UnhandledError :error="currencyUpdater.error"/>
    </form>
  </main>
</template>
