<script setup>
import { onMounted, reactive, watch } from 'vue';
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

const configForm = reactive({
  reportingCurrencyCode: '',
  balanceSheetCurrentAssetTag: '',
  balanceSheetNonCurrentAssetTag: '',
  balanceSheetCurrentLiabilityTag: '',
  balanceSheetNonCurrentLiabilityTag: '',
  balanceSheetEquityTag: '',
  fiscalYearClosingRevenueTag: '',
  fiscalYearClosingExpenseTag: '',
  fiscalYearClosingDividendTag: '',
  fiscalYearClosingIncomeSummaryAccountCode: '',
  fiscalYearClosingRetainedEarningsAccountCode: '',
  incomeStatementRevenueTag: '',
  incomeStatementContraRevenueTag: '',
  incomeStatementOtherRevenueTag: '',
  incomeStatementExpenseTag: '',
  incomeStatementOtherExpenseTag: '',
  incomeStatementCogsTag: '',
});

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

const updateConfigQuery = useAsyncIterator(async function* () {
  yield 'saving';

  await db.sql`
    update finance_statement_config set
      reporting_currency_code = ${configForm.reportingCurrencyCode},
      balance_sheet_current_asset_tag = ${configForm.balanceSheetCurrentAssetTag},
      balance_sheet_non_current_asset_tag = ${configForm.balanceSheetNonCurrentAssetTag},
      balance_sheet_current_liability_tag = ${configForm.balanceSheetCurrentLiabilityTag},
      balance_sheet_non_current_liability_tag = ${configForm.balanceSheetNonCurrentLiabilityTag},
      balance_sheet_equity_tag = ${configForm.balanceSheetEquityTag},
      fiscal_year_closing_revenue_tag = ${configForm.fiscalYearClosingRevenueTag},
      fiscal_year_closing_expense_tag = ${configForm.fiscalYearClosingExpenseTag},
      fiscal_year_closing_dividend_tag = ${configForm.fiscalYearClosingDividendTag},
      fiscal_year_closing_income_summary_account_code = ${parseInt(configForm.fiscalYearClosingIncomeSummaryAccountCode, 10)},
      fiscal_year_closing_retained_earnings_account_code = ${parseInt(configForm.fiscalYearClosingRetainedEarningsAccountCode, 10)},
      income_statement_revenue_tag = ${configForm.incomeStatementRevenueTag},
      income_statement_contra_revenue_tag = ${configForm.incomeStatementContraRevenueTag},
      income_statement_other_revenue_tag = ${configForm.incomeStatementOtherRevenueTag},
      income_statement_expense_tag = ${configForm.incomeStatementExpenseTag},
      income_statement_other_expense_tag = ${configForm.incomeStatementOtherExpenseTag},
      income_statement_cogs_tag = ${configForm.incomeStatementCogsTag}
    where id = 1
  `;

  yield 'success';

  router.push({ name: AppPanelFinanceStatementConfigItemRoute });
});

watch(
  function () { return configQuery.state; },
  function (config) {
    if (config && typeof config === 'object') {
      configForm.reportingCurrencyCode = config.reportingCurrencyCode;
      configForm.balanceSheetCurrentAssetTag = config.balanceSheetCurrentAssetTag;
      configForm.balanceSheetNonCurrentAssetTag = config.balanceSheetNonCurrentAssetTag;
      configForm.balanceSheetCurrentLiabilityTag = config.balanceSheetCurrentLiabilityTag;
      configForm.balanceSheetNonCurrentLiabilityTag = config.balanceSheetNonCurrentLiabilityTag;
      configForm.balanceSheetEquityTag = config.balanceSheetEquityTag;
      configForm.fiscalYearClosingRevenueTag = config.fiscalYearClosingRevenueTag;
      configForm.fiscalYearClosingExpenseTag = config.fiscalYearClosingExpenseTag;
      configForm.fiscalYearClosingDividendTag = config.fiscalYearClosingDividendTag;
      configForm.fiscalYearClosingIncomeSummaryAccountCode = String(config.fiscalYearClosingIncomeSummaryAccountCode);
      configForm.fiscalYearClosingRetainedEarningsAccountCode = String(config.fiscalYearClosingRetainedEarningsAccountCode);
      configForm.incomeStatementRevenueTag = config.incomeStatementRevenueTag;
      configForm.incomeStatementContraRevenueTag = config.incomeStatementContraRevenueTag;
      configForm.incomeStatementOtherRevenueTag = config.incomeStatementOtherRevenueTag;
      configForm.incomeStatementExpenseTag = config.incomeStatementExpenseTag;
      configForm.incomeStatementOtherExpenseTag = config.incomeStatementOtherExpenseTag;
      configForm.incomeStatementCogsTag = config.incomeStatementCogsTag;
    }
  },
);

