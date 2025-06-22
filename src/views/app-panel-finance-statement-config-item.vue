<script setup>
import { onMounted } from 'vue';

import { MaterialSymbolArrowBackUrl } from '@/src/assets/material-symbols.js';
import SvgIcon from '@/src/components/svg-icon.vue';
import { useAsyncIterator } from '@/src/composables/use-async-iterator.js';
import { useDb } from '@/src/context/db.js';
import { useI18n } from '@/src/i18n/i18n.js';
import { AppPanelDashboardRoute, AppPanelFinanceStatementConfigEditRoute } from '@/src/router/router.js';

const { t } = useI18n();
const db = useDb();

// Fetch configuration with related data
const configQuery = useAsyncIterator(async function* () {
  yield 'fetching';

  // Get the configuration with currency details and account details
  const configResult = await db.sql`
    select
      fsc.reporting_currency_code,
      c.name as reporting_currency_name,
      c.symbol as reporting_currency_symbol,
      fsc.balance_sheet_current_asset_tag,
      fsc.balance_sheet_non_current_asset_tag,
      fsc.balance_sheet_current_liability_tag,
      fsc.balance_sheet_non_current_liability_tag,
      fsc.balance_sheet_equity_tag,
      fsc.fiscal_year_closing_revenue_tag,
      fsc.fiscal_year_closing_expense_tag,
      fsc.fiscal_year_closing_dividend_tag,
      fsc.fiscal_year_closing_income_summary_account_code,
      fsc.fiscal_year_closing_retained_earnings_account_code,
      fsc.income_statement_revenue_tag,
      fsc.income_statement_contra_revenue_tag,
      fsc.income_statement_other_revenue_tag,
      fsc.income_statement_expense_tag,
      fsc.income_statement_other_expense_tag,
      fsc.income_statement_cogs_tag,
      income_summary.name as income_summary_account_name,
      retained_earnings.name as retained_earnings_account_name
    from finance_statement_config fsc
    join currency c on c.code = fsc.reporting_currency_code
    join account income_summary on income_summary.code = fsc.fiscal_year_closing_income_summary_account_code
    join account retained_earnings on retained_earnings.code = fsc.fiscal_year_closing_retained_earnings_account_code
    where fsc.id = 1
  `;

  if (configResult[0].values.length === 0) {
    throw new Error('Finance statement configuration not found');
  }

  const row = configResult[0].values[0];
  yield {
    reportingCurrencyCode: String(row[0]),
    reportingCurrencyName: String(row[1]),
    reportingCurrencySymbol: String(row[2]),
    balanceSheetCurrentAssetTag: String(row[3]),
    balanceSheetNonCurrentAssetTag: String(row[4]),
    balanceSheetCurrentLiabilityTag: String(row[5]),
    balanceSheetNonCurrentLiabilityTag: String(row[6]),
    balanceSheetEquityTag: String(row[7]),
    fiscalYearClosingRevenueTag: String(row[8]),
    fiscalYearClosingExpenseTag: String(row[9]),
    fiscalYearClosingDividendTag: String(row[10]),
    fiscalYearClosingIncomeSummaryAccountCode: Number(row[11]),
    fiscalYearClosingRetainedEarningsAccountCode: Number(row[12]),
    incomeStatementRevenueTag: String(row[13]),
    incomeStatementContraRevenueTag: String(row[14]),
    incomeStatementOtherRevenueTag: String(row[15]),
    incomeStatementExpenseTag: String(row[16]),
    incomeStatementOtherExpenseTag: String(row[17]),
    incomeStatementCogsTag: String(row[18]),
    incomeSummaryAccountName: String(row[19]),
    retainedEarningsAccountName: String(row[20]),
  };
});

onMounted(function () {
  configQuery.run();
});
</script>

