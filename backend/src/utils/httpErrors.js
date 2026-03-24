export function makeError(status, code, message, details) {
  return {
    status,
    code,
    message,
    details
  };
}

export function badRequest(message, details) {
  return makeError(400, 'VALIDATION_ERROR', message, details);
}

export function unauthorized(message = 'Yetkisiz islem.', code = 'UNAUTHORIZED') {
  return makeError(401, code, message);
}

export function locked(message = 'Hesap gecici olarak kilitli.', code = 'AUTH_LOCKED') {
  return makeError(423, code, message);
}

export function notFound(message = 'Kayit bulunamadi.') {
  return makeError(404, 'NOT_FOUND', message);
}

export function conflict(message) {
  return makeError(409, 'CONFLICT', message);
}

export function businessRule(message, details) {
  return makeError(400, 'BUSINESS_RULE_VIOLATION', message, details);
}
