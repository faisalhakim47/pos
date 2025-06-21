<script setup>
import { computed, onMounted, reactive } from 'vue';
import { useRoute } from 'vue-router';

import { MaterialSymbolArrowBackUrl } from '@/src/assets/material-symbols.js';
import SvgIcon from '@/src/components/svg-icon.vue';
import TextWithLoadingIndicator from '@/src/components/text-with-loading-indicator.vue';
import UnhandledError from '@/src/components/unhandled-error.vue';
import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelCurrencyItemRoute } from '@/src/router/router.js';
import { sleep } from '@/src/tools/promise.js';

const { sql } = useDb();
const { t } = useI18n();
const route = useRoute();

const currencyCode = computed(function () {
  return route.params?.currencyCode;
});

const currencyForm = reactive({
  code: '',
  name: '',
  symbol: '',
  decimals: 0,
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
  currencyForm.code = String(row[0]);
  currencyForm.name = String(row[1]);
  currencyForm.symbol = String(row[2]);
  currencyForm.decimals = Number(row[3]);
  yield { ...currencyForm };
});

onMounted(currencyQuery.run);

const currencyUpdate = useAsyncIterator(async function* () {
  try {
    yield 'updating';

    const currencyCode = route.params?.currencyCode;
    if (typeof currencyCode !== 'string' || currencyCode.length < 3) {
      throw new Error('Invalid currency code');
    }

    await sql`begin transaction`;
    await sql`
      update currency set
        name = ${currencyForm.name.trim()},
        symbol = ${currencyForm.symbol.trim()},
        decimals = ${Number(currencyForm.decimals)}
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
      <RouterLink :to="{ name: AppPanelCurrencyItemRoute, params: { currencyCode } }" replace :aria-label="t('literal.back')">
        <svg-icon :src="MaterialSymbolArrowBackUrl" :alt="t('literal.back')" />
      </RouterLink>
      <h1>{{ t('currencyEditTitle') }}</h1>
    </header>
    <form
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
        :value="currencyForm.code"
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
        min="0" required
        :disabled="disabledCurrencyForm"
        aria-describedby="currencyDecimalsHelpText"
        v-model.number="currencyForm.decimals"
      />
      <p id="currencyDecimalsHelpText">{{ t('currencyFormDecimalsHelpText') }}</p>
      <div>
        <button
          type="submit"
          :disabled="disabledCurrencyForm"
        ><text-with-loading-indicator
          :busy="currencyUpdate.state === 'updating'"
          :busy-label="t('currencyEditUpdateCtaProgressLabel')"
        >{{
          currencyUpdate.state === 'reporting'
            ? t('currencyEditUpdateCtaSuccessLabel')
            : t('currencyEditUpdateCtaLabel')
        }}</text-with-loading-indicator></button>
      </div>
      <unhandled-error :error="currencyQuery.error"/>
      <unhandled-error :error="currencyUpdate.error"/>
    </form>
  </main>
</template>