<template>
  <main class="page">
    <header>
      <router-link :to="{ name: AppPanelDashboardRoute }" replace :aria-label="t('literal.back')">
        <svg-icon :src="MaterialSymbolArrowBackUrl" :alt="t('literal.back')" />
      </router-link>
      <h1>{{ t('financeStatementConfigItemTitle') }}</h1>
    </header>

    <div v-if="configQuery.state === 'fetching'">
      {{ t('literal.fetching') }}
    </div>

    <div v-else-if="configQuery.state && typeof configQuery.state === 'object'">
      <section>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h2>{{ t('financeStatementConfigGeneralSection') }}</h2>
          <router-link
            :to="{ name: AppPanelFinanceStatementConfigEditRoute }"
          >{{ t('financeStatementConfigEditNavLabel') }}</router-link>
        </div>

        <table>
          <tbody>
            <tr>
              <th scope="row">{{ t('financeStatementConfigReportingCurrencyLabel') }}</th>
              <td>
                {{ configQuery.state.reportingCurrencyCode }} - {{ configQuery.state.reportingCurrencyName }}
                ({{ configQuery.state.reportingCurrencySymbol }})
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>{{ t('financeStatementConfigBalanceSheetSection') }}</h2>
        <table>
          <tbody>
            <tr>
              <th scope="row">{{ t('financeStatementConfigBalanceSheetCurrentAssetTagLabel') }}</th>
              <td>{{ configQuery.state.balanceSheetCurrentAssetTag }}</td>
            </tr>
            <tr>
              <th scope="row">{{ t('financeStatementConfigBalanceSheetNonCurrentAssetTagLabel') }}</th>
              <td>{{ configQuery.state.balanceSheetNonCurrentAssetTag }}</td>
            </tr>
            <tr>
              <th scope="row">{{ t('financeStatementConfigBalanceSheetCurrentLiabilityTagLabel') }}</th>
              <td>{{ configQuery.state.balanceSheetCurrentLiabilityTag }}</td>
            </tr>
            <tr>
              <th scope="row">{{ t('financeStatementConfigBalanceSheetNonCurrentLiabilityTagLabel') }}</th>
              <td>{{ configQuery.state.balanceSheetNonCurrentLiabilityTag }}</td>
            </tr>
            <tr>
              <th scope="row">{{ t('financeStatementConfigBalanceSheetEquityTagLabel') }}</th>
              <td>{{ configQuery.state.balanceSheetEquityTag }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>{{ t('financeStatementConfigIncomeStatementSection') }}</h2>
        <table>
          <tbody>
            <tr>
              <th scope="row">{{ t('financeStatementConfigIncomeStatementRevenueTagLabel') }}</th>
              <td>{{ configQuery.state.incomeStatementRevenueTag }}</td>
            </tr>
            <tr>
              <th scope="row">{{ t('financeStatementConfigIncomeStatementContraRevenueTagLabel') }}</th>
              <td>{{ configQuery.state.incomeStatementContraRevenueTag }}</td>
            </tr>
            <tr>
              <th scope="row">{{ t('financeStatementConfigIncomeStatementOtherRevenueTagLabel') }}</th>
              <td>{{ configQuery.state.incomeStatementOtherRevenueTag }}</td>
            </tr>
            <tr>
              <th scope="row">{{ t('financeStatementConfigIncomeStatementExpenseTagLabel') }}</th>
              <td>{{ configQuery.state.incomeStatementExpenseTag }}</td>
            </tr>
            <tr>
              <th scope="row">{{ t('financeStatementConfigIncomeStatementOtherExpenseTagLabel') }}</th>
              <td>{{ configQuery.state.incomeStatementOtherExpenseTag }}</td>
            </tr>
            <tr>
              <th scope="row">{{ t('financeStatementConfigIncomeStatementCogsTagLabel') }}</th>
              <td>{{ configQuery.state.incomeStatementCogsTag }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>{{ t('financeStatementConfigFiscalYearClosingSection') }}</h2>
        <table>
          <tbody>
            <tr>
              <th scope="row">{{ t('financeStatementConfigFiscalYearClosingRevenueTagLabel') }}</th>
              <td>{{ configQuery.state.fiscalYearClosingRevenueTag }}</td>
            </tr>
            <tr>
              <th scope="row">{{ t('financeStatementConfigFiscalYearClosingExpenseTagLabel') }}</th>
              <td>{{ configQuery.state.fiscalYearClosingExpenseTag }}</td>
            </tr>
            <tr>
              <th scope="row">{{ t('financeStatementConfigFiscalYearClosingDividendTagLabel') }}</th>
              <td>{{ configQuery.state.fiscalYearClosingDividendTag }}</td>
            </tr>
            <tr>
              <th scope="row">{{ t('financeStatementConfigFiscalYearClosingIncomeSummaryAccountLabel') }}</th>
              <td>
                {{ configQuery.state.fiscalYearClosingIncomeSummaryAccountCode }} - {{ configQuery.state.incomeSummaryAccountName }}
              </td>
            </tr>
            <tr>
              <th scope="row">{{ t('financeStatementConfigFiscalYearClosingRetainedEarningsAccountLabel') }}</th>
              <td>
                {{ configQuery.state.fiscalYearClosingRetainedEarningsAccountCode }} - {{ configQuery.state.retainedEarningsAccountName }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </main>
</template>
