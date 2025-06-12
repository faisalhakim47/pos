// @ts-check

import { test, expect } from '@playwright/test';

import en from '../src/i18n/langs/en.js';

test('Account Management', async function ({ page }) {
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
  await expect(page.getByText(en.accountListTitle, { exact: true })).toBeVisible();

});
