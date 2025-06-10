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

const currencyQuery = useAsyncIterator(async function* () {
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
      decimals
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
    decimals: Number(row[3]),
  };
});

watchPostEffect(function () {
  if (typeof currencyQuery.state === 'object') {
    const {
      currencyCodeInput,
      currencyNameInput,
      currencySymbolInput,
      currencyDecimalsInput,
    } = currencyFormInputs.value;
    currencyCodeInput.value = currencyQuery.state.code;
    currencyNameInput.value = currencyQuery.state.name;
    currencySymbolInput.value = currencyQuery.state.symbol;
    currencyDecimalsInput.value = String(currencyQuery.state.decimals);
  }
});

onMounted(currencyQuery.run);

const currencyUpdate = useAsyncIterator(async function* () {
  try {
    yield 'updating';

    const currencyCode = route.params?.currencyCode;
    if (typeof currencyCode !== 'string' || currencyCode.length < 3) {
      throw new Error('Invalid currency code');
    }

    const {
      currencyDecimalsInput,
      currencyNameInput,
      currencySymbolInput,
    } = currencyFormInputs.value;

    const currencyName = currencyNameInput.value.trim();
    const currencySymbol = currencySymbolInput.value.trim();
    const currencyDecimals = parseInt(currencyDecimalsInput.value.trim(), 10);

    await sql`begin transaction`;
    await sql`
      update currency set
        name = ${currencyName},
        symbol = ${currencySymbol},
        decimals = ${currencyDecimals}
      where code = ${currencyCode}
    `;
    await sql`commit transaction`;

    yield 'reporting';

    await Promise.all([
      currencyQuery.run(),
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
  return currencyQuery.state === 'fetching'
    || currencyUpdate.state === 'updating'
    || currencyUpdate.state === 'reporting';
});
</script>

<template>
  <main class="page">
    <header>
      <h1>{{ t('currencyEditTitle') }}</h1>
    </header>
    <form
      ref="currencyForm"
      @submit.prevent="currencyUpdate.run"
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
        ><TextWithLoadingIndicator
          :busy="currencyUpdate.state === 'updating'"
          :busy-label="t('currencyEditUpdateCtaProgressLabel')"
        >{{
          currencyUpdate.state === 'reporting'
            ? t('currencyEditUpdateCtaSuccessLabel')
            : t('currencyEditUpdateCtaLabel')
        }}</TextWithLoadingIndicator></button>
      </div>
      <UnhandledError :error="currencyQuery.error"/>
      <UnhandledError :error="currencyUpdate.error"/>
    </form>
  </main>
</template>
