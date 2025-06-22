// @ts-check

import { test, expect } from '@playwright/test';

import en from '../src/i18n/langs/en.js';

test.describe('Finance Statement Configuration Management', function () {

  test.beforeEach(async function ({ page }) {
    // for debugging purposes
    page.addListener('console', function (msg) {
      if (msg.text().includes('[vite]')) return; // Ignore Vite logs
      console.debug('PageConsole', msg.type(), msg.text());
    });
    page.addListener('pageerror', function (error) {
      console.error('PageError', error);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: en.onboardingNewFileCtaDefaultLabel }).click();
    await expect(page.getByText(en.dashboardTitle, { exact: true })).toBeVisible();
  });

  test('should display finance statement configuration from sidebar', async function ({ page }) {
    // Navigate to finance configuration from sidebar
    await page.getByRole('link', { name: en.menuItemFinanceConfigLabel, exact: true }).click();
    await expect(page.getByText(en.financeStatementConfigItemTitle, { exact: true })).toBeVisible();

    // Wait for the loading to complete
    await page.waitForSelector('table', { timeout: 10000 });

    // Check if we can see the configuration sections
    await expect(page.getByText(en.financeStatementConfigGeneralSection)).toBeVisible();
    await expect(page.getByText(en.financeStatementConfigBalanceSheetSection)).toBeVisible();
    await expect(page.getByText(en.financeStatementConfigIncomeStatementSection)).toBeVisible();
    await expect(page.getByText(en.financeStatementConfigFiscalYearClosingSection)).toBeVisible();
  });

  test('should allow editing finance statement configuration', async function ({ page }) {
    // Navigate to finance configuration from sidebar
    await page.getByRole('link', { name: en.menuItemFinanceConfigLabel, exact: true }).click();
    await expect(page.getByText(en.financeStatementConfigItemTitle, { exact: true })).toBeVisible();

    // Click edit link
    await page.getByRole('link', { name: en.financeStatementConfigEditNavLabel, exact: true }).click();
    await expect(page.getByText(en.financeStatementConfigEditTitle, { exact: true })).toBeVisible();

    // Verify form elements are present using IDs to be more specific
    await expect(page.locator('#reporting-currency')).toBeVisible();
    await expect(page.locator('#balance-sheet-current-asset-tag')).toBeVisible();
    await expect(page.locator('#income-statement-revenue-tag')).toBeVisible();
    await expect(page.locator('#fiscal-year-closing-income-summary-account')).toBeVisible();

    // Verify the update button is present
    await expect(page.getByRole('button', { name: en.financeStatementConfigUpdateCtaLabel })).toBeVisible();

    // Test updating a simple field
    const revenueTagInput = page.locator('#income-statement-revenue-tag');
    await revenueTagInput.fill('test_revenue_tag');

    // Save the changes
    await page.getByRole('button', { name: en.financeStatementConfigUpdateCtaLabel }).click();

    // Should navigate back to item view
    await expect(page.getByText(en.financeStatementConfigItemTitle, { exact: true })).toBeVisible();

    // Wait for data to load and verify the change was saved
    await page.waitForSelector('table', { timeout: 10000 });
    await expect(page.getByText('test_revenue_tag')).toBeVisible();
  });

  test('should navigate properly using back buttons', async function ({ page }) {
    // Navigate to finance configuration
    await page.getByRole('link', { name: en.menuItemFinanceConfigLabel, exact: true }).click();
    await expect(page.getByText(en.financeStatementConfigItemTitle, { exact: true })).toBeVisible();

    // Go to edit view
    await page.getByRole('link', { name: en.financeStatementConfigEditNavLabel, exact: true }).click();
    await expect(page.getByText(en.financeStatementConfigEditTitle, { exact: true })).toBeVisible();

    // Use back button to return to item view
    await page.getByRole('link', { name: en.literal.back, exact: true }).click();
    await expect(page.getByText(en.financeStatementConfigItemTitle, { exact: true })).toBeVisible();

    // Use back button to return to dashboard
    await page.getByRole('link', { name: en.literal.back, exact: true }).click();
    await expect(page.getByText(en.dashboardTitle, { exact: true })).toBeVisible();
  });

});
