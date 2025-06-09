// @ts-check

import { test, expect } from '@playwright/test';

import en from '../src/i18n/langs/en.js';

test('Currency Management', async function ({ page }) {
  // for debugging purposes
  page.addListener('console', function (msg) {
    console[msg.type()]('PageConsole', msg.text());
  });
  page.addListener('pageerror', function (error) {
    throw new Error('PageError', { cause: error });
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: en.onboardingNewFileCtaDefaultLabel }).click();
  await page.getByLabel(en.menuItemCurrencyListLabel).click();
  await expect(page.getByText(en.currencyListTitle, { exact: true })).toBeVisible();

  await page.getByRole('link', { name: en.currencyCreationNavLabel }).click();
  await expect(page.getByText(en.currencyCreationTitle)).toBeVisible();

  await page.getByLabel(en.currencyCreationCodeLabel).fill('SOL');
  await page.getByLabel(en.currencyCreationNameLabel).fill('Solana');
  await page.getByLabel(en.currencyCreationSymbolLabel).fill('SOL');
  await page.getByLabel(en.currencyCreationDecimalPlacesLabel).fill('9');
  await page.getByRole('button', { name: en.currencyCreationSaveCtaLabel }).click();

  await expect(page.getByText(en.currencyListTitle, { exact: true })).toBeVisible();
  await expect(page.getByText('Solana')).toBeVisible();
});
