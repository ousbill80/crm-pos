import { test, expect } from '@playwright/test';

test('accueil MAJOR AUTO PARTS', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /MAJOR AUTO PARTS/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Catalogue' }).first()).toBeVisible();
});
