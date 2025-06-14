<script setup>
import { computed, reactive } from 'vue';
import { useRouter } from 'vue-router';

import { MaterialSymbolArrowBackUrl } from '@/src/assets/material-symbols.js';
import SvgIcon from '@/src/components/SvgIcon.vue';
import TextWithLoadingIndicator from '@/src/components/TextWithLoadingIndicator.vue';
import UnhandledError from '@/src/components/UnhandledError.vue';
import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelCurrencyListRoute } from '@/src/router/router.js';

const { sql } = useDb();
const { t } = useI18n();
const router = useRouter();

const currencyForm = reactive({
  code: '',
  name: '',
  symbol: '',
  decimals: 0,
});

const currencyCreator = useAsyncIterator(async function* () {
  try {
    yield 'creating';

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
        ${currencyForm.code.trim().toUpperCase()},
        ${currencyForm.name.trim()},
        ${currencyForm.symbol.trim()},
        ${Number(currencyForm.decimals)},
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
    try {
      await sql`rollback transaction`;
    } catch (rollbackError) {
      // Ignore rollback errors if no transaction is active
      console.warn('Rollback failed:', rollbackError);
    }
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
      <RouterLink :to="{ name: AppPanelCurrencyListRoute }" replace :aria-label="t('literal.back')">
        <SvgIcon :src="MaterialSymbolArrowBackUrl" :alt="t('literal.back')" />
      </RouterLink>
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
        v-model="currencyForm.code"
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
        v-model="currencyForm.name"
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
        v-model="currencyForm.symbol"
      />
      <label
        for="currencyDecimalsInput"
      >{{ t('currencyFormDecimalsLabel') }}</label>
      <input
        id="currencyDecimalsInput"
        name="currencyDecimals"
        :placeholder="t('currencyFormDecimalsPlaceholder')"
        type="number"
        min="0"
        required
        :disabled="disabledCurrencyForm"
        aria-describedby="currencyDecimalsHelpText"
        v-model.number="currencyForm.decimals"
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
