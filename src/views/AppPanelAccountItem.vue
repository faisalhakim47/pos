<script setup>
import { computed, onMounted } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useFormatter } from '@/src/context/formatter.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelAccountEditRoute } from '@/src/router/router.js';

const { t } = useI18n();
const db = useDb();
const formatter = useFormatter();
const route = useRoute();

const accountCode = computed(function () {
  return parseInt(String(route.params.accountCode), 10);
});

// Fetch account details
const accountQuery = useAsyncIterator(async function* () {
  yield 'fetching';
  const result = await db.sql`
    select
      account.code,
      account.name,
      account.account_type_name,
      account.balance,
      currency.code as currency_code,
      currency.name as currency_name,
      currency.symbol as currency_symbol,
      currency.decimals
    from account
    join currency on currency.code = account.currency_code
    where account.code = ${accountCode.value}
  `;

  if (result[0].values.length === 0) {
    throw new Error('Account not found');
  }

  const row = result[0].values[0];
  yield {
    code: Number(row[0]),
    name: String(row[1]),
    accountTypeName: String(row[2]),
    balance: Number(row[3]),
    currencyCode: String(row[4]),
    currencyName: String(row[5]),
    currencySymbol: String(row[6]),
    currencyDecimals: Number(row[7]),
  };
});

onMounted(accountQuery.run);
</script>

<template>
  <main class="page">
    <header>
      <h1>{{ t('accountItemTitle') }} {{ accountCode }}</h1>
    </header>

    <div v-if="accountQuery.state === 'fetching'">
      {{ t('literal.fetching') }}
    </div>

    <div v-else-if="accountQuery.state && typeof accountQuery.state === 'object'">
      <dl>
        <dt>{{ t('literal.code') }}</dt>
        <dd>{{ accountQuery.state.code }}</dd>
        <dt>{{ t('literal.name') }}</dt>
        <dd>{{ accountQuery.state.name }}</dd>
        <dt>{{ t('literal.type') }}</dt>
        <dd>{{ t(`literal.${accountQuery.state.accountTypeName}`) }}</dd>
        <dt>{{ t('literal.currency') }}</dt>
        <dd>{{ accountQuery.state.currencyCode }} - {{ accountQuery.state.currencyName }}</dd>
        <dt>{{ t('literal.balance') }}</dt>
        <dd>
          {{ accountQuery.state.currencySymbol }}{{ formatter.formatNumber(accountQuery.state.balance / (10 ** accountQuery.state.currencyDecimals)) }}
        </dd>
      </dl>
      <div>
        <RouterLink
          :to="{ name: AppPanelAccountEditRoute, params: { accountCode: accountQuery.state.code } }"
        >{{ t('accountEditNavLabel') }}</RouterLink>
      </div>
    </div>
  </main>
</template>
