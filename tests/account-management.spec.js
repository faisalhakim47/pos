// @ts-check

import { test, expect } from '@playwright/test';

import en from '../src/i18n/langs/en.js';

test.describe('Account Management', function () {

  test.beforeEach(async function ({ page }) {
    // for debugging purposes
    page.addListener('console', function (msg) {
      console.debug('PageConsole', msg.type(), msg.text());
    });
    page.addListener('pageerror', function (error) {
      console.error('PageError', error);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: en.onboardingNewFileCtaDefaultLabel }).click();
    await expect(page.getByText(en.dashboardTitle, { exact: true })).toBeVisible();

    // Navigate to account list from sidebar
    await page.getByRole('link', { name: en.menuItemAccountLabel, exact: true }).click();
    await expect(page.getByText(en.accountListTitle, { exact: true })).toBeVisible();
  });

  test('should display pre-seeded chart of accounts', async function ({ page }) {
    // Verify the page shows the chart of accounts title
    await expect(page.getByText(en.accountListTitle, { exact: true })).toBeVisible();

    // Check for "Create New Account" button
    await expect(page.getByRole('link', { name: en.accountCreationNavLabel })).toBeVisible();

    // Verify table headers are present
    await expect(page.getByText(en.literal.code, { exact: true })).toBeVisible();
    await expect(page.getByText(en.literal.type, { exact: true })).toBeVisible();
    await expect(page.getByText(en.literal.name, { exact: true })).toBeVisible();
    await expect(page.getByText(en.literal.currency, { exact: true })).toBeVisible();
    await expect(page.getByText(en.literal.balance, { exact: true })).toBeVisible();

    // Check that some default accounts are visible (from the SQL seed data)
    await expect(page.getByText('10100')).toBeVisible(); // Cash account
    await expect(page.getByText('Cash')).toBeVisible();
  });

  test('should create a new account successfully', async function ({ page }) {
    // Generate a unique account code based on timestamp
    const uniqueCode = 50000 + Math.floor(Math.random() * 9999);

    // Click the create new account link
    await page.getByRole('link', { name: en.accountCreationNavLabel }).click();

    // Verify we're on the creation page
    await expect(page.getByRole('heading', { name: en.accountCreationTitle })).toBeVisible();

    // Fill out the form
    await page.getByLabel(en.accountFormCodeLabel).fill(String(uniqueCode));
    await page.getByLabel(en.accountFormNameLabel).fill('Test Asset Account');
    await page.getByRole('combobox', { name: en.accountFormTypeLabel }).selectOption('asset');
    await page.getByRole('combobox', { name: en.accountFormCurrencyLabel }).selectOption('USD');

    // Submit the form
    await page.getByRole('button', { name: en.accountCreationSaveCtaLabel }).click();

    // Should redirect back to account list
    await expect(page.getByText(en.accountListTitle, { exact: true })).toBeVisible();

    // Verify the new account appears in the list
    await expect(page.getByText(String(uniqueCode))).toBeVisible();
    await expect(page.getByText('Test Asset Account')).toBeVisible();
  });

  test('should validate required fields in account creation', async function ({ page }) {
    // Generate a unique account code
    const uniqueCode = 50000 + Math.floor(Math.random() * 9999);

    // Click the create new account link
    await page.getByRole('link', { name: en.accountCreationNavLabel }).click();

    // Submit button should always be enabled (only disabled when loading)
    const submitButton = page.getByRole('button', { name: en.accountCreationSaveCtaLabel });
    await expect(submitButton).toBeEnabled();

    // Try to submit without filling any fields - should trigger validation
    await submitButton.click();
    // Browser should show HTML5 validation for required fields, preventing submission

    // Fill only account code
    await page.getByLabel(en.accountFormCodeLabel).fill(String(uniqueCode));
    await expect(submitButton).toBeEnabled();

    // Fill account name as well
    await page.getByLabel(en.accountFormNameLabel).fill('Test Account');
    await expect(submitButton).toBeEnabled();

    // Fill account type
    await page.getByRole('combobox', { name: en.accountFormTypeLabel }).selectOption('liability');

    // Now the button should be enabled (currency has a default value)
    await expect(submitButton).toBeEnabled();
  });

  test('should view account details', async function ({ page }) {
    // Click on an existing account code (assuming 10100 exists from seed data)
    await page.getByRole('link', { name: '10100' }).click();

    // Verify we're on the account detail page
    await expect(page.getByText(`${en.accountItemTitle} 10100`, { exact: true })).toBeVisible();

    // Check that account details are displayed
    await expect(page.getByText('Cash')).toBeVisible();
    await expect(page.getByText(en.literal.asset, { exact: true })).toBeVisible();

    // Check navigation links
    await expect(page.getByRole('link', { name: 'Back' })).toBeVisible();
    await expect(page.getByRole('link', { name: en.accountEditNavLabel })).toBeVisible();
  });

  test('should edit existing account successfully', async function ({ page }) {
    // Click on an existing account
    await page.getByRole('link', { name: '10100' }).click();

    // Click edit link
    await page.getByRole('link', { name: en.accountEditNavLabel }).click();

    // Verify we're on the edit page
    await expect(page.getByText(`${en.accountEditTitle} 10100`, { exact: true })).toBeVisible();

    // The account code should be disabled
    const codeInput = page.getByLabel(en.accountFormCodeLabel);
    await expect(codeInput).toBeDisabled();

    // Change the account name
    const nameInput = page.getByLabel(en.accountFormNameLabel);
    await nameInput.clear();
    await nameInput.fill('Updated Cash Account');

    // Submit the form
    await page.getByRole('button', { name: en.accountEditUpdateCtaLabel }).click();

    // Should redirect back to account detail
    await expect(page.getByText(`${en.accountItemTitle} 10100`, { exact: true })).toBeVisible();

    // Verify the updated name is displayed
    await expect(page.getByText('Updated Cash Account')).toBeVisible();
  });

  test('should handle navigation between account pages', async function ({ page }) {
    // Start at account list
    await expect(page.getByText(en.accountListTitle, { exact: true })).toBeVisible();

    // Go to create new account
    await page.getByRole('link', { name: en.accountCreationNavLabel }).click();
    await expect(page.getByRole('heading', { name: en.accountCreationTitle })).toBeVisible();

    // Navigate back using browser back button
    await page.goBack();
    await expect(page.getByText(en.accountListTitle, { exact: true })).toBeVisible();

    // Go to account detail
    await page.getByRole('link', { name: '10100' }).click();
    await expect(page.getByText(`${en.accountItemTitle} 10100`, { exact: true })).toBeVisible();

    // Go to edit
    await page.getByRole('link', { name: en.accountEditNavLabel }).click();
    await expect(page.getByText(`${en.accountEditTitle} 10100`, { exact: true })).toBeVisible();

    // Use "Back to Item" link (hierarchical navigation: Edit -> Item -> List)
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByText(`${en.accountItemTitle} 10100`, { exact: true })).toBeVisible();

    // Now use "Back to List" link to go to list
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByText(en.accountListTitle, { exact: true })).toBeVisible();
  });

});
