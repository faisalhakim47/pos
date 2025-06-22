<script setup>
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { MaterialSymbolArrowBackUrl } from '@/src/assets/material-symbols.js';
import SvgIcon from '@/src/components/svg-icon.vue';
import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelFinanceStatementConfigItemRoute } from '@/src/router/router.js';

const { t } = useI18n();
const db = useDb();
const router = useRouter();

const reportingCurrencyCode = ref('');
const balanceSheetCurrentAssetTag = ref('');
const balanceSheetNonCurrentAssetTag = ref('');
const balanceSheetCurrentLiabilityTag = ref('');
const balanceSheetNonCurrentLiabilityTag = ref('');
const balanceSheetEquityTag = ref('');
const fiscalYearClosingRevenueTag = ref('');
const fiscalYearClosingExpenseTag = ref('');
const fiscalYearClosingDividendTag = ref('');
const fiscalYearClosingIncomeSummaryAccountCode = ref('');
const fiscalYearClosingRetainedEarningsAccountCode = ref('');
const incomeStatementRevenueTag = ref('');
const incomeStatementContraRevenueTag = ref('');
const incomeStatementOtherRevenueTag = ref('');
const incomeStatementExpenseTag = ref('');
const incomeStatementOtherExpenseTag = ref('');
const incomeStatementCogsTag = ref('');

// Fetch configuration
const configQuery = useAsyncIterator(async function* () {
  yield 'fetching';
  const result = await db.sql`
    select
      reporting_currency_code,
      balance_sheet_current_asset_tag,
      balance_sheet_non_current_asset_tag,
      balance_sheet_current_liability_tag,
      balance_sheet_non_current_liability_tag,
      balance_sheet_equity_tag,
      fiscal_year_closing_revenue_tag,
      fiscal_year_closing_expense_tag,
      fiscal_year_closing_dividend_tag,
      fiscal_year_closing_income_summary_account_code,
      fiscal_year_closing_retained_earnings_account_code,
      income_statement_revenue_tag,
      income_statement_contra_revenue_tag,
      income_statement_other_revenue_tag,
      income_statement_expense_tag,
      income_statement_other_expense_tag,
      income_statement_cogs_tag
    from finance_statement_config
    where id = 1
  `;

  if (result[0].values.length === 0) {
    throw new Error('Finance statement configuration not found');
  }

  const row = result[0].values[0];
  yield {
    reportingCurrencyCode: String(row[0]),
    balanceSheetCurrentAssetTag: String(row[1]),
    balanceSheetNonCurrentAssetTag: String(row[2]),
    balanceSheetCurrentLiabilityTag: String(row[3]),
    balanceSheetNonCurrentLiabilityTag: String(row[4]),
    balanceSheetEquityTag: String(row[5]),
    fiscalYearClosingRevenueTag: String(row[6]),
    fiscalYearClosingExpenseTag: String(row[7]),
    fiscalYearClosingDividendTag: String(row[8]),
    fiscalYearClosingIncomeSummaryAccountCode: Number(row[9]),
    fiscalYearClosingRetainedEarningsAccountCode: Number(row[10]),
    incomeStatementRevenueTag: String(row[11]),
    incomeStatementContraRevenueTag: String(row[12]),
    incomeStatementOtherRevenueTag: String(row[13]),
    incomeStatementExpenseTag: String(row[14]),
    incomeStatementOtherExpenseTag: String(row[15]),
    incomeStatementCogsTag: String(row[16]),
  };
});

// Fetch currencies
const currenciesQuery = useAsyncIterator(async function* () {
  yield 'fetching';
  const result = await db.sql`
    select code, name, symbol
    from currency
    where is_active = 1
    order by code asc
  `;
  yield result[0].values.map(function (row) {
    return {
      code: String(row[0]),
      name: String(row[1]),
      symbol: String(row[2]),
    };
  });
});

