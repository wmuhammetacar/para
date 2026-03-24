import { sendError } from '../utils/response.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err?.type === 'entity.parse.failed') {
    sendError(res, 400, 'INVALID_JSON', 'JSON body gecersiz.');
    return;
  }

  if (err?.message === 'CORS blocked for origin') {
    sendError(res, 403, 'CORS_BLOCKED', 'Bu origin icin erisim izni yok.');
    return;
  }

  if (err?.code === 'SQLITE_CONSTRAINT') {
    const rawMessage = typeof err.message === 'string' ? err.message : '';

    if (
      rawMessage.includes('idx_quotes_user_quote_number_uq') ||
      rawMessage.includes('quotes.user_id, quotes.quote_number')
    ) {
      sendError(res, 409, 'QUOTE_NUMBER_CONFLICT', 'Bu teklif numarasi zaten kullanimda.');
      return;
    }

    if (
      rawMessage.includes('idx_invoices_user_invoice_number_uq') ||
      rawMessage.includes('invoices.user_id, invoices.invoice_number')
    ) {
      sendError(res, 409, 'INVOICE_NUMBER_CONFLICT', 'Bu fatura numarasi zaten kullanimda.');
      return;
    }

    if (rawMessage.includes('TENANT_SCOPE_VIOLATION')) {
      sendError(res, 400, 'TENANT_SCOPE_VIOLATION', 'Kayit sahipligi kurali ihlal edildi.');
      return;
    }

    if (rawMessage.includes('ITEM_PARENT_INVALID')) {
      sendError(res, 400, 'ITEM_PARENT_INVALID', 'Kalem kaydi icin bagli belge turu gecersiz.');
      return;
    }

    if (rawMessage.includes('INVALID_MONETARY_VALUE')) {
      sendError(res, 400, 'INVALID_MONETARY_VALUE', 'Tutar alanlari gecersiz.');
      return;
    }

    if (rawMessage.includes('INVALID_PAYMENT_STATE')) {
      sendError(res, 400, 'INVALID_PAYMENT_STATE', 'Odeme durumu ve tahsil tarihi uyumsuz.');
      return;
    }

    if (rawMessage.includes('INVALID_BILLING_STATE')) {
      sendError(res, 400, 'INVALID_BILLING_STATE', 'Billing islem durumu gecersiz.');
      return;
    }

    if (rawMessage.includes('FOREIGN KEY')) {
      sendError(res, 400, 'FOREIGN_KEY_VIOLATION', 'Iliskili kayit bulunamadi.');
      return;
    }
  }

  if (typeof err?.status === 'number' && err?.code && err?.message) {
    sendError(res, err.status, err.code, err.message, err.details);
    return;
  }

  // Keep a single centralized log for unexpected server failures.
  // eslint-disable-next-line no-console
  console.error(err);

  sendError(res, 500, 'INTERNAL_ERROR', 'Sunucu hatasi.');
}
