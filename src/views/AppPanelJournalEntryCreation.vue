<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, RouterLink } from 'vue-router';

import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useFormatter } from '@/src/context/formatter.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelJournalEntryListRoute, AppPanelJournalEntryItemRoute } from '@/src/router/router.js';

const { t } = useI18n();
const db = useDb();
const formatter = useFormatter();
const router = useRouter();

// Form state
const note = ref('');
const transactionCurrencyCode = ref('USD');
const lines = ref([
  { accountCode: '', debit: '', credit: '' },
  { accountCode: '', debit: '', credit: '' },
]);

// Form validation
const isValid = computed(function () {
  // Check if at least 2 lines have account codes
  const validLines = lines.value.filter(function (line) {
    return line.accountCode && (parseFloat(line.debit) > 0 || parseFloat(line.credit) > 0);
  });

  if (validLines.length < 2) return false;

  // Check if debits equal credits
  const totalDebits = validLines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
  const totalCredits = validLines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);

  return Math.abs(totalDebits - totalCredits) < 0.01; // Allow for small rounding differences
});

const totalDebits = computed(function () {
  return lines.value.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
});

const totalCredits = computed(function () {
  return lines.value.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
});

// Account lookup
const accountsQuery = useAsyncIterator(async function* () {
  yield 'fetching';
  const accountQueryRes = await db.sql`
    select code, name
    from account
    order by code asc
  `;
  yield accountQueryRes[0].values.map(function (row) {
    return {
      code: Number(row[0]),
      name: String(row[1]),
    };
  });
});

const currenciesQuery = useAsyncIterator(async function* () {
  yield 'fetching';
  const currencyQueryRes = await db.sql`
    select code, name
    from currency
    where is_active = 1
    order by code asc
  `;
  yield currencyQueryRes[0].values.map(function (row) {
    return {
      code: String(row[0]),
      name: String(row[1]),
    };
  });
});

function addLine() {
  lines.value.push({ accountCode: '', debit: '', credit: '' });
}

function removeLine(index) {
  if (lines.value.length > 2) {
    lines.value.splice(index, 1);
  }
}

function handleDebitInput(index, event) {
  const value = event.target.value;
  lines.value[index].debit = value;
  if (value) {
    lines.value[index].credit = '';
  }
}

function handleCreditInput(index, event) {
  const value = event.target.value;
  lines.value[index].credit = value;
  if (value) {
    lines.value[index].debit = '';
  }
}

async function saveJournalEntry() {
  if (!isValid.value) return;

  try {
    // Get next journal entry reference number
    const refQueryRes = await db.sql`
      select coalesce(max(ref), 0) + 1 as next_ref from journal_entry
    `;
    const nextRef = Number(refQueryRes[0].values[0][0]);

    // Convert amounts to integers (cents)
    const validLines = lines.value.filter(function (line) {
      return line.accountCode && (parseFloat(line.debit) > 0 || parseFloat(line.credit) > 0);
    });

    await db.sql`begin transaction`;

    // Insert journal entry header
    await db.sql`
      insert into journal_entry (ref, transaction_time, note, transaction_currency_code)
      values (${nextRef}, ${Math.floor(Date.now() / 1000)}, ${note.value}, ${transactionCurrencyCode.value})
    `;

    // Insert journal entry lines
    for (let i = 0; i < validLines.length; i++) {
      const line = validLines[i];
      const debitAmount = Math.round((parseFloat(line.debit) || 0) * 100);
      const creditAmount = Math.round((parseFloat(line.credit) || 0) * 100);

      await db.sql`
        insert into journal_entry_line_auto_number (
          journal_entry_ref, account_code, db, cr, db_functional, cr_functional
        ) values (
          ${nextRef}, ${Number(line.accountCode)}, ${debitAmount}, ${creditAmount}, ${debitAmount}, ${creditAmount}
        )
      `;
    }

    await db.sql`commit`;

    // Navigate to the new journal entry
    router.push({
      name: AppPanelJournalEntryItemRoute,
      params: { journalEntryRef: nextRef },
    });
  } catch (error) {
    await db.sql`rollback`;
    console.error('Failed to save journal entry:', error);
    alert('Failed to save journal entry. Please try again.');
  }
}

onMounted(function () {
  accountsQuery.run();
  currenciesQuery.run();
});
</script>

