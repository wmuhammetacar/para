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

  await expect(page.getByRole('heading', { name: 'Ajans Operasyon Paneli' })).toBeVisible();
  await expect(page.getByText('Toplam Kesilen Ciro')).toBeVisible();
});

test('user can navigate with sidebar', async ({ page }) => {
  await login(page);

  await page.getByRole('link', { name: 'Clientlar' }).click();
  await expect(page.getByRole('heading', { name: 'Clientlar' })).toBeVisible();

  await page.getByRole('link', { name: 'Teklif Akisi' }).click();
  await expect(page.getByRole('heading', { name: 'Teklif Akisi' })).toBeVisible();

  await page.getByRole('link', { name: 'Fatura & Tahsilat' }).click();
  await expect(page.getByRole('heading', { name: 'Fatura ve Tahsilat' })).toBeVisible();
});
