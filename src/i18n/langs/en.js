// @ts-check

export default {
  literal: {
    account: 'Account',
    accountName: 'Account Name',
    actions: 'Actions',
    amount: 'Amount',
    asset: 'Asset',
    back: 'Back',
    balance: 'Balance',
    cancel: 'Cancel',
    code: 'Code',
    cogs: 'Cost of Goods Sold',
    contra_asset: 'Contra-Asset',
    contra_equity: 'Contra-Equity',
    contra_expense: 'Contra-Expense',
    contra_liability: 'Contra-Liability',
    contra_revenue: 'Contra-Revenue',
    correctedBy: 'Corrected By',
    credit: 'Credit',
    currency: 'Currency',
    date: 'Date',
    debit: 'Debit',
    decimals: 'Decimals',
    delete: 'Delete',
    description: 'Description',
    equity: 'Equity',
    exchangeRate: 'Exchange Rate',
    expense: 'Expense',
    fetching: 'Loading...',
    information: 'Information',
    liability: 'Liability',
    line: 'Line',
    lines: 'Lines',
    name: 'Name',
    noDescription: 'No description',
    posted: 'Posted',
    ref: 'Ref',
    remove: 'Remove',
    revenue: 'Revenue',
    reversedBy: 'Reversed By',
    status: 'Status',
    submitting: 'Submitting...',
    symbol: 'Symbol',
    tag: 'Tag',
    total: 'Total',
    type: 'Type',
    unposted: 'Unposted',
  },

  appBrand: 'POS',
  appSlogan: 'Point of Sale Web App by faisalhakim47',

  loadingIndicatorLabel: 'Loading...',

  menuItemAccountLabel: 'Chart of Accounts Page',
  menuItemAccountTagLabel: 'Account Tags Page',
  menuItemCurrencyListLabel: 'Currency List Page',
  menuItemDashboardLabel: 'Dashboard Page',
  menuItemFinanceConfigLabel: 'Finance Configuration',
  menuItemJournalEntryLabel: 'Journal Entries',

  dashboardTitle: 'Dashboard',

  onboardingTitle: 'Welcome!',
  onboardingSubtitle: 'First, open existing data or create a new one.',
  onboardingNewFileCtaDefaultLabel: 'Create New File',
  onboardingNewFileCtaProgressLabel: 'Creating New File...',
  onboardingOpenFileCtaDefaultLabel: 'Open File',
  onboardingOpenFileCtaProgressLabel: 'Opening File...',

  onboardingSwInstallationCta: 'Install',
  onboardingSwInstallationCtaCompleted: 'Installed',
  onboardingSwInstallationProgressLabel: 'Installing service worker',

  unsupportedPlatformTitle: 'Your browser is not supported',
  unsupportedPlatformMessage: 'Unfortunately, the platform you are using is not supported by this application. Please use following browsers:',

  // Currency Management
  currencyCreationNavLabel: 'Create New Currency',
  currencyCreationSaveCtaLabel: 'Create',
  currencyCreationSaveCtaProgressLabel: 'Creating new currency...',
  currencyCreationTitle: 'Create Currency',
  currencyEditNavLabel: 'Edit Currency',
  currencyEditTitle: 'Update Currency of',
  currencyEditUpdateCtaLabel: 'Update',
  currencyEditUpdateCtaProgressLabel: 'Updating currency...',
  currencyEditUpdateCtaSuccessLabel: 'Updated',
  currencyFormCodeLabel: 'Currency Code',
  currencyFormCodePlaceholder: 'ISO 4217 currency code (e.g., USD, EUR)',
  currencyFormDecimalsHelpText: 'This application uses smallest unit of the currency (e.g., cents for USD) for calculations. Decimal places determine how to properly display the currency.',
  currencyFormDecimalsLabel: 'Decimals',
  currencyFormDecimalsPlaceholder: 'Decimal places of smallest unit of the currency (e.g., 2 for cents)',
  currencyFormNameLabel: 'Currency Name',
  currencyFormNamePlaceholder: 'Full name of the currency',
  currencyFormSymbolLabel: 'Currency Symbol',
  currencyFormSymbolPlaceholder: 'Symbol for the currency (e.g., $, €, £)',
  currencyItemTitle: 'Currency Detail Of',
  currencyListTitle: 'Currency List',

  // Account Management
  accountCreationNavLabel: 'Create New Account',
  accountCreationSaveCtaLabel: 'Create',
  accountCreationSaveCtaProgressLabel: 'Creating new account...',
  accountCreationTitle: 'Create Account',
  accountEditNavLabel: 'Edit Account',
  accountEditTitle: 'Update Account',
  accountEditUpdateCtaLabel: 'Update',
  accountEditUpdateCtaProgressLabel: 'Updating account...',
  accountEditUpdateCtaSuccessLabel: 'Updated',
  accountFormCodeLabel: 'Account Code',
  accountFormCodePlaceholder: '5-digit account code (10000-99999)',
  accountFormNameLabel: 'Account Name',
  accountFormNamePlaceholder: 'Descriptive name for the account',
  accountFormTypeLabel: 'Account Type',
  accountFormCurrencyLabel: 'Currency',
  accountItemTitle: 'Account Detail',
  accountListSubtitle: 'Manage your chart of accounts here.',
  accountListTitle: 'Chart of Accounts',

  // Account Tag Management
  accountTagCreationAccountLabel: 'Account',
  accountTagCreationAccountPlaceholder: 'Select an account',
  accountTagCreationDuplicateError: 'This account tag combination already exists',
  accountTagCreationNavLabel: 'Create Tag',
  accountTagCreationSubmissionError: 'Failed to create account tag',
  accountTagCreationSubmitLabel: 'Create Tag',
  accountTagCreationTagLabel: 'Tag Name',
  accountTagCreationTagPlaceholder: 'Enter tag name',
  accountTagCreationTitle: 'Create Account Tag',
  accountTagCreationValidationError: 'Please select an account and enter a tag',
  accountTagDeleteConfirmation: 'Are you sure you want to delete this account tag?',
  accountTagDeleteError: 'Failed to delete account tag',
  accountTagDeleteCtaLabel: 'Delete',
  accountTagDeleteCtaProgress: 'Deleting',
  accountTagDeleteCtaDelete: 'Deleted',
  accountTagDeleteCancelLabel: 'Cancel',
  accountTagEditAccountPlaceholder: 'Select an account',
  accountTagEditDuplicateError: 'This account tag combination already exists',
  accountTagEditNavLabel: 'Edit',
  accountTagEditSubmissionError: 'Failed to update account tag',
  accountTagEditSubmitLabel: 'Update Tag',
  accountTagEditTagPlaceholder: 'Enter tag name',
  accountTagEditTitle: 'Edit Account Tag',
  accountTagEditValidationError: 'Please select an account and enter a tag',
  accountTagItemTitle: 'Account Tag Details',
  accountTagListTitle: 'Account Tags',

  // Journal Entry Management
  journalEntryCreationCtaDraftLabel: 'Save as Draft',
  journalEntryCreationCtaDraftProgressLabel: 'Saving Journal Entry...',
  journalEntryCreationCtaPostLabel: 'Post Immediately',
  journalEntryCreationCtaPostProgressLabel: 'Posting Journal Entry...',
  journalEntryCreationCurrencySelectPlaceholder: 'Select a currency',
  journalEntryCreationInformationTitle: 'Journal Entry Information',
  journalEntryCreationLineAccountSelectPlaceholder: 'Select an account',
  journalEntryCreationLineAmountInputPlaceholder: '0.00',
  journalEntryCreationLineCreditInputLabel: 'Credit amount for line',
  journalEntryCreationLineCtaAddLabel: 'Add Line',
  journalEntryCreationLineCtaRemoveLabel: 'Remove line',
  journalEntryCreationLineDebitInputLabel: 'Debit amount for line',
  journalEntryCreationLinesTitle: 'Journal Entry Lines',
  journalEntryCreationListSubtitle: 'Manage your journal entries and transactions here.',
  journalEntryCreationNavLabel: 'Create New Journal Entry',
  journalEntryCreationNotePlaceholder: 'Enter description for this journal entry',
  journalEntryCreationTitle: 'Create Journal Entry',
  journalEntryCreationUnbalancedError: 'Debits must equal credits',
  journalEntryEditNavLabel: 'Edit Journal Entry',
  journalEntryEditTitle: 'Edit Journal Entry',
  journalEntryItemNotFound: 'Journal entry not found',
  journalEntryItemTitle: 'Journal Entry Details',
  journalEntryListTitle: 'Journal Entries',
  journalEntryListEmpty: 'No journal entries found',

  // Finance Reporting Configuration
  financeStatementConfigEditTitle: 'Finance Statement Configuration',
  financeStatementConfigEditNavLabel: 'Edit Configuration',
  financeStatementConfigItemTitle: 'Finance Statement Configuration',
  financeStatementConfigItemNotFound: 'Finance statement configuration not found',
  financeStatementConfigGeneralSection: 'General Settings',
  financeStatementConfigReportingCurrencyLabel: 'Reporting Currency',
  financeStatementConfigReportingCurrencyHelp: 'The currency used for financial reporting and consolidation',
  financeStatementConfigBalanceSheetSection: 'Balance Sheet Settings',
  financeStatementConfigBalanceSheetCurrentAssetTagLabel: 'Current Asset Tag',
  financeStatementConfigBalanceSheetNonCurrentAssetTagLabel: 'Non-Current Asset Tag',
  financeStatementConfigBalanceSheetCurrentLiabilityTagLabel: 'Current Liability Tag',
  financeStatementConfigBalanceSheetNonCurrentLiabilityTagLabel: 'Non-Current Liability Tag',
  financeStatementConfigBalanceSheetEquityTagLabel: 'Equity Tag',
  financeStatementConfigIncomeStatementSection: 'Income Statement Settings',
  financeStatementConfigIncomeStatementRevenueTagLabel: 'Revenue Tag',
  financeStatementConfigIncomeStatementContraRevenueTagLabel: 'Contra-Revenue Tag',
  financeStatementConfigIncomeStatementOtherRevenueTagLabel: 'Other Revenue Tag',
  financeStatementConfigIncomeStatementExpenseTagLabel: 'Expense Tag',
  financeStatementConfigIncomeStatementOtherExpenseTagLabel: 'Other Expense Tag',
  financeStatementConfigIncomeStatementCogsTagLabel: 'Cost of Goods Sold Tag',
  financeStatementConfigFiscalYearClosingSection: 'Fiscal Year Closing Settings',
  financeStatementConfigFiscalYearClosingRevenueTagLabel: 'Revenue Closing Tag',
  financeStatementConfigFiscalYearClosingExpenseTagLabel: 'Expense Closing Tag',
  financeStatementConfigFiscalYearClosingDividendTagLabel: 'Dividend Closing Tag',
  financeStatementConfigFiscalYearClosingIncomeSummaryAccountLabel: 'Income Summary Account',
  financeStatementConfigFiscalYearClosingRetainedEarningsAccountLabel: 'Retained Earnings Account',
  financeStatementConfigSelectAccountLabel: 'Select an account',
  financeStatementConfigUpdateCtaLabel: 'Update Configuration',
  financeStatementConfigUpdateCtaProgressLabel: 'Updating...',
};
