<script setup>
import { onMounted, reactive } from 'vue';
import { RouterLink } from 'vue-router';

import { MaterialSymbolDashboardUrl } from '@/src/assets/material-symbols.js';
import SvgIcon from '@/src/components/SvgIcon.vue';
import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelDashboardRoute } from '@/src/router/router.js';

const { t } = useI18n();
const db = useDb();

const state = reactive({
  accounts: [{
    code: 0,
    name: '',
    accountTypeName: '',
    balance: 0,
    currencyCode: '',
    currencySymbol: '',
  }].slice(1),
});

onMounted(async function () {
  const accountQueryRes = await db.sql`
    select
      account.code,
      account.name,
      account.account_type_name,
      account.balance,
      currency.code,
      currency.symbol
    from account
    join currency on currency.code = account.currency_code
    order by account.code asc
  `;
  state.accounts = accountQueryRes[0].values.map(function (row) {
    return {
      code: Number(row[0]),
      name: String(row[1]),
      accountTypeName: String(row[2]),
      balance: Number(row[3]),
      currencyCode: String(row[4]),
      currencySymbol: String(row[5]),
    };
  });
});
</script>

<template>
  <main class="page">
    <header>
      <h1>{{ t('accountListTitle') }}</h1>
    </header>
    <table>
      <thead>
        <tr class="sticky">
          <th style="text-align: center; width: 128px;">{{ t('literal.code') }}</th>
          <th style="text-align: center; width: 160px;">{{ t('literal.type') }}</th>
          <th style="text-align: left;">{{ t('literal.name') }}</th>
          <th style="text-align: right; width: 200px;">{{ t('literal.balance') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="account in state.accounts" :key="account.code">
          <td style="text-align: center; width: 128px;">{{ account.code }}</td>
          <td style="text-align: center; width: 160px;">{{ t(`literal.${account.accountTypeName}`) }}</td>
          <td style="text-align: left;">{{ account.name }}</td>
          <td style="text-align: right; width: 200px;">{{ account.currencySymbol }}{{ account.balance }}</td>
        </tr>
      </tbody>
    </table>
  </main>
</template>

