// @ts-check

import { test, expect } from '@playwright/test';

import en from '../src/i18n/langs/en.js';

test.describe('Account Management', function () {

  test.beforeEach(async function ({ page }) {
    // for debugging purposes
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

    await page.getByRole('link', { name: en.menuItemAccountLabel, exact: true }).click();
    await expect(page.getByText(en.accountListTitle, { exact: true })).toBeVisible();
  });

  test('should display pre-seeded chart of accounts', async function ({ page }) {
    await expect(page.getByText(en.accountListTitle, { exact: true })).toBeVisible();

    await expect(page.getByRole('link', { name: en.accountCreationNavLabel })).toBeVisible();

    await expect(page.getByText(en.literal.code, { exact: true })).toBeVisible();
    await expect(page.getByText(en.literal.type, { exact: true })).toBeVisible();
    await expect(page.getByText(en.literal.name, { exact: true })).toBeVisible();
    await expect(page.getByText(en.literal.currency, { exact: true })).toBeVisible();
    await expect(page.getByText(en.literal.balance, { exact: true })).toBeVisible();

    await expect(page.getByText('10100')).toBeVisible();
    await expect(page.getByText('Cash')).toBeVisible();
  });

  test('should create a new account successfully', async function ({ page }) {
    const uniqueCode = 50000 + Math.floor(Math.random() * 9999);

    await page.getByRole('link', { name: en.accountCreationNavLabel }).click();

    await expect(page.getByRole('heading', { name: en.accountCreationTitle })).toBeVisible();

    await page.getByLabel(en.accountFormCodeLabel).fill(String(uniqueCode));
    await page.getByLabel(en.accountFormNameLabel).fill('Test Asset Account');
    await page.getByRole('combobox', { name: en.accountFormTypeLabel }).selectOption('asset');
    await page.getByRole('combobox', { name: en.accountFormCurrencyLabel }).selectOption('USD');

    await page.getByRole('button', { name: en.accountCreationSaveCtaLabel }).click();

    await expect(page.getByText(en.accountListTitle, { exact: true })).toBeVisible();

    await expect(page.getByText(String(uniqueCode))).toBeVisible();
    await expect(page.getByText('Test Asset Account')).toBeVisible();
  });

  test('should validate required fields in account creation', async function ({ page }) {
    const uniqueCode = 50000 + Math.floor(Math.random() * 9999);

    await page.getByRole('link', { name: en.accountCreationNavLabel }).click();

    const submitButton = page.getByRole('button', { name: en.accountCreationSaveCtaLabel });
    await expect(submitButton).toBeEnabled();

    await submitButton.click();

    await page.getByLabel(en.accountFormCodeLabel).fill(String(uniqueCode));
    await expect(submitButton).toBeEnabled();

    await page.getByLabel(en.accountFormNameLabel).fill('Test Account');
    await expect(submitButton).toBeEnabled();

    await page.getByRole('combobox', { name: en.accountFormTypeLabel }).selectOption('liability');

    await expect(submitButton).toBeEnabled();
  });

  test('should view account details', async function ({ page }) {
    await page.getByRole('link', { name: '10100' }).click();

    await expect(page.getByText(`${en.accountItemTitle} 10100`, { exact: true })).toBeVisible();

    await expect(page.getByText('Cash')).toBeVisible();
    await expect(page.getByText(en.literal.asset, { exact: true })).toBeVisible();

    await expect(page.getByRole('link', { name: 'Back' })).toBeVisible();
    await expect(page.getByRole('link', { name: en.accountEditNavLabel })).toBeVisible();
  });

  test('should edit existing account successfully', async function ({ page }) {
    await page.getByRole('link', { name: '10100' }).click();

    await page.getByRole('link', { name: en.accountEditNavLabel }).click();

    await expect(page.getByText(`${en.accountEditTitle} 10100`, { exact: true })).toBeVisible();

    const codeInput = page.getByLabel(en.accountFormCodeLabel);
    await expect(codeInput).toBeDisabled();

    const nameInput = page.getByLabel(en.accountFormNameLabel);
    await nameInput.clear();
    await nameInput.fill('Updated Cash Account');

    await page.getByRole('button', { name: en.accountEditUpdateCtaLabel }).click();

    await expect(page.getByText(`${en.accountItemTitle} 10100`, { exact: true })).toBeVisible();

    await expect(page.getByText('Updated Cash Account')).toBeVisible();
  });

  test('should handle navigation between account pages', async function ({ page }) {
    await expect(page.getByText(en.accountListTitle, { exact: true })).toBeVisible();

    await page.getByRole('link', { name: en.accountCreationNavLabel }).click();
    await expect(page.getByRole('heading', { name: en.accountCreationTitle })).toBeVisible();

    await page.goBack();
    await expect(page.getByText(en.accountListTitle, { exact: true })).toBeVisible();

    await page.getByRole('link', { name: '10100' }).click();
    await expect(page.getByText(`${en.accountItemTitle} 10100`, { exact: true })).toBeVisible();

    await page.getByRole('link', { name: en.accountEditNavLabel }).click();
    await expect(page.getByText(`${en.accountEditTitle} 10100`, { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByText(`${en.accountItemTitle} 10100`, { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByText(en.accountListTitle, { exact: true })).toBeVisible();
  });

});
