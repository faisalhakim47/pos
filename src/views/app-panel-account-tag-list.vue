<script setup>
import { onMounted } from 'vue';
import { RouterLink } from 'vue-router';

import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelAccountTagCreationRoute, AppPanelAccountTagItemRoute } from '@/src/router/router.js';

const { t } = useI18n();
const db = useDb();

const accountTagListQuery = useAsyncIterator(async function* () {
  yield 'fetching';
  const result = await db.sql`
    select
      account_tag.account_code,
      account_tag.tag,
      account.name as account_name,
      account.account_type_name
    from account_tag
    join account on account.code = account_tag.account_code
    order by account_tag.tag asc, account_tag.account_code asc
  `;
  yield result[0]?.values.map(function (row) {
    return {
      accountCode: Number(row[0]),
      tag: String(row[1]),
      accountName: String(row[2]),
      accountTypeName: String(row[3]),
    };
  });
});

onMounted(accountTagListQuery.run);
</script>

<template>
  <main class="page">
    <header>
      <h1>{{ t('accountTagListTitle') }}</h1>
      <nav>
        <ul>
          <li>
            <router-link :to="{ name: AppPanelAccountTagCreationRoute }">{{ t('accountTagCreationNavLabel') }}</router-link>
          </li>
        </ul>
      </nav>
    </header>
    <table>
      <thead>
        <tr class="sticky">
          <th scope="col" style="text-align: left; width: 300px;">{{ t('literal.tag') }}</th>
          <th scope="col" style="text-align: center; width: 128px;">{{ t('literal.account') }} {{ t('literal.code') }}</th>
          <th scope="col" style="text-align: left;">{{ t('literal.account') }} {{ t('literal.name') }}</th>
          <th scope="col" style="text-align: center; width: 160px;">{{ t('literal.type') }}</th>
        </tr>
      </thead>
      <tbody v-if="Array.isArray(accountTagListQuery.state)">
        <tr v-for="accountTag in accountTagListQuery.state" :key="`${accountTag.accountCode}-${accountTag.tag}`">
          <td style="text-align: left;">{{ accountTag.tag }}</td>
          <td style="text-align: center; width: 128px;">
            <router-link
              :to="{
                name: AppPanelAccountTagItemRoute,
                params: { accountCode: accountTag.accountCode, tag: accountTag.tag }
              }"
              :title="`View account tag ${accountTag.accountCode} - ${accountTag.tag}`"
            >{{ accountTag.accountCode }}</router-link>
          </td>
          <td style="text-align: left; width: 200px;">{{ accountTag.accountName }}</td>
          <td style="text-align: center; width: 160px;">{{ t(`literal.${accountTag.accountTypeName}`) }}</td>
        </tr>
      </tbody>
      <tbody v-if="accountTagListQuery.state === 'fetching'">
        <tr>
          <td colspan="4" style="text-align: center;">{{ t('literal.fetching') }}</td>
        </tr>
      </tbody>
    </table>
  </main>
</template>