// Fetch accounts for income summary and retained earnings
const accountsQuery = useAsyncIterator(async function* () {
  yield 'fetching';
  const result = await db.sql`
    select code, name, account_type_name
    from account
    order by code asc
  `;
  yield result[0].values.map(function (row) {
    return {
      code: Number(row[0]),
      name: String(row[1]),
      accountTypeName: String(row[2]),
    };
  });
});

// Update configuration
const updateConfigQuery = useAsyncIterator(async function* () {
  yield 'saving';

  await db.sql`
    update finance_statement_config
    set reporting_currency_code = ${reportingCurrencyCode.value},
        balance_sheet_current_asset_tag = ${balanceSheetCurrentAssetTag.value},
        balance_sheet_non_current_asset_tag = ${balanceSheetNonCurrentAssetTag.value},
        balance_sheet_current_liability_tag = ${balanceSheetCurrentLiabilityTag.value},
        balance_sheet_non_current_liability_tag = ${balanceSheetNonCurrentLiabilityTag.value},
        balance_sheet_equity_tag = ${balanceSheetEquityTag.value},
        fiscal_year_closing_revenue_tag = ${fiscalYearClosingRevenueTag.value},
        fiscal_year_closing_expense_tag = ${fiscalYearClosingExpenseTag.value},
        fiscal_year_closing_dividend_tag = ${fiscalYearClosingDividendTag.value},
        fiscal_year_closing_income_summary_account_code = ${parseInt(fiscalYearClosingIncomeSummaryAccountCode.value, 10)},
        fiscal_year_closing_retained_earnings_account_code = ${parseInt(fiscalYearClosingRetainedEarningsAccountCode.value, 10)},
        income_statement_revenue_tag = ${incomeStatementRevenueTag.value},
        income_statement_contra_revenue_tag = ${incomeStatementContraRevenueTag.value},
        income_statement_other_revenue_tag = ${incomeStatementOtherRevenueTag.value},
        income_statement_expense_tag = ${incomeStatementExpenseTag.value},
        income_statement_other_expense_tag = ${incomeStatementOtherExpenseTag.value},
        income_statement_cogs_tag = ${incomeStatementCogsTag.value}
    where id = 1
  `;

  yield 'success';

  // Navigate back to configuration item view
  router.push({ name: AppPanelFinanceStatementConfigItemRoute });
});

// Watch for config data and populate form
watch(
  function () { return configQuery.state; },
  function (config) {
    if (config && typeof config === 'object') {
      reportingCurrencyCode.value = config.reportingCurrencyCode;
      balanceSheetCurrentAssetTag.value = config.balanceSheetCurrentAssetTag;
      balanceSheetNonCurrentAssetTag.value = config.balanceSheetNonCurrentAssetTag;
      balanceSheetCurrentLiabilityTag.value = config.balanceSheetCurrentLiabilityTag;
      balanceSheetNonCurrentLiabilityTag.value = config.balanceSheetNonCurrentLiabilityTag;
      balanceSheetEquityTag.value = config.balanceSheetEquityTag;
      fiscalYearClosingRevenueTag.value = config.fiscalYearClosingRevenueTag;
      fiscalYearClosingExpenseTag.value = config.fiscalYearClosingExpenseTag;
      fiscalYearClosingDividendTag.value = config.fiscalYearClosingDividendTag;
      fiscalYearClosingIncomeSummaryAccountCode.value = String(config.fiscalYearClosingIncomeSummaryAccountCode);
      fiscalYearClosingRetainedEarningsAccountCode.value = String(config.fiscalYearClosingRetainedEarningsAccountCode);
      incomeStatementRevenueTag.value = config.incomeStatementRevenueTag;
      incomeStatementContraRevenueTag.value = config.incomeStatementContraRevenueTag;
      incomeStatementOtherRevenueTag.value = config.incomeStatementOtherRevenueTag;
      incomeStatementExpenseTag.value = config.incomeStatementExpenseTag;
      incomeStatementOtherExpenseTag.value = config.incomeStatementOtherExpenseTag;
      incomeStatementCogsTag.value = config.incomeStatementCogsTag;
    }
  },
);

