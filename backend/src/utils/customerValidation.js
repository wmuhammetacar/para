import { badRequest } from './httpErrors.js';

const MAX_NAME_LENGTH = 120;
const MAX_PHONE_LENGTH = 30;
const MAX_EMAIL_LENGTH = 120;
const MAX_ADDRESS_LENGTH = 255;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+().\-\s]*$/;

export function parseCustomerInput(body = {}) {
  return {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    phone: typeof body.phone === 'string' ? body.phone.trim() : '',
    email: typeof body.email === 'string' ? body.email.trim() : '',
    address: typeof body.address === 'string' ? body.address.trim() : ''
  };
}

export function validateCustomerInput({ name, phone, email, address }) {
  if (!name) {
    throw badRequest('Musteri adi zorunludur.', [{ field: 'name', rule: 'required' }]);
  }

  if (name.length > MAX_NAME_LENGTH) {
    throw badRequest(`Musteri adi en fazla ${MAX_NAME_LENGTH} karakter olabilir.`, [
      { field: 'name', rule: 'maxLength', max: MAX_NAME_LENGTH }
    ]);
  }

  if (phone.length > MAX_PHONE_LENGTH) {
    throw badRequest(`Telefon en fazla ${MAX_PHONE_LENGTH} karakter olabilir.`, [
      { field: 'phone', rule: 'maxLength', max: MAX_PHONE_LENGTH }
    ]);
  }

  if (phone && !PHONE_PATTERN.test(phone)) {
    throw badRequest('Telefon formati gecersiz.', [{ field: 'phone', rule: 'format' }]);
  }

  if (email.length > MAX_EMAIL_LENGTH) {
    throw badRequest(`E-posta en fazla ${MAX_EMAIL_LENGTH} karakter olabilir.`, [
      { field: 'email', rule: 'maxLength', max: MAX_EMAIL_LENGTH }
    ]);
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    throw badRequest('E-posta formati gecersiz.', [{ field: 'email', rule: 'format' }]);
  }

  if (address.length > MAX_ADDRESS_LENGTH) {
    throw badRequest(`Adres en fazla ${MAX_ADDRESS_LENGTH} karakter olabilir.`, [
      { field: 'address', rule: 'maxLength', max: MAX_ADDRESS_LENGTH }
    ]);
  }
}

export function normalizeCustomerId(value, field = 'id', message = 'Gecersiz musteri id.') {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest(message, [{ field, rule: 'integer' }]);
  }

  return id;
}
