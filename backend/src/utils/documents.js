import { badRequest } from './httpErrors.js';

const DOCUMENT_NUMBER_MAX_LENGTH = 40;
const DOCUMENT_NUMBER_PATTERN = /^[A-Z0-9-]+$/;
const MAX_ITEM_COUNT = 200;
const MAX_ITEM_NAME_LENGTH = 160;
const MAX_QUANTITY = 1_000_000;
const MAX_UNIT_PRICE = 10_000_000;
const MAX_TOTAL = 1_000_000_000;

function countDecimalPlaces(rawValue) {
  const text = typeof rawValue === 'number' ? rawValue.toString() : String(rawValue || '').trim();
  if (!text || text.includes('e') || text.includes('E')) {
    return Number.POSITIVE_INFINITY;
  }

  const dotIndex = text.indexOf('.');
  if (dotIndex < 0) {
    return 0;
  }

  return text.slice(dotIndex + 1).length;
}

function normalizeNumericField(rawValue, options) {
  const { field, index, min, minExclusive = false, max, maxDecimals } = options;
  const value = Number(rawValue);

  if (!Number.isFinite(value)) {
    throw badRequest(`${index + 1}. kalemde ${field} gecersiz.`, [
      { field: `items.${index}.${field}`, rule: 'number' }
    ]);
  }

  if (countDecimalPlaces(rawValue) > maxDecimals) {
    throw badRequest(`${index + 1}. kalemde ${field} en fazla ${maxDecimals} ondalik basamak icerebilir.`, [
      { field: `items.${index}.${field}`, rule: 'maxDecimals', max: maxDecimals }
    ]);
  }

  if (minExclusive ? value <= min : value < min) {
    throw badRequest(`${index + 1}. kalemde ${field} minimum deger kurali saglanmadi.`, [
      { field: `items.${index}.${field}`, rule: minExclusive ? 'greaterThan' : 'min', min }
    ]);
  }

  if (value > max) {
    throw badRequest(`${index + 1}. kalemde ${field} maksimum degeri asti.`, [
      { field: `items.${index}.${field}`, rule: 'max', max }
    ]);
  }

  return value;
}

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

export function normalizeDocumentNumber(value, field = 'documentNumber') {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const normalized = String(value).trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  if (normalized.length > DOCUMENT_NUMBER_MAX_LENGTH) {
    throw badRequest(
      `${field} en fazla ${DOCUMENT_NUMBER_MAX_LENGTH} karakter olabilir.`,
      [{ field, rule: 'maxLength', max: DOCUMENT_NUMBER_MAX_LENGTH }]
    );
  }

  if (!DOCUMENT_NUMBER_PATTERN.test(normalized)) {
    throw badRequest(
      `${field} yalnizca buyuk harf, rakam ve tire icerebilir.`,
      [{ field, rule: 'pattern', value: 'A-Z0-9-' }]
    );
  }

  return normalized;
}

export function sanitizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw badRequest('En az bir kalem eklemelisiniz.', [{ field: 'items', rule: 'minItems' }]);
  }

  if (items.length > MAX_ITEM_COUNT) {
    throw badRequest(`En fazla ${MAX_ITEM_COUNT} kalem ekleyebilirsiniz.`, [
      { field: 'items', rule: 'maxItems', max: MAX_ITEM_COUNT }
    ]);
  }

  const cleanItems = [];

  for (const [index, item] of items.entries()) {
    const name = typeof item.name === 'string' ? item.name.trim() : '';

    if (!name) {
      throw badRequest(`${index + 1}. kalemde urun/hizmet adi zorunludur.`, [
        { field: `items.${index}.name`, rule: 'required' }
      ]);
    }

    if (name.length > MAX_ITEM_NAME_LENGTH) {
      throw badRequest(`${index + 1}. kalemde ad en fazla ${MAX_ITEM_NAME_LENGTH} karakter olabilir.`, [
        { field: `items.${index}.name`, rule: 'maxLength', max: MAX_ITEM_NAME_LENGTH }
      ]);
    }

    const quantity = normalizeNumericField(item.quantity, {
      field: 'quantity',
      index,
      min: 0,
      minExclusive: true,
      max: MAX_QUANTITY,
      maxDecimals: 3
    });

    const unitPrice = normalizeNumericField(item.unitPrice, {
      field: 'unitPrice',
      index,
      min: 0,
      minExclusive: false,
      max: MAX_UNIT_PRICE,
      maxDecimals: 2
    });

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

  if (total > MAX_TOTAL) {
    throw badRequest('Belge toplami desteklenen maksimum degeri asti.', [
      { field: 'items', rule: 'totalMax', max: MAX_TOTAL }
    ]);
  }

  return { items: cleanItems, total };
}
