<script setup>
import { onMounted, reactive } from 'vue';
import { RouterLink } from 'vue-router';

import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelCurrencyCreationRoute, AppPanelCurrencyItemRoute } from '@/src/router/router.js';

const { t } = useI18n();
const db = useDb();

const state = reactive({
  currencies: [{
    code: '',
    name: '',
    symbol: '',
    decimalPlaces: 0,
  }].slice(1),
});

onMounted(async function () {
  const accountQueryRes = await db.sql`
    select
      code,
      name,
      symbol,
      decimal_places
    from currency
    order by code asc
  `;
  state.currencies = accountQueryRes[0].values.map(function (row) {
    return {
      code: String(row[0]),
      name: String(row[1]),
      symbol: String(row[2]),
      decimalPlaces: Number(row[3]),
    };
  });
});
</script>

<template>
  <main class="page">
    <header>
      <h1 style="font-size: 1.5rem;">{{ t('currencyListTitle') }}</h1>
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
          <th style="text-align: center; width: 128px;">{{ t('literal.code') }}</th>
          <th style="text-align: center; width: 128px;">{{ t('literal.symbol') }}</th>
          <th style="text-align: left;">{{ t('literal.name') }}</th>
          <th style="text-align: center; width: 128px;">{{ t('literal.decimalPlaces') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="currency in state.currencies" :key="currency.code">
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
          <td style="text-align: center; width: 128px;">{{ currency.decimalPlaces }}</td>
        </tr>
      </tbody>
    </table>
  </main>
</template>
