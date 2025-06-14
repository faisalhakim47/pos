<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, RouterLink } from 'vue-router';

import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useFormatter } from '@/src/context/formatter.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelJournalEntryListRoute, AppPanelJournalEntryItemRoute } from '@/src/router/router.js';

const { t } = useI18n();
const db = useDb();
const formatter = useFormatter();
const route = useRoute();

const journalEntryRef = computed(function () {
  return Number(route.params.journalEntryRef);
});

const journalEntryQuery = useAsyncIterator(async function* () {
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

  // Get journal entry header information
  const headerQueryRes = await db.sql`
    select
      je.ref,
      je.transaction_time,
      je.note,
      je.transaction_currency_code,
      je.exchange_rate_to_functional,
      je.post_time,
      je.reversed_by_journal_entry_ref,
      je.corrected_by_journal_entry_ref
    from journal_entry je
    where je.ref = ${journalEntryRef.value}
  `;

  if (headerQueryRes[0].values.length === 0) {
    yield null;
    return;
  }

  const headerRow = headerQueryRes[0].values[0];

  // Get journal entry lines
  const linesQueryRes = await db.sql`
    select
      jel.line_order,
      jel.account_code,
      a.name as account_name,
      jel.db,
      jel.cr,
      jel.db_functional,
      jel.cr_functional,
      jel.foreign_currency_amount,
      jel.foreign_currency_code,
      jel.exchange_rate
    from journal_entry_line jel
    join account a on a.code = jel.account_code
    where jel.journal_entry_ref = ${journalEntryRef.value}
    order by jel.line_order
  `;

  const lines = linesQueryRes[0].values.map(function (row) {
    return {
      lineOrder: Number(row[0]),
      accountCode: Number(row[1]),
      accountName: String(row[2]),
      debit: Number(row[3]),
      credit: Number(row[4]),
      debitFunctional: Number(row[5]),
      creditFunctional: Number(row[6]),
      foreignCurrencyAmount: row[7] ? Number(row[7]) : null,
      foreignCurrencyCode: row[8] ? String(row[8]) : null,
      exchangeRate: row[9] ? Number(row[9]) : null,
    };
  });

  yield {
    ref: Number(headerRow[0]),
    transactionTime: Number(headerRow[1]),
    note: String(headerRow[2] || ''),
    transactionCurrencyCode: String(headerRow[3]),
    exchangeRateToFunctional: headerRow[4] ? Number(headerRow[4]) : null,
    postTime: headerRow[5] ? Number(headerRow[5]) : null,
    reversedByJournalEntryRef: headerRow[6] ? Number(headerRow[6]) : null,
    correctedByJournalEntryRef: headerRow[7] ? Number(headerRow[7]) : null,
    isPosted: Boolean(headerRow[5]),
    lines: lines,
    totalDebit: lines.reduce((sum, line) => sum + line.debitFunctional, 0),
    totalCredit: lines.reduce((sum, line) => sum + line.creditFunctional, 0),
    functionalCurrency: functionalCurrency,
  };
});

onMounted(journalEntryQuery.run);
</script>

