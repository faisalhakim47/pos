<script setup>
import { onMounted } from 'vue';
import { RouterLink } from 'vue-router';

import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useFormatter } from '@/src/context/formatter.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelJournalEntryCreationRoute, AppPanelJournalEntryItemRoute } from '@/src/router/router.js';

const { t } = useI18n();
const db = useDb();
const formatter = useFormatter();

const journalEntryListQuery = useAsyncIterator(async function* () {
  yield 'fetching';

  // Get functional currency information
  const functionalCurrencyRes = await db.sql`
    select code, decimals
    from currency
    where is_functional_currency = 1
  `;

  if (functionalCurrencyRes[0].values.length === 0) {
    throw new Error('No functional currency found');
  }

  const functionalCurrency = {
    code: String(functionalCurrencyRes[0].values[0][0]),
    decimals: Number(functionalCurrencyRes[0].values[0][1]),
  };

  const journalEntryQueryRes = await db.sql`
    select
      je.ref,
      je.transaction_time,
      je.note,
      je.transaction_currency_code,
      je.post_time,
      coalesce(sum(jel.db_functional), 0) as total_debit,
      coalesce(sum(jel.cr_functional), 0) as total_credit,
      count(jel.journal_entry_ref) as line_count
    from journal_entry je
    left join journal_entry_line jel on jel.journal_entry_ref = je.ref
    group by je.ref, je.transaction_time, je.note, je.transaction_currency_code, je.post_time
    order by je.ref desc
  `;
  yield {
    functionalCurrency,
    entries: journalEntryQueryRes[0].values.map(function (row) {
      return {
        ref: Number(row[0]),
        transactionTime: Number(row[1]),
        note: String(row[2] || ''),
        transactionCurrencyCode: String(row[3]),
        postTime: row[4] ? Number(row[4]) : null,
        totalDebit: Number(row[5]),
        totalCredit: Number(row[6]),
        lineCount: Number(row[7]),
        isPosted: Boolean(row[4]),
      };
    }),
  };
});

onMounted(journalEntryListQuery.run);
</script>

<template>
  <main class="page">
    <header>
      <h1>{{ t('journalEntryListTitle') }}</h1>
      <nav>
        <ul>
          <li>
            <router-link :to="{ name: AppPanelJournalEntryCreationRoute }">{{ t('journalEntryCreationNavLabel') }}</router-link>
          </li>
        </ul>
      </nav>
    </header>
    <table>
      <thead>
        <tr class="sticky">
          <th scope="col" style="text-align: center; width: 80px;">{{ t('literal.ref') }}</th>
          <th scope="col" style="text-align: center; width: 120px;">{{ t('literal.date') }}</th>
          <th scope="col" style="text-align: left;">{{ t('literal.description') }}</th>
          <th scope="col" style="text-align: center; width: 80px;">{{ t('literal.currency') }}</th>
          <th scope="col" style="text-align: right; width: 120px;">{{ t('literal.amount') }}</th>
          <th scope="col" style="text-align: center; width: 80px;">{{ t('literal.lines') }}</th>
          <th scope="col" style="text-align: center; width: 80px;">{{ t('literal.status') }}</th>
        </tr>
      </thead>
      <tbody v-if="journalEntryListQuery.state && typeof journalEntryListQuery.state === 'object'">
        <tr v-for="entry in journalEntryListQuery.state.entries" :key="entry.ref">
          <td style="text-align: center; width: 80px;">
            <router-link
              :to="{
                name: AppPanelJournalEntryItemRoute,
                params: { journalEntryRef: entry.ref }
              }"
              :title="`View journal entry ${entry.ref}`"
            >{{ entry.ref }}</router-link>
          </td>
          <td style="text-align: center; width: 120px;">
            {{ formatter.formatDate(new Date(entry.transactionTime * 1000)) }}
          </td>
          <td style="text-align: left;">{{ entry.note || t('literal.noDescription') }}</td>
          <td style="text-align: center; width: 80px;">{{ entry.transactionCurrencyCode }}</td>
          <td style="text-align: right; width: 120px;">
            {{ formatter.formatCurrency(entry.totalDebit, journalEntryListQuery.state.functionalCurrency.code, journalEntryListQuery.state.functionalCurrency.decimals) }}
          </td>
          <td style="text-align: center; width: 80px;">{{ entry.lineCount }}</td>
          <td style="text-align: center; width: 80px;">
            <span v-if="entry.isPosted" style="color: #22c55e; font-weight: 500;">{{ t('literal.posted') }}</span>
            <span v-else style="color: #f59e0b; font-weight: 500;">{{ t('literal.unposted') }}</span>
          </td>
        </tr>
      </tbody>
      <tbody v-if="journalEntryListQuery.state === 'fetching'">
        <tr>
          <td colspan="7" style="text-align: center;">{{ t('literal.fetching') }}</td>
        </tr>
      </tbody>
    </table>
  </main>
</template>
