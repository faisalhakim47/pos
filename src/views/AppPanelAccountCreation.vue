<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { MaterialSymbolArrowBackUrl } from '@/src/assets/material-symbols.js';
import SvgIcon from '@/src/components/SvgIcon.vue';
import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelAccountListRoute } from '@/src/router/router.js';

const { t } = useI18n();
const db = useDb();
const router = useRouter();

const accountCode = ref('');
const accountName = ref('');
const accountType = ref('');
const currencyCode = ref('USD');

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

// Create account
const createAccountQuery = useAsyncIterator(async function* () {
  yield 'saving';

  const code = parseInt(accountCode.value, 10);
  if (isNaN(code) || code < 10000 || code > 99999) {
    throw new Error('Account code must be a 5-digit number between 10000 and 99999');
  }

  await db.sql`
    insert into account (code, name, account_type_name, currency_code)
    values (${code}, ${accountName.value}, ${accountType.value}, ${currencyCode.value})
  `;

  yield 'success';

  // Navigate back to account list
  router.push({ name: AppPanelAccountListRoute });
});

onMounted(function () {
  accountTypesQuery.run();
  currenciesQuery.run();
});

function handleSubmit() {
  if (!accountCode.value || !accountName.value || !accountType.value) {
    return;
  }
  createAccountQuery.run();
}
</script>

<template>
  <main class="page">
    <header>
      <RouterLink :to="{ name: AppPanelAccountListRoute }" replace :aria-label="t('literal.back')">
        <SvgIcon :src="MaterialSymbolArrowBackUrl" :alt="t('literal.back')" />
      </RouterLink>
      <h1>{{ t('accountCreationTitle') }}</h1>
    </header>

    <form @submit.prevent="handleSubmit" style="max-width: 480px;">
      <fieldset>
        <legend>{{ t('accountCreationTitle') }}</legend>

        <label for="account-code">{{ t('accountFormCodeLabel') }}</label>
        <input
          id="account-code"
          v-model="accountCode"
          type="number"
          min="10000"
          max="99999"
          step="1"
          :placeholder="t('accountFormCodePlaceholder')"
          required
        />

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
            :disabled="createAccountQuery.state === 'saving' || !accountCode || !accountName || !accountType"
          >
            {{
              createAccountQuery.state === 'saving'
                ? t('accountCreationSaveCtaProgressLabel')
                : t('accountCreationSaveCtaLabel')
            }}
          </button>
        </div>
      </fieldset>
    </form>
  </main>
</template>
