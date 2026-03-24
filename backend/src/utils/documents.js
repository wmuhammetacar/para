import { badRequest } from './httpErrors.js';

export function normalizeDate(input) {
  if (input === undefined || input === null || input === '') {
    return new Date().toISOString().slice(0, 10);
  }

  const value = String(input).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest('Tarih YYYY-AA-GG formatinda olmalidir.', [
      { field: 'date', rule: 'format', expected: 'YYYY-MM-DD' }
    ]);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw badRequest('Tarih gecersiz.');
  }

  return value;
}

export function buildDocumentNumber(prefix, id, date) {
  const compactDate = normalizeDate(date).replace(/-/g, '');
  return `${prefix}-${compactDate}-${String(id).padStart(4, '0')}`;
}

export function sanitizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw badRequest('En az bir kalem eklemelisiniz.', [{ field: 'items', rule: 'minItems' }]);
  }

  const cleanItems = [];

  for (const [index, item] of items.entries()) {
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);

    if (!name) {
      throw badRequest(`${index + 1}. kalemde urun/hizmet adi zorunludur.`, [
        { field: `items.${index}.name`, rule: 'required' }
      ]);
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw badRequest(`${index + 1}. kalemde miktar 0'dan buyuk olmalidir.`, [
        { field: `items.${index}.quantity`, rule: 'positiveNumber' }
      ]);
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw badRequest(`${index + 1}. kalemde birim fiyat gecersiz.`, [
        { field: `items.${index}.unitPrice`, rule: 'nonNegativeNumber' }
      ]);
    }

    const total = Number((quantity * unitPrice).toFixed(2));
    cleanItems.push({
      name,
      quantity,
      unitPrice,
      total
    });
  }

  const total = Number(
    cleanItems.reduce((acc, current) => acc + current.total, 0).toFixed(2)
  );

  return { items: cleanItems, total };
}
