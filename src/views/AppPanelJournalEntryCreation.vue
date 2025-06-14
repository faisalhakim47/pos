<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, RouterLink } from 'vue-router';

import { MaterialSymbolArrowBackUrl } from '@/src/assets/material-symbols.js';
import SvgIcon from '@/src/components/SvgIcon.vue';
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

const functionalCurrencyQuery = useAsyncIterator(async function* () {
  yield 'fetching';
  const functionalCurrencyRes = await db.sql`
    select code, decimals
    from currency
    where is_functional_currency = 1
  `;

  if (functionalCurrencyRes[0].values.length === 0) {
    throw new Error('No functional currency found');
  }

  yield {
    code: String(functionalCurrencyRes[0].values[0][0]),
    decimals: Number(functionalCurrencyRes[0].values[0][1]),
  };
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
    router.replace({
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
  functionalCurrencyQuery.run();
});
</script>

<template>
  <main class="page">
    <header>
      <RouterLink :to="{ name: AppPanelJournalEntryListRoute }" replace :aria-label="t('literal.back')">
        <SvgIcon :src="MaterialSymbolArrowBackUrl" :alt="t('literal.back')" />
      </RouterLink>
      <h1>{{ t('journalEntryCreationTitle') }}</h1>
      <nav>
        <ul>
          <li>
            <RouterLink :to="{ name: AppPanelJournalEntryListRoute }" replace>{{ t('literal.back') }}</RouterLink>
          </li>
        </ul>
      </nav>
    </header>

    <form @submit.prevent="saveJournalEntry" style="max-width: 1200px;">
      <fieldset>
        <legend>{{ t('journalEntryInformationTitle') }}</legend>

        <label for="note">{{ t('literal.description') }}</label>
        <input
          id="note"
          type="text"
          v-model="note"
          :placeholder="t('journalEntryNotePlaceholder')"
        />

        <label for="currency">{{ t('literal.currency') }}</label>
        <select
          id="currency"
          v-model="transactionCurrencyCode"
          required
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
      </fieldset>

      <fieldset>
        <legend>{{ t('journalEntryLinesTitle') }}</legend>

        <table>
          <thead>
            <tr>
              <th style="width: 1fr;">{{ t('literal.account') }}</th>
              <th style="width: 150px;">{{ t('literal.debit') }}</th>
              <th style="width: 150px;">{{ t('literal.credit') }}</th>
              <th style="width: 100px;">{{ t('literal.actions') }}</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="(line, index) in lines" :key="index">
              <td>
                <label :for="`account-${index}`" class="sr-only">{{ t('accountForLineLabel') }} {{ index + 1 }}</label>
                <select
                  :id="`account-${index}`"
                  v-model="line.accountCode"
                  required
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
              </td>

              <td>
                <label :for="`debit-${index}`" class="sr-only">{{ t('debitAmountForLineLabel') }} {{ index + 1 }}</label>
                <input
                  :id="`debit-${index}`"
                  type="number"
                  step="0.01"
                  min="0"
                  :value="line.debit"
                  @input="handleDebitInput(index, $event)"
                  :placeholder="t('amountPlaceholder')"
                />
              </td>

              <td>
                <label :for="`credit-${index}`" class="sr-only">{{ t('creditAmountForLineLabel') }} {{ index + 1 }}</label>
                <input
                  :id="`credit-${index}`"
                  type="number"
                  step="0.01"
                  min="0"
                  :value="line.credit"
                  @input="handleCreditInput(index, $event)"
                  :placeholder="t('amountPlaceholder')"
                />
              </td>

              <td>
                <button
                  type="button"
                  @click="removeLine(index)"
                  :disabled="lines.length <= 2"
                  :aria-label="`${t('removeLineLabel')} ${index + 1}`"
                >
                  {{ t('literal.remove') }}
                </button>
              </td>
            </tr>
          </tbody>

          <tfoot>
            <tr>
              <td><strong>{{ t('literal.total') }}:</strong></td>
              <td style="text-align: right;"><strong>{{ (functionalCurrencyQuery.state && typeof functionalCurrencyQuery.state === 'object') ? formatter.formatCurrency(Math.round(totalDebits * 100), functionalCurrencyQuery.state.code, functionalCurrencyQuery.state.decimals) : '' }}</strong></td>
              <td style="text-align: right;"><strong>{{ (functionalCurrencyQuery.state && typeof functionalCurrencyQuery.state === 'object') ? formatter.formatCurrency(Math.round(totalCredits * 100), functionalCurrencyQuery.state.code, functionalCurrencyQuery.state.decimals) : '' }}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        <div>
          <button type="button" @click="addLine" :aria-label="t('addLineLabel')">
            {{ t('addLineLabel') }}
          </button>
        </div>

        <div v-if="!isValid && totalDebits !== totalCredits" aria-role="alert">
          {{ t('journalEntryUnbalancedError') }}
        </div>
      </fieldset>

      <div>
        <button
          type="submit"
          :disabled="!isValid"
        >
          {{ t('saveJournalEntryLabel') }}
        </button>
      </div>
    </form>
  </main>
</template>

<style scoped>
/* Screen reader only content */
.sr-only {
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

/* Form layout optimized for 1368x768 desktop */
form {
  margin: 0 auto;
}

form fieldset:first-of-type {
  display: grid;
  grid-template-columns: 1fr 200px;
  gap: 1rem;
  margin-bottom: 1rem;
}

/* Table input sizing for journal lines */
table input,
table select {
  width: 100%;
  box-sizing: border-box;
}

/* Remove button styling */
tbody button[type="button"] {
  background-color: #ef4444;
  color: white;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
}

tbody button[type="button"]:hover:not(:disabled) {
  background-color: #dc2626;
}

tbody button[type="button"]:disabled {
  opacity: 0.5;
}
</style>
