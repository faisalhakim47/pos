<script setup>
import { computed, onMounted, reactive } from 'vue';
import { useRouter, RouterLink } from 'vue-router';

import { MaterialSymbolArrowBackUrl } from '@/src/assets/material-symbols.js';
import ComboboxSelect from '@/src/components/combobox-select.vue';
import SvgIcon from '@/src/components/svg-icon.vue';
import UnhandledError from '@/src/components/unhandled-error.vue';
import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useFormatter } from '@/src/context/formatter.js';
import { usePlatform } from '@/src/context/platform.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelJournalEntryListRoute, AppPanelJournalEntryItemRoute } from '@/src/router/router.js';
import { assertInstanceOf } from '@/src/tools/assertion.js';
import { sleep } from '@/src/tools/promise.js';

const { t } = useI18n();
const db = useDb();
const formatter = useFormatter();
const router = useRouter();
const platform = usePlatform();

const journalEntryForm = reactive({
  note: '',
  currencyCode: 'USD',
  mode: '',
  lines: [
    { accountCode: '', debit: '', credit: '' },
    { accountCode: '', debit: '', credit: '' },
  ],
});

// Form validation
const isValid = computed(function () {
  // Check if at least 2 lines have account codes
  const validLines = journalEntryForm.lines.filter(function (line) {
    return line.accountCode && (parseFloat(line.debit) > 0 || parseFloat(line.credit) > 0);
  });

  if (validLines.length % 2 !== 0) return false;

  const totalDebits = validLines.reduce(function (sum, line) {
    return sum + (parseFloat(line.debit) || 0);
  }, 0);
  const totalCredits = validLines.reduce(function (sum, line) {
    return sum + (parseFloat(line.credit) || 0);
  }, 0);

  return Math.abs(totalDebits - totalCredits) < 0.01; // Allow for small rounding differences
});

const totalDebits = computed(function () {
  return journalEntryForm.lines.reduce(function (sum, line) {
    return sum + (parseFloat(line.debit) || 0);
  }, 0);
});

