<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { MaterialSymbolArrowBackUrl } from '@/src/assets/material-symbols.js';
import SvgIcon from '@/src/components/svg-icon.vue';
import TextWithLoadingIndicator from '@/src/components/text-with-loading-indicator.vue';
import UnhandledError from '@/src/components/unhandled-error.vue';
import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelAccountTagItemRoute, AppPanelAccountTagListRoute } from '@/src/router/router.js';
import { assertInstanceOf } from '@/src/tools/assertion.js';
import { sleep } from '@/src/tools/promise.js';

const { t } = useI18n();
const { sql } = useDb();
const route = useRoute();
const router = useRouter();

const accountCode = computed(function () {
  return parseInt(String(route.params.accountCode), 10);
});

const tag = computed(function () {
  return String(route.params.tag);
});

const accountTagItemQuery = useAsyncIterator(async function* () {
  yield 'fetching';

  const result = await sql`
    select
      account_tag.account_code,
      account_tag.tag,
      account.name as account_name,
      account.account_type_name,
      account.balance,
      currency.code as currency_code,
      currency.symbol as currency_symbol,
      currency.decimals
    from account_tag
    join account on account.code = account_tag.account_code
    join currency on currency.code = account.currency_code
    where account_tag.account_code = ${accountCode.value} and account_tag.tag = ${tag.value}
  `;

  if (result[0].values.length === 0) {
    throw new Error('Account tag not found');
  }

  const row = result[0]?.values[0];

  yield {
    accountCode: Number(row[0]),
    tag: String(row[1]),
    accountName: String(row[2]),
    accountTypeName: String(row[3]),
    accountBalance: Number(row[4]),
    currencyCode: String(row[5]),
    currencySymbol: String(row[6]),
    currencyDecimals: Number(row[7]),
  };
});

onMounted(accountTagItemQuery.run);

const accountTagDeletion = useAsyncIterator(async function* (event) {
  try {
    assertInstanceOf(SubmitEvent, event);
    assertInstanceOf(HTMLButtonElement, event.submitter);

    if (event.submitter.value === 'cancel') {
      router.replace({ name: AppPanelAccountTagItemRoute, params: route.params });
      return;
    }

    yield 'deleting';

    await sql`begin transaction`;
    await sql`
      delete from account_tag
      where account_code = ${accountCode.value}
        and tag = ${tag.value}
    `;
    await sql`commit transaction`;

    yield 'reporting';
    yield await sleep(1000);
  }
  catch (error) {
    sql`rollback transaction`;
    throw error;
  }
});

const accountTagDeletionFromDisabled = computed(function () {
  return accountTagDeletion.state !== undefined;
});
</script>

<template>
  <main class="page">
    <header>
      <router-link :to="{ name: AppPanelAccountTagListRoute }" replace :aria-label="t('literal.back')">
        <svg-icon :src="MaterialSymbolArrowBackUrl" :alt="t('literal.back')" />
      </router-link>
      <h1>{{ t('accountTagItemTitle') }}</h1>
    </header>

    <unhandled-error :error="accountTagItemQuery.error"></unhandled-error>

    <section v-if="typeof accountTagItemQuery.state === 'object'">
      <h2>{{ t('literal.account') }} {{ t('literal.information') }}</h2>

      <dl>
        <dt>{{ t('literal.account') }} {{ t('literal.code') }}</dt>
        <dd>{{ accountTagItemQuery.state.accountCode }}</dd>

        <dt>{{ t('literal.account') }} {{ t('literal.name') }}</dt>
        <dd>{{ accountTagItemQuery.state.accountName }}</dd>

        <dt>{{ t('literal.type') }}</dt>
        <dd>{{ t(`literal.${accountTagItemQuery.state.accountTypeName}`) }}</dd>

        <dt>{{ t('literal.balance') }}</dt>
        <dd>
          {{ accountTagItemQuery.state.currencySymbol }}
          {{ accountTagItemQuery.state.accountBalance.toFixed(accountTagItemQuery.state.currencyDecimals) }}
        </dd>

        <dt>{{ t('literal.currency') }}</dt>
        <dd>{{ accountTagItemQuery.state.currencyCode }}</dd>
      </dl>

      <h2>{{ t('literal.tag') }} {{ t('literal.information') }}</h2>

      <dl>
        <dt>{{ t('literal.tag') }}</dt>
        <dd>{{ accountTagItemQuery.state.tag }}</dd>
      </dl>
    </section>

    <section v-if="accountTagItemQuery.state === 'fetching'">
      <p>{{ t('literal.fetching') }}</p>
    </section>

    <div>
      <a href="#accountTagDeletionDialog">Delete</a>
    </div>

    <div v-if="typeof accountTagItemQuery.state === 'object'" id="accountTagDeletionDialog">
      <dialog :open="route.hash === '#accountTagDeletionDialog'">
        <form @submit.prevent="accountTagDeletion.run">
          <header>
            <h2>{{ t('accountTagDeleteConfirmation') }}</h2>
          </header>
          <dl>
            <dt>{{ t('literal.account') }}</dt>
            <dd>{{ accountTagItemQuery.state.accountCode }} - {{ accountTagItemQuery.state.accountName }}</dd>
            <dt>{{ t('literal.tag') }}</dt>
            <dd>{{ accountTagItemQuery.state.tag }}</dd>
          </dl>
          <div>
            <button
              type="submit"
              name="action"
              value="cancel"
              :disabled="accountTagDeletionFromDisabled"
            >{{ t('accountTagDeleteCancelLabel') }}</button>
            <button
              type="submit"
              name="action"
              value="delete"
              :disabled="accountTagDeletionFromDisabled"
            ><text-with-loading-indicator
              :busy="accountTagDeletion.state === 'deleting'"
              :busy-label="t('accountTagDeleteCtaProgress')"
            >{{
              accountTagDeletion.state === 'reporting'
                ? t('accountTagDeleteCtaProgress')
                : t('accountTagDeleteCtaLabel')
            }}</text-with-loading-indicator></button>
          </div>
          <unhandled-error :error="accountTagDeletion.error"></unhandled-error>
        </form>
      </dialog>
    </div>

  </main>
</template>
