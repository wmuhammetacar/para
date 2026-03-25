import { expect, test } from '@playwright/test';

async function login(page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('demo@teklifim.com');
  await page.locator('input[type="password"]').fill('123456');
  await page.getByRole('button', { name: 'Oturum Ac' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('user can create customer, quote, and invoice from quote', async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);
  const customerName = `E2E Musteri ${suffix}`;
  const customerEmail = `e2e-${suffix}@teklifim.local`;

  await login(page);

  await page.getByRole('link', { name: 'Musteriler' }).click();
  await expect(page.getByRole('heading', { name: 'Musteriler' })).toBeVisible();

  const customerForm = page.locator('form').first();
  await customerForm.locator('input').nth(0).fill(customerName);
  await customerForm.locator('input').nth(1).fill('+90 555 111 22 33');
  await customerForm.locator('input').nth(2).fill(customerEmail);
  await customerForm.locator('input').nth(3).fill('Kadikoy / Istanbul');
  await page.getByRole('button', { name: 'Musteri Ekle' }).click();

  await expect(page.getByText('Yeni musteri kaydi eklendi.')).toBeVisible();
  await expect(page.locator('tr', { hasText: customerName })).toBeVisible();

  await page.getByRole('link', { name: 'Teklifler' }).click();
  await expect(page.getByRole('heading', { name: 'Teklifler' })).toBeVisible();

  const quoteCustomerSelect = page.locator('select').first();
  await quoteCustomerSelect.selectOption({ label: customerName });
  await page.getByPlaceholder('Hizmet kalemi adi').first().fill('E2E Web Tasarim');
  await page.getByPlaceholder('Miktar').first().fill('2');
  await page.getByPlaceholder('Birim fiyat').first().fill('1250');
  await page.getByRole('button', { name: 'Teklifi Kaydet' }).click();

  await expect(page.getByText('Teklif kaydedildi.')).toBeVisible();
  const quoteRow = page.locator('tr', { hasText: customerName }).first();
  await expect(quoteRow).toBeVisible();

  const quoteNumber = (await quoteRow.locator('td').first().textContent())?.trim();
  expect(quoteNumber).toBeTruthy();

  await quoteRow.getByRole('link', { name: 'Detay' }).click();
  await expect(page.getByRole('heading', { name: 'Teklif Detayi' })).toBeVisible();
  await expect(page.getByText(quoteNumber || '')).toBeVisible();

  await page.getByRole('link', { name: 'Listeye Don' }).click();
  await expect(page.getByRole('heading', { name: 'Teklifler' })).toBeVisible();

  await page.getByRole('link', { name: 'Faturalar' }).click();
  await expect(page.getByRole('heading', { name: 'Faturalar' })).toBeVisible();

  const fromQuoteSelect = page.locator('select').first();
  const quoteOptions = fromQuoteSelect.locator('option').filter({ hasText: customerName });
  await expect(quoteOptions).toHaveCount(1);
  const quoteOption = quoteOptions.first();
  const quoteOptionValue = await quoteOption.getAttribute('value');
  expect(quoteOptionValue).toBeTruthy();
  if (quoteOptionValue) {
    await fromQuoteSelect.selectOption(quoteOptionValue);
  }

  await page.getByRole('button', { name: 'Olustur' }).click();
  await expect(page.getByText('Teklif faturaya donusturuldu.')).toBeVisible();

  const invoiceRow = page.locator('tr', { hasText: customerName }).first();
  await expect(invoiceRow).toBeVisible();
  await invoiceRow.getByRole('link', { name: 'Detay' }).click();

  await expect(page.getByRole('heading', { name: 'Fatura Detayi' })).toBeVisible();
  await expect(page.getByText('Kaynak Teklif:')).toBeVisible();

  const quoteSourceLink = page.locator('a', { hasText: /^#/ }).first();
  await expect(quoteSourceLink).toBeVisible();
  await quoteSourceLink.click();

  await expect(page).toHaveURL(/\/quotes\/\d+$/);
  await expect(page.getByRole('heading', { name: 'Teklif Detayi' })).toBeVisible();
});