<template>
  <main class="page">
    <header>
      <h1>{{ t('journalEntryCreationTitle') }}</h1>
      <nav aria-label="Journal entry navigation">
        <ul>
          <li>
            <RouterLink :to="{ name: AppPanelJournalEntryListRoute, replace: true }">{{ t('literal.back') }}</RouterLink>
          </li>
        </ul>
      </nav>
    </header>

    <form @submit.prevent="saveJournalEntry" aria-label="Create new journal entry">
      <!-- Header Information -->
      <fieldset aria-labelledby="form-header-legend">
        <legend id="form-header-legend" class="visually-hidden">Journal entry basic information</legend>
        <div>
          <label for="note">{{ t('literal.description') }}:</label>
          <input
            id="note"
            type="text"
            v-model="note"
            :placeholder="t('journalEntryNotePlaceholder')"
            aria-describedby="note-help"
          />
          <div id="note-help" class="visually-hidden">Optional description for this journal entry</div>
        </div>

        <div>
          <label for="currency">{{ t('literal.currency') }}:</label>
          <select
            id="currency"
            v-model="transactionCurrencyCode"
            required
            aria-describedby="currency-help"
          >
            <template v-if="Array.isArray(currenciesQuery.state)">
              <option v-for="currency in currenciesQuery.state"
                :key="currency.code"
                :value="currency.code"
              >
                {{ currency.code }} - {{ currency.name }}
              </option>
            </template>
          </select>
          <div id="currency-help" class="visually-hidden">Select the transaction currency for this journal entry</div>
        </div>
      </fieldset>

      <!-- Journal Entry Lines -->
      <fieldset aria-labelledby="form-lines-legend">
        <legend id="form-lines-legend">{{ t('journalEntryLinesTitle') }}</legend>

        <table role="table" aria-label="Journal entry lines form">
          <thead>
            <tr role="row">
              <th scope="col" style="width: 1fr;" role="columnheader">{{ t('literal.account') }}</th>
              <th scope="col" style="width: 150px;" role="columnheader">{{ t('literal.debit') }}</th>
              <th scope="col" style="width: 150px;" role="columnheader">{{ t('literal.credit') }}</th>
              <th scope="col" style="width: 100px;" role="columnheader">{{ t('literal.actions') }}</th>
            </tr>
          </thead>

          <tbody role="rowgroup">
            <tr v-for="(line, index) in lines" :key="index" role="row">
              <td role="gridcell">
                <label :for="`account-${index}`" class="visually-hidden">Account for line {{ index + 1 }}</label>
                <select
                  :id="`account-${index}`"
                  v-model="line.accountCode"
                  required
                  :aria-describedby="`account-${index}-help`"
                >
                  <option value="">{{ t('selectAccountPlaceholder') }}</option>
                  <template v-if="Array.isArray(accountsQuery.state)">
                    <option v-for="account in accountsQuery.state"
                      :key="account.code"
                      :value="account.code"
                    >
                      {{ account.code }} - {{ account.name }}
                    </option>
                  </template>
                </select>
                <div :id="`account-${index}-help`" class="visually-hidden">Select an account for this line</div>
              </td>

              <td role="gridcell">
                <label :for="`debit-${index}`" class="visually-hidden">Debit amount for line {{ index + 1 }}</label>
                <input
                  :id="`debit-${index}`"
                  type="number"
                  step="0.01"
                  min="0"
                  :value="line.debit"
                  @input="handleDebitInput(index, $event)"
                  :placeholder="t('amountPlaceholder')"
                  :aria-describedby="`debit-${index}-help`"
                />
                <div :id="`debit-${index}-help`" class="visually-hidden">Enter debit amount for this line</div>
              </td>

              <td role="gridcell">
                <label :for="`credit-${index}`" class="visually-hidden">Credit amount for line {{ index + 1 }}</label>
                <input
                  :id="`credit-${index}`"
                  type="number"
                  step="0.01"
                  min="0"
                  :value="line.credit"
                  @input="handleCreditInput(index, $event)"
                  :placeholder="t('amountPlaceholder')"
                  :aria-describedby="`credit-${index}-help`"
                />
                <div :id="`credit-${index}-help`" class="visually-hidden">Enter credit amount for this line</div>
              </td>

              <td role="gridcell">
                <button
                  type="button"
                  @click="removeLine(index)"
                  :disabled="lines.length <= 2"
                  :aria-label="`Remove line ${index + 1}`"
                >
                  {{ t('literal.remove') }}
                </button>
              </td>
            </tr>
          </tbody>

          <tfoot role="rowgroup">
            <tr role="row">
              <td role="gridcell"><strong>{{ t('literal.total') }}:</strong></td>
              <td role="gridcell" style="text-align: right;"><strong>{{ formatter.formatCurrency(Math.round(totalDebits * 100)) }}</strong></td>
              <td role="gridcell" style="text-align: right;"><strong>{{ formatter.formatCurrency(Math.round(totalCredits * 100)) }}</strong></td>
              <td role="gridcell"></td>
            </tr>
          </tfoot>
        </table>

        <div>
          <button type="button" @click="addLine" aria-label="Add new journal entry line">
            {{ t('addLineLabel') }}
          </button>
        </div>

        <div v-if="!isValid && totalDebits !== totalCredits" role="alert" aria-live="polite">
          {{ t('journalEntryUnbalancedError') }}
        </div>
      </fieldset>

      <!-- Submit Button -->
      <div>
        <button
          type="submit"
          :disabled="!isValid"
          :aria-describedby="!isValid ? 'submit-help' : undefined"
        >
          {{ t('saveJournalEntryLabel') }}
        </button>
        <div v-if="!isValid" id="submit-help" class="visually-hidden">Fix validation errors before saving</div>
      </div>
    </form>
  </main>
