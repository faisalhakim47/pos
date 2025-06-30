<script setup>
import { computed, onMounted, reactive, watchPostEffect } from 'vue';
import { useRoute } from 'vue-router';

import { MaterialSymbolArrowBackUrl } from '@/src/assets/material-symbols.js';
import ComboboxSelect from '@/src/components/combobox-select.vue';
import SvgIcon from '@/src/components/svg-icon.vue';
import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelAccountTagEditRoute } from '@/src/router/router.js';
import { sleep } from '@/src/tools/promise.js';

const { t } = useI18n();
const { sql } = useDb();
const route = useRoute();

const accountCode = computed(function () {
  return parseInt(String(route.params.accountCode), 10);
});

const tag = computed(function () {
  return String(route.params.tag);
});

const accountTagForm = reactive({
  accountCode: '',
  tag: '',
});

const accountTagItemQuery = useAsyncIterator(async function* () {
  yield 'fetching';

  const result = await sql`
    select
      account_tag.account_code,
      account_tag.tag,
      account.name as account_name
    from account_tag
    join account on account.code = account_tag.account_code
    where account_tag.account_code = ${accountCode.value}
      and account_tag.tag = ${tag.value}
  `;

  if (result[0].values.length === 0) {
    throw new Error('Account tag not found');
  }

  const row = result[0].values[0];

  yield {
    accountCode: Number(row[0]),
    tag: String(row[1]),
    accountName: String(row[2]),
  };
});

watchPostEffect(function () {
  if (typeof accountTagItemQuery.state === 'object') {
    accountTagForm.accountCode = String(accountTagItemQuery.state.accountCode);
    accountTagForm.tag = accountTagItemQuery.state.tag;
  }
});

const accountListQuery = useAsyncIterator(async function* () {
  yield 'fetching';
  const result = await sql`
    select code, name, account_type_name
    from account
    order by code asc
  `;
  yield result[0]?.values.map(function (row) {
    return {
      value: String(row[0]),
      label: `${row[0]} - ${row[1]}`,
      code: Number(row[0]),
      name: String(row[1]),
      accountTypeName: String(row[2]),
    };
  });
});

const tagListQuery = useAsyncIterator(async function* () {
  yield 'fetching';
  const result = await sql`
    select distinct tag as tag
    from account_tag
  `;
  yield result[0]?.values.map(function (row) {
    return String(row[0]);
  });
});

const accountTagUpdate = useAsyncIterator(async function* () {
  try {
    yield 'updating';

    const newAccountCode = parseInt(accountTagForm.accountCode, 10);
    const newTag = accountTagForm.tag.trim();

    await sql`begin transaction`;
    await sql`
      insert into account_tag (account_code, tag)
      values (${newAccountCode}, ${newTag})
      on conflict (account_code, tag) do nothing
    `;
    await sql`commit transaction`;

    yield 'reporting';
    yield await sleep(1000);
  }
  catch (error) {
    try {
      await sql`rollback transaction`;
    }
    catch (rollbackError) {
      // Ignore rollback errors if no transaction is active
      console.warn('Rollback failed:', rollbackError);
    }
    throw error;
  }
});

onMounted(function () {
  accountTagItemQuery.run();
  accountListQuery.run();
});
</script>

<template>
  <main class="page">
    <header>
      <router-link :to="{ name: AppPanelAccountTagEditRoute, params: route.params }" replace :aria-label="t('literal.back')">
        <svg-icon :src="MaterialSymbolArrowBackUrl" :alt="t('literal.back')" />
      </router-link>
      <h1>{{ t('accountTagEditTitle') }}</h1>
    </header>

    <form v-if="typeof accountTagItemQuery.state === 'object'" @submit.prevent="accountTagUpdate.run">
      <fieldset>
        <label for="accountCodeSelect">{{ t('literal.account') }}</label>
        <combobox-select
          id="accountCodeSelect"
          v-model="accountTagForm.accountCode"
          :options="Array.isArray(accountListQuery.state) ? accountListQuery.state : []"
          :placeholder="t('accountTagEditAccountPlaceholder')"
          required
        />

        <label for="tagInput">{{ t('literal.tag') }}</label>
        <input
          id="tagInput"
          v-model="accountTagForm.tag"
          type="text"
          list="accountTagDatalist"
          :placeholder="t('accountTagEditTagPlaceholder')"
          required
        />
        <datalist v-if="Array.isArray(tagListQuery.state)" id="accountTagDatalist">
          <option v-for="tagItem in tagListQuery.state" :key="tagItem" :value="tagItem">
            {{ tagItem }}
          </option>
        </datalist>

        <div>
          <button type="submit">
            {{ accountTagUpdate.state === 'updating' ? t('literal.submitting') : t('accountTagEditSubmitLabel') }}
          </button>
        </div>
      </fieldset>
    </form>

    <section v-if="accountTagItemQuery.state === 'fetching'">
      <p>{{ t('literal.fetching') }}</p>
    </section>
  </main>
</template>
