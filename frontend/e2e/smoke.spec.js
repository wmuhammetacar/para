import { expect, test } from '@playwright/test';

async function login(page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('demo@teklifim.com');
  await page.locator('input[type="password"]').fill('123456');
  await page.getByRole('button', { name: 'Oturum Ac' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('user can login and view dashboard', async ({ page }) => {
  await login(page);

  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await expect(page.getByText('Acik Tahsilat')).toBeVisible();
});

test('user can navigate with sidebar', async ({ page }) => {
  await login(page);

  await page.getByRole('link', { name: 'Musteriler' }).click();
  await expect(page.getByRole('heading', { name: 'Musteriler' })).toBeVisible();

  await page.getByRole('link', { name: 'Teklifler' }).click();
  await expect(page.getByRole('heading', { name: 'Teklifler' })).toBeVisible();

  await page.getByRole('link', { name: 'Faturalar' }).click();
  await expect(page.getByRole('heading', { name: 'Faturalar' })).toBeVisible();
});
