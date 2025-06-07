<script setup>
import { onMounted, reactive, useCssModule } from 'vue';

import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';

const { t } = useI18n();
const db = useDb();
const style = useCssModule();

const state = reactive({
  accounts: [{
    code: 0,
    name: '',
    accountTypeName: '',
    balance: 0,
    currencyCode: '',
  }].slice(1),
});

onMounted(async function () {
  const accountQueryRes = await db.sql`
    select
      code,
      name,
      account_type_name,
      balance,
      currency_code
    from account
    order by code asc
  `;
  state.accounts = accountQueryRes[0].values.map(function (row) {
    return {
      code: Number(row[0]),
      name: String(row[1]),
      accountTypeName: String(row[2]),
      balance: Number(row[3]),
      currencyCode: String(row[4]),
    };
  });
});
</script>

<template>
  <div :class="style.container">
    <h1>{{ t('accountListTitle') }}</h1>
    <table :class="style.table">
      <thead>
        <tr>
          <th style="text-align: left;">Code</th>
          <th style="text-align: left;">Name</th>
          <th style="text-align: center;">Type</th>
          <th style="text-align: right;">Balance</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="account in state.accounts" :key="account.code">
          <td style="text-align: left;">{{ account.code }}</td>
          <td style="text-align: left;">{{ account.name }}</td>
          <td style="text-align: center;">{{ t(`literal.${account.accountTypeName}`) }}</td>
          <td style="text-align: right;">{{ account.balance }} <sub>{{ account.currencyCode }}</sub></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style module>
.container {
  padding: 16px;
}
.table {
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
.table > thead > tr > th,
.table > tbody > tr > td {
  padding: 4px 8px;
  border: 1px solid #ccc;
}
</style>
