<script setup>
import { computed, onMounted, reactive } from 'vue';
import { useRouter } from 'vue-router';

import { MaterialSymbolArrowBackUrl } from '@/src/assets/material-symbols.js';
import ComboboxSelect from '@/src/components/combobox-select.vue';
import SvgIcon from '@/src/components/svg-icon.vue';
import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelAccountTagListRoute } from '@/src/router/router.js';

const { t } = useI18n();
const { sql } = useDb();
const router = useRouter();

const accountTagForm = reactive({
  accountCode: '',
  tag: '',
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

const commonTagListQuery = useAsyncIterator(async function* () {
  yield 'fetching';
  const result = await sql`
    select distinct tag as tag
    from account_tag
  `;
  yield result[0]?.values.map(function (row) {
    return String(row[0]);
  });
});

const accountTagCreation = useAsyncIterator(async function* () {
  try {
    yield 'creating';

    await sql`begin transaction`;
    const accountTagCreationResult = await sql`
      insert into account_tag (account_code, tag)
      values (
        ${accountTagForm.accountCode.trim()},
        ${accountTagForm.tag.trim()}
      )
      returning account_code, tag
    `;
    if (accountTagCreationResult[0].values.length !== 1) {
      throw new Error('Account tag creation failed');
    }
    await sql`commit transaction`;

    await router.replace({ name: AppPanelAccountTagListRoute });
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

const disabled = computed(function () {
  return false
    || accountListQuery.state === 'fetching'
    || commonTagListQuery.state === 'fetching'
    || accountTagCreation.state === 'creating';
});

onMounted(function () {
  accountListQuery.run();
  commonTagListQuery.run();
});
</script>

<template>
  <main class="page">
    <header>
      <router-link :to="{ name: AppPanelAccountTagListRoute }" replace :aria-label="t('literal.back')">
        <svg-icon :src="MaterialSymbolArrowBackUrl" :alt="t('literal.back')" />
      </router-link>
      <h1>{{ t('accountTagCreationTitle') }}</h1>
    </header>

    <form @submit.prevent="accountTagCreation.run" :disabled style="width: 320px;">
      <fieldset :disabled>
        <label for="accountCodeInput">{{ t('accountTagCreationAccountLabel') }}</label>
        <combobox-select
          id="accountCodeInput"
          v-model="accountTagForm.accountCode"
          :options="Array.isArray(accountListQuery.state) ? accountListQuery.state : []"
          :placeholder="t('accountTagCreationAccountPlaceholder')"
          required
        />

        <label for="tagInput">{{ t('accountTagCreationTagLabel') }}</label>
        <input
          id="tagInput"
          type="text"
          list="commonTagDatalist"
          :placeholder="t('accountTagCreationTagPlaceholder')"
          v-model="accountTagForm.tag"
          required
        />
        <datalist v-if="Array.isArray(commonTagListQuery.state)" id="commonTagDatalist">
          <option v-for="commonTag in commonTagListQuery.state" :key="commonTag" :value="commonTag">
            {{ commonTag }}
          </option>
        </datalist>

        <div>
          <button type="submit" :disabled>
            {{ accountTagCreation.state === 'creating' ? t('literal.submitting') : t('accountTagCreationSubmitLabel') }}
          </button>
        </div>
      </fieldset>
    </form>
  </main>
</template>