onMounted(function () {
  configQuery.run();
  currenciesQuery.run();
  accountsQuery.run();
});
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

    <form v-else-if="configQuery.state && typeof configQuery.state === 'object'" @submit.prevent="updateConfigQuery.run" style="max-width: 720px;">
      <fieldset>
        <legend>{{ t('financeStatementConfigGeneralSection') }}</legend>

        <label for="reporting-currency">{{ t('financeStatementConfigReportingCurrencyLabel') }}</label>
        <select id="reporting-currency" v-model="configForm.reportingCurrencyCode" required>
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
          v-model="configForm.balanceSheetCurrentAssetTag"
          type="text"
          required
        />

        <label for="balance-sheet-non-current-asset-tag">{{ t('financeStatementConfigBalanceSheetNonCurrentAssetTagLabel') }}</label>
        <input
          id="balance-sheet-non-current-asset-tag"
          v-model="configForm.balanceSheetNonCurrentAssetTag"
          type="text"
          required
        />

        <label for="balance-sheet-current-liability-tag">{{ t('financeStatementConfigBalanceSheetCurrentLiabilityTagLabel') }}</label>
        <input
          id="balance-sheet-current-liability-tag"
          v-model="configForm.balanceSheetCurrentLiabilityTag"
          type="text"
          required
        />

        <label for="balance-sheet-non-current-liability-tag">{{ t('financeStatementConfigBalanceSheetNonCurrentLiabilityTagLabel') }}</label>
        <input
          id="balance-sheet-non-current-liability-tag"
          v-model="configForm.balanceSheetNonCurrentLiabilityTag"
          type="text"
          required
        />

        <label for="balance-sheet-equity-tag">{{ t('financeStatementConfigBalanceSheetEquityTagLabel') }}</label>
        <input
          id="balance-sheet-equity-tag"
          v-model="configForm.balanceSheetEquityTag"
          type="text"
          required
        />
      </fieldset>

      <fieldset>
        <legend>{{ t('financeStatementConfigIncomeStatementSection') }}</legend>

        <label for="income-statement-revenue-tag">{{ t('financeStatementConfigIncomeStatementRevenueTagLabel') }}</label>
        <input
          id="income-statement-revenue-tag"
          v-model="configForm.incomeStatementRevenueTag"
          type="text"
          required
        />

        <label for="income-statement-contra-revenue-tag">{{ t('financeStatementConfigIncomeStatementContraRevenueTagLabel') }}</label>
        <input
          id="income-statement-contra-revenue-tag"
          v-model="configForm.incomeStatementContraRevenueTag"
          type="text"
          required
        />

        <label for="income-statement-other-revenue-tag">{{ t('financeStatementConfigIncomeStatementOtherRevenueTagLabel') }}</label>
        <input
          id="income-statement-other-revenue-tag"
          v-model="configForm.incomeStatementOtherRevenueTag"
          type="text"
          required
        />

        <label for="income-statement-expense-tag">{{ t('financeStatementConfigIncomeStatementExpenseTagLabel') }}</label>
        <input
          id="income-statement-expense-tag"
          v-model="configForm.incomeStatementExpenseTag"
          type="text"
          required
        />

        <label for="income-statement-other-expense-tag">{{ t('financeStatementConfigIncomeStatementOtherExpenseTagLabel') }}</label>
        <input
          id="income-statement-other-expense-tag"
          v-model="configForm.incomeStatementOtherExpenseTag"
          type="text"
          required
        />

        <label for="income-statement-cogs-tag">{{ t('financeStatementConfigIncomeStatementCogsTagLabel') }}</label>
        <input
          id="income-statement-cogs-tag"
          v-model="configForm.incomeStatementCogsTag"
          type="text"
          required
        />
      </fieldset>

      <fieldset>
        <legend>{{ t('financeStatementConfigFiscalYearClosingSection') }}</legend>

        <label for="fiscal-year-closing-revenue-tag">{{ t('financeStatementConfigFiscalYearClosingRevenueTagLabel') }}</label>
        <input
          id="fiscal-year-closing-revenue-tag"
          v-model="configForm.fiscalYearClosingRevenueTag"
          type="text"
          required
        />

        <label for="fiscal-year-closing-expense-tag">{{ t('financeStatementConfigFiscalYearClosingExpenseTagLabel') }}</label>
        <input
          id="fiscal-year-closing-expense-tag"
          v-model="configForm.fiscalYearClosingExpenseTag"
          type="text"
          required
        />

        <label for="fiscal-year-closing-dividend-tag">{{ t('financeStatementConfigFiscalYearClosingDividendTagLabel') }}</label>
        <input
          id="fiscal-year-closing-dividend-tag"
          v-model="configForm.fiscalYearClosingDividendTag"
          type="text"
          required
        />

        <label for="fiscal-year-closing-income-summary-account">{{ t('financeStatementConfigFiscalYearClosingIncomeSummaryAccountLabel') }}</label>
        <select id="fiscal-year-closing-income-summary-account" v-model="configForm.fiscalYearClosingIncomeSummaryAccountCode" required>
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
        <select id="fiscal-year-closing-retained-earnings-account" v-model="configForm.fiscalYearClosingRetainedEarningsAccountCode" required>
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
