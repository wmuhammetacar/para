import { expect, test } from '@playwright/test';

async function login(page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('demo@teklifim.com');
  await page.locator('input[type="password"]').fill('123456');
  await page.getByRole('button', { name: 'Oturum Ac' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('dashboard period filter updates active labels', async ({ page }) => {
  await login(page);

  await expect(page.getByText('Aktif Donem: Tum Zamanlar')).toBeVisible();

  await page.getByRole('button', { name: '7 Gun' }).click();
  await expect(page.getByText('Aktif Donem: Son 7 Gun')).toBeVisible();

  await page.getByRole('button', { name: 'Bugun' }).click();
  await expect(page.getByText('Aktif Donem: Bugun')).toBeVisible();
});

test('quote and invoice list PDF actions show success feedback', async ({ page }) => {
  await login(page);

  await page.getByRole('link', { name: 'Teklifler' }).click();
  await expect(page.getByRole('heading', { name: 'Teklifler' })).toBeVisible();

  const quotePdfButton = page.locator('table tbody tr').filter({ hasText: 'TKL-' }).first().getByRole('button', {
    name: 'PDF'
  });
  await expect(quotePdfButton).toBeVisible();
  await quotePdfButton.click();
  await expect(page.getByText(/PDF indirildi:/)).toBeVisible();

  await page.getByRole('link', { name: 'Faturalar' }).click();
  await expect(page.getByRole('heading', { name: 'Faturalar' })).toBeVisible();

  const invoicePdfButton = page
    .locator('table tbody tr')
    .filter({ hasText: 'FTR-' })
    .first()
    .getByRole('button', { name: 'PDF' });
  await expect(invoicePdfButton).toBeVisible();
  await invoicePdfButton.click();
  await expect(page.getByText(/PDF indirildi:/)).toBeVisible();
});
