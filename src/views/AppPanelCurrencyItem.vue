<script setup>

import { onMounted } from 'vue';
import { useRoute } from 'vue-router';

import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelCurrencyEditRoute } from '@/src/router/router.js';

const route = useRoute();
const { sql } = useDb();
const { t } = useI18n();

const currencyFetcher = useAsyncIterator(async function* () {
  yield undefined;
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
  return {
    code: String(row[0]),
    name: String(row[1]),
    symbol: String(row[2]),
    decimals: Number(row[3]),
  };
});

onMounted(currencyFetcher.run);
</script>

<template>
  <main class="page">
    <header>
      <h1>{{ t('currencyItemTitle') }} {{ route.params?.currencyCode }}</h1>
    </header>
    <dl>
      <dt>{{ t('literal.code') }}</dt>
      <dd>{{ currencyFetcher.state?.code }}</dd>
      <dt>{{ t('literal.name') }}</dt>
      <dd>{{ currencyFetcher.state?.name }}</dd>
      <dt>{{ t('literal.symbol') }}</dt>
      <dd>{{ currencyFetcher.state?.symbol }}</dd>
      <dt>{{ t('literal.decimals') }}</dt>
      <dd>{{ currencyFetcher.state?.decimals }}</dd>
    </dl>
    <div>
      <RouterLink
        :to="{ name: AppPanelCurrencyEditRoute, params: { currencyCode: currencyFetcher.state?.code } }"
      >{{ t('currencyEditNavLabel') }}</RouterLink>
    </div>
  </main>
</template>
