<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';

import UnhandledError from '@/src/components/UnhandledError.vue';
import { useAsync } from '@/src/composables/use-async.js';
import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelCurrencyListRoute } from '@/src/router/router.js';
import { assertInstanceOf } from '@/src/tools/assertion.js';

const { sql } = useDb();
const { t } = useI18n();
const router = useRouter();

const currencyCreationHandler = useAsync(async function (event) {
  assertInstanceOf(Event, event);

  event.preventDefault();
  assertInstanceOf(HTMLFormElement, event.target);

  const currencyCodeInput = event.target.elements.namedItem('currencyCode');
  const currencyNameInput = event.target.elements.namedItem('currencyName');
  const currencySymbolInput = event.target.elements.namedItem('currencySymbol');
  const currencyDecimalsInput = event.target.elements.namedItem('currencyDecimals');

  assertInstanceOf(HTMLInputElement, currencyCodeInput);
  assertInstanceOf(HTMLInputElement, currencyNameInput);
  assertInstanceOf(HTMLInputElement, currencySymbolInput);
  assertInstanceOf(HTMLInputElement, currencyDecimalsInput);

  const currencyCode = currencyCodeInput.value.trim().toUpperCase();
  const currencyName = currencyNameInput.value.trim();
  const currencySymbol = currencySymbolInput.value.trim();
  const currencyDecimals = parseInt(currencyDecimalsInput.value.trim(), 10);

  try {
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

const disabledCurrencyCreationForm = computed(function () {
  return currencyCreationHandler.isLoading;
});

</script>

<template>
  <main class="page">
    <header>
      <h1>{{ t('currencyCreationTitle') }}</h1>
    </header>
    <form
      @submit.prevent="currencyCreationHandler.run"
      :aria-disabled="disabledCurrencyCreationForm"
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
        :disabled="disabledCurrencyCreationForm"
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
        :disabled="disabledCurrencyCreationForm"
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
        :disabled="disabledCurrencyCreationForm"
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
        :disabled="disabledCurrencyCreationForm"
        aria-describedby="currencyDecimalsHelpText"
      />
      <p id="currencyDecimalsHelpText">{{ t('currencyFormDecimalsHelpText') }}</p>
      <div>
        <button
          type="submit"
          :disabled="disabledCurrencyCreationForm"
        >{{ t('currencyCreationSaveCtaLabel') }}</button>
      </div>
      <UnhandledError :error="currencyCreationHandler.error"/>
    </form>
  </main>
</template>
