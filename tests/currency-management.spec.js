// @ts-check

import { test, expect } from '@playwright/test';

import en from '../src/i18n/langs/en.js';

test.describe('Currency Management', function () {
  test.beforeEach(async function ({ page }) {
    // Attach listeners for debugging Playwright test runs
    page.addListener('console', function (msg) {
      if (msg.text().includes('[vite]')) return;
      console.debug('PageConsole', msg.type(), msg.text());
    });
    page.addListener('pageerror', function (error) {
      console.error('PageError', error);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: en.onboardingNewFileCtaDefaultLabel }).click();
    await expect(page.getByText(en.dashboardTitle, { exact: true })).toBeVisible();

    // Navigate to currency list from sidebar
    await page.getByRole('link', { name: en.menuItemCurrencyListLabel }).click();
    await expect(page.getByText(en.currencyListTitle, { exact: true })).toBeVisible();
  });

  test('should display pre-seeded currency list', async function ({ page }) {
    // Wait for the currency data to load
    const currencyTable = page.getByRole('table');

    // Wait for at least one currency row to be visible (excluding header)
    await expect(currencyTable.getByRole('row').nth(1)).toBeVisible();

    // Check that the currency list contains pre-seeded currencies (may have extra currencies from previous test runs)
    const currencyRows = currencyTable.getByRole('row').filter({ hasNotText: en.literal.code }); // Exclude header row
    const count = await currencyRows.count();
    expect(count).toBeGreaterThanOrEqual(29); // At least the seeded currencies

    // Verify that headers are present
    await expect(page.getByRole('columnheader', { name: en.literal.code })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: en.literal.symbol })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: en.literal.name })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: en.literal.decimals })).toBeVisible();

    // Verify some expected currencies are present
    await expect(page.getByText('US Dollar')).toBeVisible();
    await expect(page.getByText('Euro')).toBeVisible();
    await expect(page.getByText('British Pound')).toBeVisible();
  });

  test('should create a new custom currency successfully', async function ({ page }) {
    // Navigate to currency creation
    await page.getByRole('link', { name: en.currencyCreationNavLabel }).click();
    await expect(page.getByText(en.currencyCreationTitle)).toBeVisible();

    // Use a unique 3-character code (database constraint requires exactly 3 chars)
    const uniqueCode = 'XY' + Math.floor(Math.random() * 10); // e.g., XY1, XY7, etc.
    await page.getByLabel(en.currencyFormCodeLabel).fill(uniqueCode);
    await page.getByLabel(en.currencyFormNameLabel).fill('Test Cryptocurrency');
    await page.getByLabel(en.currencyFormSymbolLabel).fill('Ⓧ');
    await page.getByLabel(en.currencyFormDecimalsLabel).fill('8');

    // Submit the form
    await page.getByRole('button', { name: en.currencyCreationSaveCtaLabel }).click();

    // Verify redirect to currency list and currency appears
    await expect(page.getByText(en.currencyListTitle, { exact: true })).toBeVisible();
    await expect(page.getByText('Test Cryptocurrency')).toBeVisible();
    await expect(page.getByText(uniqueCode.toUpperCase())).toBeVisible(); // Should be uppercase in display
    await expect(page.getByText('Ⓧ')).toBeVisible();
    await expect(page.getByRole('cell', { name: '8', exact: true })).toBeVisible();
  });

  test('should validate required fields in currency creation', async function ({ page }) {
    await page.getByRole('link', { name: en.currencyCreationNavLabel }).click();
    await expect(page.getByText(en.currencyCreationTitle)).toBeVisible();

    // Try to submit without filling required fields
    await page.getByRole('button', { name: en.currencyCreationSaveCtaLabel }).click();

    // Check that form validation prevents submission
    await expect(page.getByText(en.currencyCreationTitle)).toBeVisible(); // Still on creation page

    // Fill only code and try again
    await page.getByLabel(en.currencyFormCodeLabel).fill('ABC');
    await page.getByRole('button', { name: en.currencyCreationSaveCtaLabel }).click();
    await expect(page.getByText(en.currencyCreationTitle)).toBeVisible(); // Still on creation page
  });

  test('should view currency details for existing currency', async function ({ page }) {
    // Click on USD to view details (USD should exist in pre-seeded data)
    await page.getByRole('link', { name: 'USD' }).click();

    // Verify currency item page loads
    await expect(page.getByText(`${en.currencyItemTitle} USD`)).toBeVisible();

    // Wait for the data to load - the currencyFetcher might be still loading
    await page.waitForTimeout(2000);

    // Verify the currency details are displayed by checking for key-value pairs
    await expect(page.getByText(en.literal.code, { exact: true })).toBeVisible();
    await expect(page.getByText(en.literal.name, { exact: true })).toBeVisible();
    await expect(page.getByText(en.literal.symbol, { exact: true })).toBeVisible();
    await expect(page.getByText(en.literal.decimals, { exact: true })).toBeVisible();

    // Verify edit link is present
    await expect(page.getByRole('link', { name: en.currencyEditNavLabel })).toBeVisible();
  });

  test('should edit existing currency successfully', async function ({ page }) {
    // Navigate to EUR currency details (EUR should exist in pre-seeded data)
    await page.getByRole('link', { name: 'EUR' }).click();

    // Navigate to edit page
    await page.getByRole('link', { name: en.currencyEditNavLabel }).click();
    await expect(page.getByText(en.currencyEditTitle)).toBeVisible();

    // Verify form is pre-filled with existing values
    await expect(page.getByLabel(en.currencyFormCodeLabel)).toHaveValue('EUR');
    await expect(page.getByLabel(en.currencyFormNameLabel)).toHaveValue('Euro');
    await expect(page.getByLabel(en.currencyFormSymbolLabel)).toHaveValue('€');
    await expect(page.getByLabel(en.currencyFormDecimalsLabel)).toHaveValue('2');

    // Verify code field is disabled (can't be edited)
    await expect(page.getByLabel(en.currencyFormCodeLabel)).toBeDisabled();

    // Edit the currency (only name to avoid affecting other tests)
    const originalName = await page.getByLabel(en.currencyFormNameLabel).inputValue();
    await page.getByLabel(en.currencyFormNameLabel).fill('Euro (Test Modified)');

    // Submit the update
    await page.getByRole('button', { name: en.currencyEditUpdateCtaLabel }).click();

    // Wait for success message
    await expect(page.getByText(en.currencyEditUpdateCtaSuccessLabel)).toBeVisible();

    // Restore original name to avoid affecting other tests
    await page.getByLabel(en.currencyFormNameLabel).fill(originalName);
    await page.getByRole('button', { name: en.currencyEditUpdateCtaLabel }).click();
    await expect(page.getByText(en.currencyEditUpdateCtaSuccessLabel)).toBeVisible();
  });

  test('should prevent creating duplicate currency codes', async function ({ page }) {
    // This test expects a database error for duplicate code
    page.removeAllListeners('pageerror');

    await page.getByRole('link', { name: en.currencyCreationNavLabel }).click();

    // Try to create a currency with code that already exists (USD)
    await page.getByLabel(en.currencyFormCodeLabel).fill('USD');
    await page.getByLabel(en.currencyFormNameLabel).fill('Duplicate Dollar');
    await page.getByLabel(en.currencyFormSymbolLabel).fill('$');
    await page.getByLabel(en.currencyFormDecimalsLabel).fill('2');

    // Click submit button but expect error due to unique constraint
    await page.getByRole('button', { name: en.currencyCreationSaveCtaLabel }).click();

    // Wait a bit for any error processing
    await page.waitForTimeout(1000);

    // Should stay on creation page due to database constraint error
    // Note: In a real application, this should show a user-friendly error message
    await expect(page.getByText(en.currencyCreationTitle)).toBeVisible();
  });

  test('should enforce currency code format constraints', async function ({ page }) {
    await page.getByRole('link', { name: en.currencyCreationNavLabel }).click();

    // Test minimum length constraint (should be 3 characters)
    await page.getByLabel(en.currencyFormCodeLabel).fill('AB');
    await page.getByLabel(en.currencyFormNameLabel).fill('Test Currency');
    await page.getByLabel(en.currencyFormSymbolLabel).fill('T');
    await page.getByLabel(en.currencyFormDecimalsLabel).fill('2');
    await page.getByRole('button', { name: en.currencyCreationSaveCtaLabel }).click();

    // Should not proceed due to minlength constraint
    await expect(page.getByText(en.currencyCreationTitle)).toBeVisible();

    // Test that uppercase transformation is handled by CSS (style="text-transform: uppercase;")
    await page.getByLabel(en.currencyFormCodeLabel).fill('abc');
    // The input will display as ABC due to CSS text-transform, but value remains 'abc' until form processing
    // This is expected behavior with CSS text-transform
    await expect(page.getByLabel(en.currencyFormCodeLabel)).toHaveValue('abc');
  });

  test('should validate decimal places constraints', async function ({ page }) {
    await page.getByRole('link', { name: en.currencyCreationNavLabel }).click();

    // Test negative decimals
    await page.getByLabel(en.currencyFormCodeLabel).fill('TST');
    await page.getByLabel(en.currencyFormNameLabel).fill('Test Currency');
    await page.getByLabel(en.currencyFormSymbolLabel).fill('T');
    await page.getByLabel(en.currencyFormDecimalsLabel).fill('-1');
    await page.getByRole('button', { name: en.currencyCreationSaveCtaLabel }).click();

    // Should not proceed due to min="0" constraint
    await expect(page.getByText(en.currencyCreationTitle)).toBeVisible();
  });

  test('should handle navigation between currency pages', async function ({ page }) {
    // Test navigation: List -> Item -> Edit -> back to list
    await page.getByRole('link', { name: 'GBP' }).click();
    await expect(page.getByText(`${en.currencyItemTitle} GBP`)).toBeVisible();

    await page.getByRole('link', { name: en.currencyEditNavLabel }).click();
    await expect(page.getByText(en.currencyEditTitle)).toBeVisible();

    // Navigate back to currency list using sidebar
    await page.getByRole('link', { name: en.menuItemCurrencyListLabel }).click();
    await expect(page.getByText(en.currencyListTitle, { exact: true })).toBeVisible();
    await expect(page.getByText('British Pound')).toBeVisible();
  });

  test('should display currencies in alphabetical order by code', async function ({ page }) {
    // Wait for the currency data to load
    const currencyTable = page.getByRole('table');

    // Wait for at least one currency row to be visible (excluding header)
    await expect(currencyTable.getByRole('row').nth(1)).toBeVisible();

    const currencyRows = currencyTable.getByRole('row').filter({ hasNotText: en.literal.code }); // Exclude header row
    const count = await currencyRows.count();
    expect(count).toBeGreaterThanOrEqual(29); // At least the seeded currencies

    // Get the first few currency codes and verify they're in alphabetical order
    const firstRow = currencyRows.nth(0);
    const secondRow = currencyRows.nth(1);
    const thirdRow = currencyRows.nth(2);

    const firstCode = await firstRow.getByRole('cell').nth(0).textContent();
    const secondCode = await secondRow.getByRole('cell').nth(0).textContent();
    const thirdCode = await thirdRow.getByRole('cell').nth(0).textContent();

    // Verify alphabetical ordering
    expect(firstCode?.localeCompare(secondCode || '')).toBeLessThanOrEqual(0);
    expect(secondCode?.localeCompare(thirdCode || '')).toBeLessThanOrEqual(0);
  });

  test('should display correct currency information in table', async function ({ page }) {
    // Find USD row by looking for a row that contains USD
    const currencyTable = page.getByRole('table');
    const usdRow = currencyTable.getByRole('row').filter({ hasText: 'USD' });
    await expect(usdRow).toBeVisible();

    // Check that USD row contains expected data
    await expect(usdRow).toContainText('USD');
    await expect(usdRow).toContainText('US Dollar');
    await expect(usdRow).toContainText('$');
    await expect(usdRow).toContainText('2');
  });
});