<template>
  <main class="page">
    <header>
      <h1>{{ t('journalEntryItemTitle') }}</h1>
      <nav aria-label="Journal entry navigation">
        <ul>
          <li>
            <RouterLink :to="{ name: AppPanelJournalEntryListRoute, replace: true }">{{ t('literal.back') }}</RouterLink>
          </li>
        </ul>
      </nav>
    </header>

    <section v-if="journalEntryQuery.state && journalEntryQuery.state !== 'fetching'">
      <!-- Journal Entry Header -->
      <section aria-labelledby="journal-entry-details-heading">
        <h2 id="journal-entry-details-heading">{{ t('journalEntryDetailsTitle') }} #{{ journalEntryQuery.state.ref }}</h2>
        <dl aria-label="Journal entry details">
          <dt>{{ t('literal.date') }}:</dt>
          <dd>{{ formatter.formatDate(new Date(journalEntryQuery.state.transactionTime * 1000)) }}</dd>

          <dt>{{ t('literal.description') }}:</dt>
          <dd>{{ journalEntryQuery.state.note || t('literal.noDescription') }}</dd>

          <dt>{{ t('literal.currency') }}:</dt>
          <dd>{{ journalEntryQuery.state.transactionCurrencyCode }}</dd>

          <dt v-if="journalEntryQuery.state.exchangeRateToFunctional">{{ t('literal.exchangeRate') }}:</dt>
          <dd v-if="journalEntryQuery.state.exchangeRateToFunctional">{{ journalEntryQuery.state.exchangeRateToFunctional }}</dd>

          <dt>{{ t('literal.status') }}:</dt>
          <dd>
            <span v-if="journalEntryQuery.state.isPosted" aria-label="Status: Posted">
              {{ t('literal.posted') }}
              <span v-if="journalEntryQuery.state.postTime">
                ({{ formatter.formatDate(new Date(journalEntryQuery.state.postTime * 1000)) }})
              </span>
            </span>
            <span v-else aria-label="Status: Unposted">{{ t('literal.unposted') }}</span>
          </dd>

          <dt v-if="journalEntryQuery.state.reversedByJournalEntryRef">{{ t('literal.reversedBy') }}:</dt>
          <dd v-if="journalEntryQuery.state.reversedByJournalEntryRef">
            <RouterLink
              :to="{
                name: AppPanelJournalEntryItemRoute,
                params: { journalEntryRef: journalEntryQuery.state.reversedByJournalEntryRef }
              }"
              :aria-label="`View reversal journal entry ${journalEntryQuery.state.reversedByJournalEntryRef}`"
            >{{ t('journalEntryItemTitle') }} #{{ journalEntryQuery.state.reversedByJournalEntryRef }}</RouterLink>
          </dd>

          <dt v-if="journalEntryQuery.state.correctedByJournalEntryRef">{{ t('literal.correctedBy') }}:</dt>
          <dd v-if="journalEntryQuery.state.correctedByJournalEntryRef">
            <RouterLink
              :to="{
                name: AppPanelJournalEntryItemRoute,
                params: { journalEntryRef: journalEntryQuery.state.correctedByJournalEntryRef }
              }"
              :aria-label="`View correction journal entry ${journalEntryQuery.state.correctedByJournalEntryRef}`"
            >{{ t('journalEntryItemTitle') }} #{{ journalEntryQuery.state.correctedByJournalEntryRef }}</RouterLink>
          </dd>
        </dl>
      </section>

      <!-- Journal Entry Lines -->
      <section aria-labelledby="journal-entry-lines-heading">
        <h3 id="journal-entry-lines-heading">{{ t('journalEntryLinesTitle') }}</h3>
        <table role="table" aria-label="Journal entry lines">
          <thead>
            <tr role="row">
              <th scope="col" style="text-align: center; width: 60px;" role="columnheader">{{ t('literal.line') }}</th>
              <th scope="col" style="text-align: center; width: 100px;" role="columnheader">{{ t('literal.account') }}</th>
              <th scope="col" style="text-align: left;" role="columnheader">{{ t('literal.accountName') }}</th>
              <th scope="col" style="text-align: right; width: 120px;" role="columnheader">{{ t('literal.debit') }}</th>
              <th scope="col" style="text-align: right; width: 120px;" role="columnheader">{{ t('literal.credit') }}</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            <tr v-for="line in journalEntryQuery.state.lines" :key="line.lineOrder" role="row">
              <td style="text-align: center; width: 60px;" role="gridcell">{{ line.lineOrder + 1 }}</td>
              <td style="text-align: center; width: 100px;" role="gridcell">{{ line.accountCode }}</td>
              <td style="text-align: left;" role="gridcell">{{ line.accountName }}</td>
              <td style="text-align: right; width: 120px;" role="gridcell">
                <span v-if="line.debitFunctional > 0">
                  {{ formatter.formatCurrency(line.debitFunctional, journalEntryQuery.state.functionalCurrency.code, journalEntryQuery.state.functionalCurrency.decimals) }}
                </span>
              </td>
              <td style="text-align: right; width: 120px;" role="gridcell">
                <span v-if="line.creditFunctional > 0">
                  {{ formatter.formatCurrency(line.creditFunctional, journalEntryQuery.state.functionalCurrency.code, journalEntryQuery.state.functionalCurrency.decimals) }}
                </span>
              </td>
            </tr>
          </tbody>
          <tfoot role="rowgroup">
            <tr role="row">
              <td colspan="3" style="text-align: right; font-weight: bold;" role="gridcell">{{ t('literal.total') }}:</td>
              <td style="text-align: right; font-weight: bold;" role="gridcell">
                {{ formatter.formatCurrency(journalEntryQuery.state.totalDebit, journalEntryQuery.state.functionalCurrency.code, journalEntryQuery.state.functionalCurrency.decimals) }}
              </td>
              <td style="text-align: right; font-weight: bold;" role="gridcell">
                {{ formatter.formatCurrency(journalEntryQuery.state.totalCredit, journalEntryQuery.state.functionalCurrency.code, journalEntryQuery.state.functionalCurrency.decimals) }}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
    </section>

    <section v-if="journalEntryQuery.state === 'fetching'">
      <p>{{ t('literal.fetching') }}</p>
    </section>

    <section v-if="journalEntryQuery.state === null">
      <p>{{ t('journalEntryNotFound') }}</p>
    </section>
  </main>
</template>

<style scoped>
section[aria-labelledby="journal-entry-details-heading"] {
  margin-bottom: 2rem;
  padding: 1rem;
  background-color: #f8f9fa;
  border-radius: 0.5rem;
}

dl[aria-label="Journal entry details"] {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem 1rem;
  margin-top: 1rem;
}

dl[aria-label="Journal entry details"] dt {
  font-weight: 600;
  color: #374151;
}

dl[aria-label="Journal entry details"] dd {
  margin: 0;
  color: #6b7280;
}

span[aria-label*="Posted"] {
  color: #22c55e;
  font-weight: 500;
}

span[aria-label*="Unposted"] {
  color: #f59e0b;
  font-weight: 500;
}

section[aria-labelledby="journal-entry-lines-heading"] h3 {
  margin-top: 2rem;
  margin-bottom: 1rem;
}

table[aria-label="Journal entry lines"] thead tr {
  position: sticky;
  top: 0;
  background-color: white;
}

table[aria-label="Journal entry lines"] tfoot tr {
  border-top: 2px solid #374151;
}

table[aria-label="Journal entry lines"] tfoot td {
  padding-top: 0.75rem;
}
</style>
