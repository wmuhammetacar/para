export const periodOptions = [
  { value: 'all', label: 'Tum Zamanlar' },
  { value: 'today', label: 'Bugun' },
  { value: '7', label: '7 Gun' },
  { value: '30', label: '30 Gun' }
];

const activityEventLabelMap = {
  AUTH_REGISTER_SUCCESS: 'Kayit Basarili',
  AUTH_LOGIN_SUCCESS: 'Giris Basarili',
  AUTH_LOGIN_FAILED: 'Giris Basarisiz',
  CUSTOMER_CREATED: 'Musteri Eklendi',
  CUSTOMER_UPDATED: 'Musteri Guncellendi',
  CUSTOMER_DELETED: 'Musteri Silindi',
  QUOTE_CREATED: 'Teklif Olusturuldu',
  QUOTE_UPDATED: 'Teklif Guncellendi',
  QUOTE_DELETED: 'Teklif Silindi',
  INVOICE_CREATED: 'Fatura Olusturuldu',
  INVOICE_UPDATED: 'Fatura Guncellendi',
  INVOICE_DELETED: 'Fatura Silindi',
  INVOICE_PAYMENT_UPDATED: 'Tahsilat Durumu Guncellendi',
  INVOICE_BULK_PAYMENT_UPDATED: 'Toplu Tahsilat Durumu Guncellendi',
  INVOICE_REMINDER_CREATED: 'Tahsilat Hatirlatmasi Gonderildi'
};

function isoDateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function resolveActivityDateFrom(period) {
  switch (period) {
    case 'today':
      return isoDateOffset(0);
    case '7':
      return isoDateOffset(-6);
    case '30':
      return isoDateOffset(-29);
    default:
      return null;
  }
}

export function resolveGrowthPeriodDays(period) {
  switch (period) {
    case 'today':
      return 7;
    case '7':
      return 30;
    case '30':
      return 90;
    default:
      return 180;
  }
}

export function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function activityEventLabel(eventType) {
  return activityEventLabelMap[eventType] || eventType || '-';
}

export function activityResourceLabel(activity) {
  if (!activity?.resourceType) {
    return '-';
  }

  if (activity.resourceId) {
    return `${activity.resourceType} #${activity.resourceId}`;
  }

  return activity.resourceType;
}

export function activityDetail(activity) {
  const metadata = activity?.metadata || {};
  if (metadata.invoiceNumber) {
    return metadata.invoiceNumber;
  }

  if (metadata.quoteNumber) {
    return metadata.quoteNumber;
  }

  if (metadata.name) {
    return metadata.name;
  }

  if (metadata.status) {
    return `Durum: ${metadata.status}`;
  }

  return '-';
}
