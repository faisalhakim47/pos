<script setup>

import { onMounted } from 'vue';
import { useRoute } from 'vue-router';

import { MaterialSymbolArrowBackUrl } from '@/src/assets/material-symbols.js';
import SvgIcon from '@/src/components/SvgIcon.vue';
import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useHierarchicalNavigation } from '@/src/composables/use-hierarchical-navigation.js';
import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelCurrencyEditRoute, AppPanelCurrencyItemRoute } from '@/src/router/router.js';
import * as routes from '@/src/router/router.js';

const route = useRoute();
const { sql } = useDb();
const { t } = useI18n();
const { navigateToParent } = useHierarchicalNavigation();

function handleBackClick() {
  const currencyCode = route.params?.currencyCode;
  navigateToParent(AppPanelCurrencyItemRoute, routes, { currencyCode });
}

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
      <button type="button" @click="handleBackClick" aria-label="Back to List">
        <SvgIcon :src="MaterialSymbolArrowBackUrl" :alt="t('literal.back')" />
      </button>
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
