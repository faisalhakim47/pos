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
  const currencyDecimalPlacesInput = event.target.elements.namedItem('currencyDecimalPlaces');

  assertInstanceOf(HTMLInputElement, currencyCodeInput);
  assertInstanceOf(HTMLInputElement, currencyNameInput);
  assertInstanceOf(HTMLInputElement, currencySymbolInput);
  assertInstanceOf(HTMLInputElement, currencyDecimalPlacesInput);

  const currencyCode = currencyCodeInput.value.trim().toUpperCase();
  const currencyName = currencyNameInput.value.trim();
  const currencySymbol = currencySymbolInput.value.trim();
  const currencyDecimalPlaces = parseInt(currencyDecimalPlacesInput.value.trim(), 10);

  try {
    await sql`begin transaction`;
    const currencyCreationResult = await sql`
    insert into currency (
      code,
      name,
      symbol,
      decimal_places,
      is_functional_currency,
      is_active
    ) values (
      ${currencyCode},
      ${currencyName},
      ${currencySymbol},
      ${currencyDecimalPlaces},
      0,
      1
    )
    returning code, name, symbol, decimal_places
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
      <h1>Currency Creation</h1>
    </header>
    <form
      @submit.prevent="currencyCreationHandler.run"
      :aria-disabled="disabledCurrencyCreationForm"
      style="max-width: 480px;"
    >
      <label
        for="currencyCodeInput"
      >{{ t('currencyCreationCodeLabel') }}</label>
      <input
        id="currencyCodeInput"
        name="currencyCode"
        :placeholder="t('currencyCreationCodePlaceholder')"
        type="text"
        minlength="3"
        required
        :disabled="disabledCurrencyCreationForm"
        style="text-transform: uppercase;"
      />
      <label
        for="currencyNameInput"
      >{{ t('currencyCreationNameLabel') }}</label>
      <input
        id="currencyNameInput"
        name="currencyName"
        :placeholder="t('currencyCreationNamePlaceholder')"
        type="text"
        required
        :disabled="disabledCurrencyCreationForm"
      />
      <label
        for="currencySymbolInput"
      >{{ t('currencyCreationSymbolLabel') }}</label>
      <input
        id="currencySymbolInput"
        name="currencySymbol"
        :placeholder="t('currencyCreationSymbolPlaceholder')"
        type="text"
        required
        :disabled="disabledCurrencyCreationForm"
      />
      <label
        for="currencyDecimalPlacesInput"
      >{{ t('currencyCreationDecimalPlacesLabel') }}</label>
      <input
        id="currencyDecimalPlacesInput"
        name="currencyDecimalPlaces"
        :placeholder="t('currencyCreationDecimalPlacesPlaceholder')"
        type="number"
        min="0" required
        :disabled="disabledCurrencyCreationForm"
        aria-describedby="currencyDecimalPlacesHelpText"
      />
      <p id="currencyDecimalPlacesHelpText">{{ t('currencyCreationDecimalPlacesHelpText') }}</p>
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
