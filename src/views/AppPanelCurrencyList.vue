<script setup>
import { onMounted } from 'vue';
import { RouterLink } from 'vue-router';

import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelCurrencyCreationRoute, AppPanelCurrencyItemRoute } from '@/src/router/router.js';

const { t } = useI18n();
const db = useDb();

const currencyListFetcher = useAsyncIterator(async function* () {
  yield 'fetching';
  const accountQueryRes = await db.sql`
    select
      code,
      name,
      symbol,
      decimals
    from currency
    order by code asc
  `;
  yield accountQueryRes[0].values.map(function (row) {
    return {
      code: String(row[0]),
      name: String(row[1]),
      symbol: String(row[2]),
      decimals: Number(row[3]),
    };
  });
});

onMounted(currencyListFetcher.run);
</script>

<template>
  <main class="page">
    <header>
      <h1>{{ t('currencyListTitle') }}</h1>
      <nav>
        <ul>
          <li>
            <RouterLink :to="{ name: AppPanelCurrencyCreationRoute }">{{ t('currencyCreationNavLabel') }}</RouterLink>
          </li>
        </ul>
      </nav>
    </header>
    <table>
      <thead>
        <tr class="sticky">
          <th scope="col" style="text-align: center; width: 128px;">{{ t('literal.code') }}</th>
          <th scope="col" style="text-align: center; width: 128px;">{{ t('literal.symbol') }}</th>
          <th scope="col" style="text-align: left;">{{ t('literal.name') }}</th>
          <th scope="col" style="text-align: center; width: 128px;">{{ t('literal.decimals') }}</th>
        </tr>
      </thead>
      <tbody v-if="Array.isArray(currencyListFetcher.state)" >
        <tr v-for="currency in currencyListFetcher.state" :key="currency.code">
          <td style="text-align: center; width: 128px;">
            <RouterLink
              :to="{
                name: AppPanelCurrencyItemRoute,
                params: { currencyCode: currency.code }
              }"
              :title="`View currency with code ${currency.code}`"
            >{{ currency.code }}</RouterLink>
          </td>
          <td style="text-align: center; width: 128px;">{{ currency.symbol }}</td>
          <td style="text-align: left;">{{ currency.name }}</td>
          <td style="text-align: center; width: 128px;">{{ currency.decimals }}</td>
        </tr>
      </tbody>
    </table>
  </main>
</template>