</template>

<style scoped>
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

form[aria-label="Create new journal entry"] {
  max-width: 1200px;
  margin: 0 auto;
}

fieldset[aria-labelledby="form-header-legend"] {
  display: grid;
  grid-template-columns: 1fr 200px;
  gap: 1rem;
  margin-bottom: 2rem;
  padding: 1rem;
  background-color: #f8f9fa;
  border-radius: 0.5rem;
  border: none;
}

fieldset[aria-labelledby="form-header-legend"] > div {
  display: flex;
  flex-direction: column;
}

fieldset[aria-labelledby="form-header-legend"] label {
  font-weight: 600;
  margin-bottom: 0.25rem;
  color: #374151;
}

fieldset[aria-labelledby="form-header-legend"] input,
fieldset[aria-labelledby="form-header-legend"] select {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

fieldset[aria-labelledby="form-header-legend"] input:focus,
fieldset[aria-labelledby="form-header-legend"] select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}

fieldset[aria-labelledby="form-lines-legend"] {
  border: none;
  padding: 0;
  margin: 0;
}

fieldset[aria-labelledby="form-lines-legend"] legend {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

table[aria-label="Journal entry lines form"] {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
}

table[aria-label="Journal entry lines form"] thead th {
  font-weight: 600;
  padding: 0.75rem;
  background-color: #f3f4f6;
  border: 1px solid #e5e7eb;
  text-align: left;
}

table[aria-label="Journal entry lines form"] tbody td {
  padding: 0.5rem;
  border: 1px solid #e5e7eb;
}

table[aria-label="Journal entry lines form"] tfoot td {
  padding: 0.75rem;
  background-color: #f9fafb;
  border: 1px solid #e5e7eb;
  border-top: 2px solid #374151;
  font-weight: 600;
}

table[aria-label="Journal entry lines form"] select,
table[aria-label="Journal entry lines form"] input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

table[aria-label="Journal entry lines form"] select:focus,
table[aria-label="Journal entry lines form"] input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}

button[aria-label*="Remove line"] {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  background-color: #ef4444;
  color: white;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s;
}

button[aria-label*="Remove line"]:hover:not(:disabled) {
  background-color: #dc2626;
}

button[aria-label*="Remove line"]:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button[aria-label="Add new journal entry line"] {
  padding: 0.5rem 1rem;
  background-color: #6b7280;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 1rem;
}

button[aria-label="Add new journal entry line"]:hover {
  background-color: #4b5563;
}

div[role="alert"] {
  color: #ef4444;
  font-weight: 500;
  padding: 0.5rem;
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 0.375rem;
  margin-bottom: 1rem;
}

form[aria-label="Create new journal entry"] > div:last-child {
  text-align: center;
  padding-top: 2rem;
  border-top: 1px solid #e5e7eb;
}

form[aria-label="Create new journal entry"] > div:last-child button {
  min-width: 200px;
  padding: 0.5rem 1rem;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

form[aria-label="Create new journal entry"] > div:last-child button:hover:not(:disabled) {
  background-color: #2563eb;
}

form[aria-label="Create new journal entry"] > div:last-child button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
