// @ts-check

import { test, expect } from '@playwright/test';

import en from '../src/i18n/langs/en.js';

test.describe('Journal Entry Management', function () {
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
  });

  test('should display journal entries page', async function ({ page }) {
    // Navigate to journal entries from dashboard
    await page.getByRole('link', { name: en.menuItemJournalEntryLabel, exact: true }).click();

    // Check if we're on the journal entries list page
    await expect(page.getByRole('heading', { name: en.journalEntryListTitle })).toBeVisible();

    // Check for the create new journal entry button
    await expect(page.getByText(en.journalEntryCreationNavLabel)).toBeVisible();

    // Check for the table headers
    await expect(page.getByText('Ref')).toBeVisible();
    await expect(page.getByText('Date')).toBeVisible();
    await expect(page.getByText('Description')).toBeVisible();
    await expect(page.getByText('Amount')).toBeVisible();
    await expect(page.getByText('Status')).toBeVisible();
  });

  test('should navigate to journal entry creation page', async function ({ page }) {
    // Navigate to journal entries
    await page.getByRole('link', { name: en.menuItemJournalEntryLabel, exact: true }).click();

    // Click create new journal entry
    await page.getByText(en.journalEntryCreationNavLabel).click();

    // Check if we're on the creation page
    await expect(page.getByText(en.journalEntryCreationTitle, { exact: true })).toBeVisible();

    // Check for form fields
    await expect(page.getByText('Description')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Currency' })).toBeVisible();

    // Check for journal entry lines section
    await expect(page.getByText(en.journalEntryLinesTitle)).toBeVisible();

    // Check for at least 2 lines by default
    const firstAccountSelect = page.getByRole('combobox', { name: 'Account 1' });
    const secondAccountSelect = page.getByRole('combobox', { name: 'Account 2' });
    await expect(firstAccountSelect).toBeVisible();
    await expect(secondAccountSelect).toBeVisible();
  });

  test('should create a simple journal entry', async function ({ page }) {
    // Navigate to journal entries
    await page.getByRole('link', { name: en.menuItemJournalEntryLabel, exact: true }).click();

    // Click create new journal entry
    await page.getByText(en.journalEntryCreationNavLabel).click();

    // Fill in journal entry details
    await page.getByPlaceholder('Enter description for this journal entry').fill('Test Journal Entry');

    // Select accounts and enter amounts for first line (debit)
    // Wait for accounts to load by checking the combobox is ready
    const firstAccountSelect = page.getByRole('combobox', { name: 'Account 1' });
    await expect(firstAccountSelect).toBeVisible();

    // Type in the combobox to search and select account
    await firstAccountSelect.fill('10100');
    await firstAccountSelect.press('ArrowDown');
    await firstAccountSelect.press('Enter');

    // Fill debit amount for first line
    const firstDebitInput = page.locator('input[id="debit-0"]');
    await firstDebitInput.fill('1000');

    // Select account and enter amount for second line (credit)
    const secondAccountSelect = page.getByRole('combobox', { name: 'Account 2' });
    await secondAccountSelect.fill('30100');
    await secondAccountSelect.press('ArrowDown');
    await secondAccountSelect.press('Enter');

    // Fill credit amount for second line
    const secondCreditInput = page.locator('input[id="credit-1"]');
    await secondCreditInput.fill('1000');

    // Save the journal entry
    // Wait for the form to be valid (button enabled)
    await expect(page.getByText('Save Journal Entry')).toBeEnabled();
    await page.getByText('Save Journal Entry').click();

    // Should navigate to the journal entry details page
    await expect(page.getByText(en.journalEntryItemTitle, { exact: true })).toBeVisible();
    await expect(page.getByText('Test Journal Entry')).toBeVisible();

    // Check that the journal entry shows as unposted
    await expect(page.getByText('Unposted')).toBeVisible();
  });

  test('should validate balanced journal entries', async function ({ page }) {
    // Navigate to journal entry creation
    await page.getByRole('link', { name: en.menuItemJournalEntryLabel, exact: true }).click();
    await page.getByText(en.journalEntryCreationNavLabel).click();

    // Fill in unbalanced entry
    await page.getByPlaceholder('Enter description for this journal entry').fill('Unbalanced Entry');

    // First line: $1000 debit
    // Wait for accounts to load first
    const firstAccountSelect = page.getByRole('combobox', { name: 'Account 1' });
    await expect(firstAccountSelect).toBeVisible();
    await firstAccountSelect.fill('10100');
    await firstAccountSelect.press('ArrowDown');
    await firstAccountSelect.press('Enter');

    // Fill debit for first line
    const firstDebitInput = page.locator('input[id="debit-0"]');
    await firstDebitInput.fill('1000');

    // Second line: $500 credit (unbalanced)
    const secondAccountSelect = page.getByRole('combobox', { name: 'Account 2' });
    await secondAccountSelect.fill('30100');
    await secondAccountSelect.press('ArrowDown');
    await secondAccountSelect.press('Enter');

    // Fill credit for second line (but with unbalanced amount)
    const secondCreditInput = page.locator('input[id="credit-1"]');
    await secondCreditInput.fill('500');

    // Save button should remain enabled (only disabled when loading)
    const saveButton = page.getByText('Save Journal Entry');
    await expect(saveButton).toBeEnabled();

    // Should show validation error
    await expect(page.getByText('Debits must equal credits')).toBeVisible();

    // Clicking the save button should not proceed due to validation logic
    await saveButton.click();
    // Should still be on the same page due to validation preventing submission
  });

  test('should navigate back to journal entry list', async function ({ page }) {
    // Navigate to journal entry creation
    await page.getByRole('link', { name: en.menuItemJournalEntryLabel, exact: true }).click();
    await page.getByText(en.journalEntryCreationNavLabel).click();

    // Click back button
    await page.getByRole('link', { name: 'Back' }).last().click();

    // Should be back on the journal entries list
    await expect(page.getByRole('heading', { name: en.journalEntryListTitle })).toBeVisible();
  });
});
