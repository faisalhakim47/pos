<script setup>

import { onMounted } from 'vue';
import { useRoute } from 'vue-router';

import { useAsync } from '@/src/composables/use-async.js';
import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelCurrencyEditRoute } from '@/src/router/router.js';

const route = useRoute();
const { sql } = useDb();
const { t } = useI18n();

const currencyItem = useAsync(async function () {
  const currencyQueryRes = await sql`
    select
      code,
      name,
      symbol,
      decimal_places
    from currency
    where code = ${route.params?.currencyCode}
  `;
  if (currencyQueryRes[0].values.length !== 1) {
    throw new Error('Currency not found');
  }
  const row = currencyQueryRes[0].values[0];
  return {
    code: String(row[0]),
    name: String(row[1]),
    symbol: String(row[2]),
    decimalPlaces: Number(row[3]),
  };
});

onMounted(async function () {
  currencyItem.run();
});

</script>

<template>
  <main class="page">
    <header>
      <h1>{{ t('currencyItemTitle') }} {{ route.params?.currencyCode }}</h1>
    </header>
    <dl>
      <dt>{{ t('literal.code') }}</dt>
      <dd>{{ currencyItem.data?.code }}</dd>
      <dt>{{ t('literal.name') }}</dt>
      <dd>{{ currencyItem.data?.name }}</dd>
      <dt>{{ t('literal.symbol') }}</dt>
      <dd>{{ currencyItem.data?.symbol }}</dd>
      <dt>{{ t('literal.decimalPlaces') }}</dt>
      <dd>{{ currencyItem.data?.decimalPlaces }}</dd>
    </dl>
    <div>
      <RouterLink
        :to="{ name: AppPanelCurrencyEditRoute, params: { currencyCode: route.params?.currencyCode } }"
      >{{ t('currencyEditNavLabel') }}</RouterLink>
    </div>
  </main>
</template>