onMounted(function () {
  configQuery.run();
  currenciesQuery.run();
  accountsQuery.run();
});

function handleSubmit() {
  if (!reportingCurrencyCode.value || !fiscalYearClosingIncomeSummaryAccountCode.value || !fiscalYearClosingRetainedEarningsAccountCode.value) {
    return;
  }
  updateConfigQuery.run();
}
</script>

<template>
  <main class="page">
    <header>
      <router-link :to="{ name: AppPanelFinanceStatementConfigItemRoute }" replace :aria-label="t('literal.back')">
        <svg-icon :src="MaterialSymbolArrowBackUrl" :alt="t('literal.back')" />
      </router-link>
      <h1>{{ t('financeStatementConfigEditTitle') }}</h1>
    </header>

    <div v-if="configQuery.state === 'fetching'">
      {{ t('literal.fetching') }}
    </div>

    <form v-else-if="configQuery.state && typeof configQuery.state === 'object'" @submit.prevent="handleSubmit" style="max-width: 720px;">
      <fieldset>
        <legend>{{ t('financeStatementConfigGeneralSection') }}</legend>

        <label for="reporting-currency">{{ t('financeStatementConfigReportingCurrencyLabel') }}</label>
        <select id="reporting-currency" v-model="reportingCurrencyCode" required>
          <template v-if="Array.isArray(currenciesQuery.state)">
            <option
              v-for="currency in currenciesQuery.state"
              :key="currency.code"
              :value="currency.code"
            >
              {{ currency.code }} - {{ currency.name }}
            </option>
          </template>
        </select>
        <small>{{ t('financeStatementConfigReportingCurrencyHelp') }}</small>
      </fieldset>

      <fieldset>
        <legend>{{ t('financeStatementConfigBalanceSheetSection') }}</legend>

        <label for="balance-sheet-current-asset-tag">{{ t('financeStatementConfigBalanceSheetCurrentAssetTagLabel') }}</label>
        <input
          id="balance-sheet-current-asset-tag"
          v-model="balanceSheetCurrentAssetTag"
          type="text"
          required
        />

        <label for="balance-sheet-non-current-asset-tag">{{ t('financeStatementConfigBalanceSheetNonCurrentAssetTagLabel') }}</label>
        <input
          id="balance-sheet-non-current-asset-tag"
          v-model="balanceSheetNonCurrentAssetTag"
          type="text"
          required
        />

        <label for="balance-sheet-current-liability-tag">{{ t('financeStatementConfigBalanceSheetCurrentLiabilityTagLabel') }}</label>
        <input
          id="balance-sheet-current-liability-tag"
          v-model="balanceSheetCurrentLiabilityTag"
          type="text"
          required
        />

        <label for="balance-sheet-non-current-liability-tag">{{ t('financeStatementConfigBalanceSheetNonCurrentLiabilityTagLabel') }}</label>
        <input
          id="balance-sheet-non-current-liability-tag"
          v-model="balanceSheetNonCurrentLiabilityTag"
          type="text"
          required
        />

        <label for="balance-sheet-equity-tag">{{ t('financeStatementConfigBalanceSheetEquityTagLabel') }}</label>
        <input
          id="balance-sheet-equity-tag"
          v-model="balanceSheetEquityTag"
          type="text"
          required
        />
      </fieldset>

      <fieldset>
        <legend>{{ t('financeStatementConfigIncomeStatementSection') }}</legend>

        <label for="income-statement-revenue-tag">{{ t('financeStatementConfigIncomeStatementRevenueTagLabel') }}</label>
        <input
          id="income-statement-revenue-tag"
          v-model="incomeStatementRevenueTag"
          type="text"
          required
        />

        <label for="income-statement-contra-revenue-tag">{{ t('financeStatementConfigIncomeStatementContraRevenueTagLabel') }}</label>
        <input
          id="income-statement-contra-revenue-tag"
          v-model="incomeStatementContraRevenueTag"
          type="text"
          required
        />

        <label for="income-statement-other-revenue-tag">{{ t('financeStatementConfigIncomeStatementOtherRevenueTagLabel') }}</label>
        <input
          id="income-statement-other-revenue-tag"
          v-model="incomeStatementOtherRevenueTag"
          type="text"
          required
        />

        <label for="income-statement-expense-tag">{{ t('financeStatementConfigIncomeStatementExpenseTagLabel') }}</label>
        <input
          id="income-statement-expense-tag"
          v-model="incomeStatementExpenseTag"
          type="text"
          required
        />

        <label for="income-statement-other-expense-tag">{{ t('financeStatementConfigIncomeStatementOtherExpenseTagLabel') }}</label>
        <input
          id="income-statement-other-expense-tag"
          v-model="incomeStatementOtherExpenseTag"
          type="text"
          required
        />

        <label for="income-statement-cogs-tag">{{ t('financeStatementConfigIncomeStatementCogsTagLabel') }}</label>
        <input
          id="income-statement-cogs-tag"
          v-model="incomeStatementCogsTag"
          type="text"
          required
        />
      </fieldset>

      <fieldset>
        <legend>{{ t('financeStatementConfigFiscalYearClosingSection') }}</legend>

        <label for="fiscal-year-closing-revenue-tag">{{ t('financeStatementConfigFiscalYearClosingRevenueTagLabel') }}</label>
        <input
          id="fiscal-year-closing-revenue-tag"
          v-model="fiscalYearClosingRevenueTag"
          type="text"
          required
        />

        <label for="fiscal-year-closing-expense-tag">{{ t('financeStatementConfigFiscalYearClosingExpenseTagLabel') }}</label>
        <input
          id="fiscal-year-closing-expense-tag"
          v-model="fiscalYearClosingExpenseTag"
          type="text"
          required
        />

        <label for="fiscal-year-closing-dividend-tag">{{ t('financeStatementConfigFiscalYearClosingDividendTagLabel') }}</label>
        <input
          id="fiscal-year-closing-dividend-tag"
          v-model="fiscalYearClosingDividendTag"
          type="text"
          required
        />

        <label for="fiscal-year-closing-income-summary-account">{{ t('financeStatementConfigFiscalYearClosingIncomeSummaryAccountLabel') }}</label>
        <select id="fiscal-year-closing-income-summary-account" v-model="fiscalYearClosingIncomeSummaryAccountCode" required>
          <option value="">{{ t('financeStatementConfigSelectAccountLabel') }}</option>
          <template v-if="Array.isArray(accountsQuery.state)">
            <option
              v-for="account in accountsQuery.state"
              :key="account.code"
              :value="account.code"
            >
              {{ account.code }} - {{ account.name }}
            </option>
          </template>
        </select>

        <label for="fiscal-year-closing-retained-earnings-account">{{ t('financeStatementConfigFiscalYearClosingRetainedEarningsAccountLabel') }}</label>
        <select id="fiscal-year-closing-retained-earnings-account" v-model="fiscalYearClosingRetainedEarningsAccountCode" required>
          <option value="">{{ t('financeStatementConfigSelectAccountLabel') }}</option>
          <template v-if="Array.isArray(accountsQuery.state)">
            <option
              v-for="account in accountsQuery.state"
              :key="account.code"
              :value="account.code"
            >
              {{ account.code }} - {{ account.name }}
            </option>
          </template>
        </select>
      </fieldset>

      <div>
        <button
          type="submit"
          :disabled="updateConfigQuery.state === 'saving'"
        >
          {{
            updateConfigQuery.state === 'saving'
              ? t('financeStatementConfigUpdateCtaProgressLabel')
              : t('financeStatementConfigUpdateCtaLabel')
          }}
        </button>
      </div>
    </form>
  </main>
</template>