const totalCredits = computed(function () {
  return journalEntryForm.lines.reduce(function (sum, line) {
    return sum + (parseFloat(line.credit) || 0);
  }, 0);
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
    select code, name, decimals
    from currency
    where is_active = 1
    order by code asc
  `;
  yield currencyQueryRes[0].values.map(function (row) {
    return {
      code: String(row[0]),
      name: String(row[1]),
      decimals: Number(row[2]),
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

const transactionCurrencyDetails = computed(function () {
  if (!Array.isArray(currenciesQuery.state)) return null;
  return currenciesQuery.state.find(function (currency) {
    return currency.code === journalEntryForm.currencyCode;
  });
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
  journalEntryForm.lines.push({ accountCode: '', debit: '', credit: '' });
}

function removeLine(index) {
  if (journalEntryForm.lines.length > 2) {
    journalEntryForm.lines.splice(index, 1);
  }
}

/**
 * @param {number} index
 * @param {Event} event
 */
function handleDebitInput(index, event) {
  assertInstanceOf(HTMLInputElement, event.target);
  const value = event.target.value;
  journalEntryForm.lines[index].debit = value;
  if (value) {
    journalEntryForm.lines[index].credit = '';
  }
}

/**
 * @param {number} index
 * @param {Event} event
 */
function handleCreditInput(index, event) {
  assertInstanceOf(HTMLInputElement, event.target);
  const value = event.target.value;
  journalEntryForm.lines[index].credit = value;
  if (value) {
    journalEntryForm.lines[index].debit = '';
  }
}

const journalEntryCreation = useAsyncIterator(async function* (/** @type {{ draft: boolean }} */ options) {
  try {
    if (!isValid.value) return;

    yield 'submitting';

    const nowTime = Math.round(platform.date().getTime() / 1000);

    // Get transaction currency decimals for proper conversion
    const currencyDecimals = transactionCurrencyDetails.value?.decimals ?? 2;
    const multiplier = Math.pow(10, currencyDecimals);

    await db.sql`begin transaction`;

    const journalEntryInsert = await db.sql`
      insert into journal_entry (transaction_time, note, transaction_currency_code)
      values (${nowTime}, ${journalEntryForm.note}, ${journalEntryForm.currencyCode})
      returning ref
    `;
    const journalEntryRef = Number(journalEntryInsert[0].values[0][0]);

    for (const line of journalEntryForm.lines) {
      // Skip empty lines
      if (!line.accountCode || (!line.debit && !line.credit)) continue;

      // Convert decimal amounts to integer using currency-specific decimals
      const debitAmount = line.debit ? Math.round(parseFloat(line.debit) * multiplier) : 0;
      const creditAmount = line.credit ? Math.round(parseFloat(line.credit) * multiplier) : 0;

      await db.sql`
        insert into journal_entry_line_auto_number (
          journal_entry_ref, account_code, db, cr, db_functional, cr_functional
        ) values (
          ${journalEntryRef}, ${Number(line.accountCode)}, ${debitAmount}, ${creditAmount}, ${debitAmount}, ${creditAmount}
        )
      `;
    }

    // Post immediately if requested
    if (options.draft === false) {
      await db.sql`
        update journal_entry
        set post_time = ${nowTime}
        where ref = ${journalEntryRef}
      `;
    }

    await db.sql`commit`;

    router.replace({
      name: AppPanelJournalEntryItemRoute,
      params: { journalEntryRef },
    });
  }
  catch (error) {
    await db.sql`rollback`;
    throw error;
  }
  finally {
    yield 'reporting';
    await sleep(1000);
  }
});

onMounted(function () {
  accountsQuery.run();
  currenciesQuery.run();
  functionalCurrencyQuery.run();
});
</script>

<template>
  <main class="page">
    <header>
      <router-link :to="{ name: AppPanelJournalEntryListRoute }" replace :aria-label="t('literal.back')">
        <svg-icon :src="MaterialSymbolArrowBackUrl" :alt="t('literal.back')" />
      </router-link>
      <h1>{{ t('journalEntryCreationTitle') }}</h1>
    </header>


    <form @submit.prevent>
      <unhandled-error :error="functionalCurrencyQuery.error" />
      <unhandled-error :error="currenciesQuery.error" />

      <fieldset>
        <legend>{{ t('journalEntryCreationInformationTitle') }}</legend>

        <label for="note">{{ t('literal.description') }}</label>
        <input
          id="note"
          type="text"
          v-model="journalEntryForm.note"
          :placeholder="t('journalEntryCreationNotePlaceholder')"
        />

        <label for="currency">{{ t('literal.currency') }}</label>
        <combobox-select
          id="currency"
          v-model="journalEntryForm.currencyCode"
          :options="currencyOptions"
          :placeholder="t('journalEntryCreationCurrencySelectPlaceholder')"
          required
        />
      </fieldset>

      <fieldset>
        <legend>{{ t('journalEntryCreationLinesTitle') }}</legend>

        <unhandled-error :error="accountsQuery.error" />

        <div>
          <button type="button" @click="addLine" :aria-label="t('journalEntryCreationLineCtaAddLabel')">
            {{ t('journalEntryCreationLineCtaAddLabel') }}
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
            <tr v-for="(line, index) in journalEntryForm.lines" :key="index">
              <td style="text-align: center;">
                <label :id="`line-${index + 1}`">{{ index + 1 }}</label>
              </td>

              <td>
                <combobox-select
                  :id="`account-${index}`"
                  v-model="line.accountCode"
                  :options="accountOptions"
                  :placeholder="t('journalEntryCreationLineAccountSelectPlaceholder')"
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
                  :placeholder="t('journalEntryCreationLineAmountInputPlaceholder')"
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
                  :placeholder="t('journalEntryCreationLineAmountInputPlaceholder')"
                  :aria-labelledby="`credit-column line-${index + 1}`"
                />
              </td>

              <td style="text-align: center;">
                <button
                  type="button"
                  class="danger"
                  @click="removeLine(index)"
                  :disabled="journalEntryForm.lines.length <= 2"
                  :aria-label="`${t('journalEntryCreationLineCtaRemoveLabel')} ${index + 1}`"
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
          {{ t('journalEntryCreationUnbalancedError') }}
        </div>
      </fieldset>

      <div>
        <button
          type="submit"
          name="mode"
          value="draft"
          @click="journalEntryCreation.run({ draft: true })"
          :disabled="journalEntryCreation.state === 'submitting'"
        >
          {{ journalEntryCreation.state === 'submitting' ? t('journalEntryCreationCtaDraftProgressLabel') : t('journalEntryCreationCtaDraftLabel') }}
        </button>

        <button
          type="submit"
          name="mode"
          value="post"
          @click="journalEntryCreation.run({ draft: false })"
          :disabled="journalEntryCreation.state === 'submitting'"
        >
          {{ journalEntryCreation.state === 'submitting' ? t('journalEntryCreationCtaPostProgressLabel') : t('journalEntryCreationCtaPostLabel') }}
        </button>
      </div>

      <unhandled-error :error="journalEntryCreation.error" />
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
  gap: 16px;

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
  }
}
</style>
