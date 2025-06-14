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
  yield journalEntryQueryRes[0].values.map(function (row) {
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
  });
});

onMounted(journalEntryListQuery.run);
</script>

<template>
  <main class="page">
    <header>
      <h1>{{ t('journalEntryListTitle') }}</h1>
      <nav aria-label="Journal entry actions">
        <ul>
          <li>
            <RouterLink :to="{ name: AppPanelJournalEntryCreationRoute }">{{ t('journalEntryCreationNavLabel') }}</RouterLink>
          </li>
        </ul>
      </nav>
    </header>
    <table role="table" aria-label="Journal entries list">
      <thead>
        <tr role="row">
          <th scope="col" style="text-align: center; width: 80px;" role="columnheader" aria-sort="none">{{ t('literal.ref') }}</th>
          <th scope="col" style="text-align: center; width: 120px;" role="columnheader" aria-sort="none">{{ t('literal.date') }}</th>
          <th scope="col" style="text-align: left;" role="columnheader" aria-sort="none">{{ t('literal.description') }}</th>
          <th scope="col" style="text-align: center; width: 80px;" role="columnheader" aria-sort="none">{{ t('literal.currency') }}</th>
          <th scope="col" style="text-align: right; width: 120px;" role="columnheader" aria-sort="none">{{ t('literal.amount') }}</th>
          <th scope="col" style="text-align: center; width: 80px;" role="columnheader" aria-sort="none">{{ t('literal.lines') }}</th>
          <th scope="col" style="text-align: center; width: 80px;" role="columnheader" aria-sort="none">{{ t('literal.status') }}</th>
        </tr>
      </thead>
      <tbody v-if="Array.isArray(journalEntryListQuery.state)" role="rowgroup">
        <tr v-for="entry in journalEntryListQuery.state" :key="entry.ref" role="row">
          <td style="text-align: center; width: 80px;" role="gridcell">
            <RouterLink
              :to="{
                name: AppPanelJournalEntryItemRoute,
                params: { journalEntryRef: entry.ref }
              }"
              :aria-label="`View journal entry ${entry.ref}`"
            >{{ entry.ref }}</RouterLink>
          </td>
          <td style="text-align: center; width: 120px;" role="gridcell">
            {{ formatter.formatDate(new Date(entry.transactionTime * 1000)) }}
          </td>
          <td style="text-align: left;" role="gridcell">{{ entry.note || t('literal.noDescription') }}</td>
          <td style="text-align: center; width: 80px;" role="gridcell">{{ entry.transactionCurrencyCode }}</td>
          <td style="text-align: right; width: 120px;" role="gridcell">
            {{ formatter.formatCurrency(entry.totalDebit) }}
          </td>
          <td style="text-align: center; width: 80px;" role="gridcell">{{ entry.lineCount }}</td>
          <td style="text-align: center; width: 80px;" role="gridcell">
            <span v-if="entry.isPosted" aria-label="Status: Posted">{{ t('literal.posted') }}</span>
            <span v-else aria-label="Status: Unposted">{{ t('literal.unposted') }}</span>
          </td>
        </tr>
      </tbody>
      <tbody v-if="journalEntryListQuery.state === 'fetching'" role="rowgroup">
        <tr role="row">
          <td colspan="7" style="text-align: center;" role="gridcell">{{ t('literal.fetching') }}</td>
        </tr>
      </tbody>
    </table>
  </main>
</template>

<style scoped>
thead tr {
  position: sticky;
  top: 0;
  background-color: white;
}

span[aria-label*="Posted"] {
  color: #22c55e;
  font-weight: 500;
}

span[aria-label*="Unposted"] {
  color: #f59e0b;
  font-weight: 500;
}
</style>
