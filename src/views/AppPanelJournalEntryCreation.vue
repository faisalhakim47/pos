<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, RouterLink } from 'vue-router';

import { MaterialSymbolArrowBackUrl } from '@/src/assets/material-symbols.js';
import ComboboxSelect from '@/src/components/ComboboxSelect.vue';
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

// Form saving state
const isSaving = ref(false);

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

// Transform data for ComboboxSelect components
const accountOptions = computed(function () {
  if (!Array.isArray(accountsQuery.state)) return [];
  return accountsQuery.state.map(function (account) {
    return {
      value: String(account.code),
      label: `${account.code} - ${account.name}`,
    };
  });
});

const currencyOptions = computed(function () {
  if (!Array.isArray(currenciesQuery.state)) return [];
  return currenciesQuery.state.map(function (currency) {
    return {
      value: currency.code,
      label: `${currency.code} - ${currency.name}`,
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
    isSaving.value = true;

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
  } finally {
    isSaving.value = false;
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
    </header>

    <form @submit.prevent="saveJournalEntry">
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
        <ComboboxSelect
          id="currency"
          v-model="transactionCurrencyCode"
          :options="currencyOptions"
          :placeholder="t('selectCurrencyPlaceholder')"
          required
        />
      </fieldset>

      <fieldset>
        <legend>{{ t('journalEntryLinesTitle') }}</legend>

        <div>
          <button type="button" @click="addLine" :aria-label="t('addLineLabel')">
            {{ t('addLineLabel') }}
          </button>
        </div>

        <table>
          <thead>
            <tr>
              <th id="line-column" style="width: 60px;">{{ t('literal.line') }}</th>
              <th id="account-column" style="width: 1fr;">{{ t('literal.account') }}</th>
              <th id="debit-column" style="width: 150px;">{{ t('literal.debit') }}</th>
              <th id="credit-column" style="width: 150px;">{{ t('literal.credit') }}</th>
              <th style="width: 100px;">{{ t('literal.actions') }}</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="(line, index) in lines" :key="index">
              <td style="text-align: center;">
                <label :id="`line-${index + 1}`">{{ index + 1 }}</label>
              </td>

              <td>
                <ComboboxSelect
                  :id="`account-${index}`"
                  v-model="line.accountCode"
                  :options="accountOptions"
                  :placeholder="t('selectAccountPlaceholder')"
                  :ariaLabelledby="`account-column line-${index + 1}`"
                  required
                />
              </td>

              <td>
                <input
                  :id="`debit-${index}`"
                  type="number"
                  step="0.01"
                  min="0"
                  :value="line.debit"
                  @input="handleDebitInput(index, $event)"
                  :placeholder="t('amountPlaceholder')"
                  :aria-labelledby="`debit-column line-${index + 1}`"
                />
              </td>

              <td>
                <input
                  :id="`credit-${index}`"
                  type="number"
                  step="0.01"
                  min="0"
                  :value="line.credit"
                  @input="handleCreditInput(index, $event)"
                  :placeholder="t('amountPlaceholder')"
                  :aria-labelledby="`credit-column line-${index + 1}`"
                />
              </td>

              <td style="text-align: center;">
                <button
                  type="button"
                  class="btn-danger"
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
              <td colspan="2" style="text-align: right;"><strong>{{ t('literal.total') }}:</strong></td>
              <td style="text-align: right;"><strong>{{ (functionalCurrencyQuery.state && typeof functionalCurrencyQuery.state === 'object') ? formatter.formatCurrency(Math.round(totalDebits * 100), functionalCurrencyQuery.state.code, functionalCurrencyQuery.state.decimals) : '' }}</strong></td>
              <td style="text-align: right;"><strong>{{ (functionalCurrencyQuery.state && typeof functionalCurrencyQuery.state === 'object') ? formatter.formatCurrency(Math.round(totalCredits * 100), functionalCurrencyQuery.state.code, functionalCurrencyQuery.state.decimals) : '' }}</strong></td>
              <td style="text-align: center;"></td>
            </tr>
          </tfoot>
        </table>

        <div v-if="!isValid && totalDebits !== totalCredits" aria-role="alert">
          {{ t('journalEntryUnbalancedError') }}
        </div>
      </fieldset>

      <div>
        <button
          type="submit"
          :disabled="isSaving"
        >
          {{ isSaving ? t('saveJournalEntryProgressLabel') : t('saveJournalEntryLabel') }}
        </button>
      </div>
    </form>
  </main>
</template>

<style scoped>
form {
  display: grid !important;
  grid-template-columns: 1fr 2fr;
  grid-template-rows: auto 1fr;
  grid-template-areas:
    "info lines"
    "actions lines";
  gap: 1rem;

  &> fieldset:first-of-type {
    grid-area: info;
    position: sticky;
  }

  &> fieldset:last-of-type {
    grid-area: lines;

    &> div {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 0.5rem;

      button {
        margin-left: 0.5rem;
      }
    }

    label {
      display: inline-block;
      margin: 0;
    }
  }

  &> div {
    grid-area: actions;
    position: sticky;
  }
}
</style>
