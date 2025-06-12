<script setup>
import { onMounted } from 'vue';
import { RouterLink } from 'vue-router';

import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useFormatter } from '@/src/context/formatter.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelAccountCreationRoute, AppPanelAccountItemRoute } from '@/src/router/router.js';

const { t } = useI18n();
const db = useDb();
const formatter = useFormatter();

const accountListQuery = useAsyncIterator(async function* () {
  yield 'fetching';
  const accountQueryRes = await db.sql`
    select
      account.code,
      account.name,
      account.account_type_name,
      account.balance,
      currency.code,
      currency.symbol,
      currency.decimals
    from account
    join currency on currency.code = account.currency_code
    order by account.code asc
  `;
  yield accountQueryRes[0].values.map(function (row) {
    return {
      code: Number(row[0]),
      name: String(row[1]),
      accountTypeName: String(row[2]),
      balance: Number(row[3]),
      currencyCode: String(row[4]),
      currencySymbol: String(row[5]),
      currencyDecimals: Number(row[6]),
    };
  });
});

onMounted(accountListQuery.run);
</script>

<template>
  <main class="page">
    <header>
      <h1>{{ t('accountListTitle') }}</h1>
      <nav>
        <ul>
          <li>
            <RouterLink :to="{ name: AppPanelAccountCreationRoute }">{{ t('accountCreationNavLabel') }}</RouterLink>
          </li>
        </ul>
      </nav>
    </header>
    <table>
      <thead>
        <tr class="sticky">
          <th style="text-align: center; width: 128px;">{{ t('literal.code') }}</th>
          <th style="text-align: center; width: 160px;">{{ t('literal.type') }}</th>
          <th style="text-align: left;">{{ t('literal.name') }}</th>
          <th style="text-align: center; width: 100px;">{{ t('literal.currency') }}</th>
          <th style="text-align: right; width: 200px;">{{ t('literal.balance') }}</th>
        </tr>
      </thead>
      <tbody v-if="Array.isArray(accountListQuery.state)">
        <tr v-for="account in accountListQuery.state" :key="account.code">
          <td style="text-align: center; width: 128px;">
            <RouterLink
              :to="{
                name: AppPanelAccountItemRoute,
                params: { accountCode: account.code }
              }"
              :title="`View account ${account.code}`"
            >{{ account.code }}</RouterLink>
          </td>
          <td style="text-align: center; width: 160px;">{{ t(`literal.${account.accountTypeName}`) }}</td>
          <td style="text-align: left;">{{ account.name }}</td>
          <td style="text-align: center; width: 100px;">{{ account.currencyCode }}</td>
          <td style="text-align: right; width: 200px;">
            {{ account.currencySymbol }}
            {{ formatter.formatNumber(account.balance) }}
          </td>
        </tr>
      </tbody>
      <tbody v-if="accountListQuery.state === 'fetching'">
        <tr>
          <td colspan="5" style="text-align: center;">{{ t('literal.fetching') }}</td>
        </tr>
      </tbody>
    </table>
  </main>
</template>

