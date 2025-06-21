<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { MaterialSymbolArrowBackUrl } from '@/src/assets/material-symbols.js';
import SvgIcon from '@/src/components/svg-icon.vue';
import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelAccountItemRoute } from '@/src/router/router.js';

const { t } = useI18n();
const db = useDb();
const router = useRouter();
const route = useRoute();

const accountCode = computed(function () {
  return parseInt(String(route.params.accountCode), 10);
});

const accountName = ref('');
const accountType = ref('');
const currencyCode = ref('');

// Fetch account details
const accountQuery = useAsyncIterator(async function* () {
  yield 'fetching';
  const result = await db.sql`
    select
      account.code,
      account.name,
      account.account_type_name,
      account.currency_code
    from account
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
    currencyCode: String(row[3]),
  };
});

// Fetch account types
const accountTypesQuery = useAsyncIterator(async function* () {
  yield 'fetching';
  const result = await db.sql`
    select name, normal_balance
    from account_type
    order by name asc
  `;
  yield result[0].values.map(function (row) {
    return {
      name: String(row[0]),
      normalBalance: String(row[1]),
    };
  });
});

// Fetch currencies
const currenciesQuery = useAsyncIterator(async function* () {
  yield 'fetching';
  const result = await db.sql`
    select code, name, symbol
    from currency
    where is_active = 1
    order by code asc
  `;
  yield result[0].values.map(function (row) {
    return {
      code: String(row[0]),
      name: String(row[1]),
      symbol: String(row[2]),
    };
  });
});

// Update account
const updateAccountQuery = useAsyncIterator(async function* () {
  yield 'saving';

  await db.sql`
    update account
    set name = ${accountName.value},
        account_type_name = ${accountType.value},
        currency_code = ${currencyCode.value}
    where code = ${accountCode.value}
  `;

  yield 'success';

  // Navigate back to account detail
  router.push({ name: AppPanelAccountItemRoute, params: { accountCode: accountCode.value } });
});

// Watch for account data and populate form
watch(
  function () { return accountQuery.state; },
  function (account) {
    if (account && typeof account === 'object') {
      accountName.value = account.name;
      accountType.value = account.accountTypeName;
      currencyCode.value = account.currencyCode;
    }
  },
);

onMounted(function () {
  accountQuery.run();
  accountTypesQuery.run();
  currenciesQuery.run();
});

function handleSubmit() {
  if (!accountName.value || !accountType.value || !currencyCode.value) {
    return;
  }
  updateAccountQuery.run();
}
</script>

<template>
  <main class="page">
    <header>
      <router-link :to="{ name: AppPanelAccountItemRoute, params: { accountCode } }" replace :aria-label="t('literal.back')">
        <svg-icon :src="MaterialSymbolArrowBackUrl" :alt="t('literal.back')" />
      </router-link>
      <h1>{{ t('accountEditTitle') }} {{ accountCode }}</h1>
    </header>

    <div v-if="accountQuery.state === 'fetching'">
      {{ t('literal.fetching') }}
    </div>

    <form v-else-if="accountQuery.state && typeof accountQuery.state === 'object'" @submit.prevent="handleSubmit" style="max-width: 480px;">
      <fieldset>
        <legend>{{ t('accountEditTitle') }}</legend>

        <label for="account-code">{{ t('accountFormCodeLabel') }}</label>
        <input
          id="account-code"
          :value="accountCode"
          type="number"
          disabled
          readonly
        />
        <small>Account code cannot be changed</small>

        <label for="account-name">{{ t('accountFormNameLabel') }}</label>
        <input
          id="account-name"
          v-model="accountName"
          type="text"
          :placeholder="t('accountFormNamePlaceholder')"
          required
        />

        <label for="account-type">{{ t('accountFormTypeLabel') }}</label>
        <select id="account-type" v-model="accountType" required>
          <option value="">{{ t('accountFormTypeLabel') }}</option>
          <template v-if="Array.isArray(accountTypesQuery.state)">
            <option
              v-for="type in accountTypesQuery.state"
              :key="type.name"
              :value="type.name"
            >
              {{ t(`literal.${type.name}`) }}
            </option>
          </template>
        </select>

        <label for="currency-code">{{ t('accountFormCurrencyLabel') }}</label>
        <select id="currency-code" v-model="currencyCode" required>
          <template v-if="Array.isArray(currenciesQuery.state)">
            <option
              v-for="currency in currenciesQuery.state"
              :key="currency.code"
              :value="currency.code"
            >
              {{ currency.code }} - {{ currency.name }}
            </option>
          </template>
        </select>

        <div>
          <button
            type="submit"
            :disabled="updateAccountQuery.state === 'saving'"
          >
            {{
              updateAccountQuery.state === 'saving'
                ? t('accountEditUpdateCtaProgressLabel')
                : t('accountEditUpdateCtaLabel')
            }}
          </button>
        </div>
      </fieldset>
    </form>
  </main>
</template>
