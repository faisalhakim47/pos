// @ts-check

import { test, expect } from '@playwright/test';

import en from '@/src/i18n/langs/en.js';

test.describe('Account Tag Management', function () {
  test.beforeEach(async function ({ page }) {
    // Attach listeners for debugging Playwright test runs (useful for diagnosing test failures)
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
  });

  test('should display account tags page from sidebar', async function ({ page }) {
    await page.getByRole('link', { name: en.menuItemAccountTagLabel, exact: true }).click();

    await expect(page).toHaveURL(/.*account-tags$/);
    await expect(page.getByText(en.accountTagListTitle, { exact: true })).toBeVisible();

    await expect(page.getByText(en.accountTagCreationNavLabel, { exact: true })).toBeVisible();

    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: en.literal.code })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: en.literal.name })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: en.literal.type })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: en.literal.tag })).toBeVisible();
  });

  test('should navigate to account tag creation page', async function ({ page }) {
    await page.getByRole('link', { name: en.menuItemAccountTagLabel, exact: true }).click();

    await page.getByText(en.accountTagCreationNavLabel, { exact: true }).click();

    await expect(page).toHaveURL(/.*account-tags\/create$/);
    await expect(page.getByText(en.accountTagCreationTitle, { exact: true })).toBeVisible();

    await expect(page.getByLabel(en.accountTagCreationTagLabel)).toBeVisible();
    await expect(page.getByRole('button', { name: en.accountTagCreationSubmitLabel })).toBeVisible();
  });

  test('should create a new account tag successfully', async function ({ page }) {
    await page.getByRole('link', { name: en.menuItemAccountTagLabel, exact: true }).click();
    await page.getByText(en.accountTagCreationNavLabel, { exact: true }).click();

    await page.getByLabel(en.accountTagCreationAccountLabel, { exact: true }).fill('10100');
    await page.keyboard.press('Tab');
    await page.getByLabel(en.accountTagCreationTagLabel, { exact: true }).fill('test_custom_tag');
    await page.getByRole('button', { name: en.accountTagCreationSubmitLabel, exact: true }).click();
    await expect(page).toHaveURL(/.*account-tags\/10100\/test_custom_tag$/);
    await expect(page.getByText(en.accountTagItemTitle, { exact: true })).toBeVisible();
    await expect(page.getByRole('definition')).toContainText('10100');
    await expect(page.getByRole('definition')).toContainText('test_custom_tag');
  });

  test('should display existing account tags in the list', async function ({ page }) {
    // Ensure at least one tag exists for the list test
    await page.getByRole('link', { name: en.menuItemAccountTagLabel, exact: true }).click();
    await page.getByText(en.accountTagCreationNavLabel, { exact: true }).click();

    const accountCombobox = page.locator('input[role="combobox"]');
    await accountCombobox.click();
    await accountCombobox.fill('10100');
    await page.keyboard.press('Tab');

    const tagInput = page.locator('input[list="common-tags"]');
    await tagInput.fill('test_list_tag');

    await page.getByText(en.accountTagCreationSubmitLabel, { exact: true }).click();

    await page.getByText(en.accountTagListTitle, { exact: true }).click();

    await expect(page.getByRole('row', { name: /10100/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /test_list_tag/ })).toBeVisible();
  });

  test('should edit existing account tag successfully', async function ({ page }) {
    await page.getByRole('link', { name: en.menuItemAccountTagLabel, exact: true }).click();
    await page.getByText(en.accountTagCreationNavLabel, { exact: true }).click();
    await page.getByLabel(en.accountTagCreationAccountLabel, { exact: true }).fill('10100');
    await page.keyboard.press('Tab');
    await page.getByLabel(en.accountTagCreationTagLabel).fill('test_edit_tag');
    await page.getByRole('button', { name: en.accountTagCreationSubmitLabel }).click();
    await page.getByRole('button', { name: en.accountTagEditNavLabel }).click();
    await expect(page).toHaveURL(/.*account-tags\/10100\/test_edit_tag\/edit$/);
    await expect(page.getByText(en.accountTagEditTitle, { exact: true })).toBeVisible();
    await page.getByLabel(en.accountTagEditTagLabel).fill('test_edited_tag');
    await page.getByRole('button', { name: en.accountTagEditSubmitLabel }).click();
    await expect(page).toHaveURL(/.*account-tags\/10100\/test_edited_tag$/);
    await expect(page.getByRole('definition')).toContainText('test_edited_tag');
  });
});
