export const emptyItem = { name: '', quantity: 1, unitPrice: 0 };

export const reminderStatusFilters = [
  { key: 'all', label: 'Tum Durumlar' },
  { key: 'failed', label: 'Hata' },
  { key: 'queued', label: 'Kuyrukta' },
  { key: 'sent', label: 'Gonderildi' }
];

export const emptyReminderOps = {
  policy: {
    maxRetryCount: 3
  },
  summary: {
    total: 0,
    queued: 0,
    sent: 0,
    failed: 0,
    failedLast24h: 0,
    scheduledRetries: 0,
    oldestQueuedMinutes: null,
    whatsapp: 0,
    email: 0,
    failedRate: 0
  },
  filteredCount: 0,
  errorBreakdown: [],
  jobs: []
};

export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function resolveDueDate(invoice) {
  return invoice?.due_date || invoice?.date || null;
}

export function isInvoiceOverdue(invoice) {
  if (!invoice) {
    return false;
  }

  if ((invoice.payment_status || 'pending') !== 'pending') {
    return false;
  }

  if (invoice.is_overdue !== undefined && invoice.is_overdue !== null) {
    return Number(invoice.is_overdue) === 1;
  }

  const dueDate = resolveDueDate(invoice);
  if (!dueDate) {
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}

export function paymentStatusLabel(invoice) {
  if ((invoice.payment_status || 'pending') === 'paid') {
    return 'Tahsil Edildi';
  }

  if (isInvoiceOverdue(invoice)) {
    return 'Gecikmede';
  }

  return 'Takipte';
}

export function paymentStatusClasses(invoice) {
  if ((invoice.payment_status || 'pending') === 'paid') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (isInvoiceOverdue(invoice)) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export function reminderStatusLabel(status) {
  if (status === 'sent') {
    return 'Gonderildi';
  }

  if (status === 'failed') {
    return 'Hata';
  }

  return 'Kuyrukta';
}

export function reminderJobStatusLabel(job) {
  if (!job) {
    return '-';
  }

  if (job.status === 'queued' && (Number(job.retry_count) || 0) > 0) {
    return 'Yeniden Denenecek';
  }

  return reminderStatusLabel(job.status);
}

export function reminderStatusClasses(status) {
  if (status === 'sent') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (status === 'failed') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export function reminderChannelLabel(channel) {
  if (channel === 'whatsapp') {
    return 'WhatsApp';
  }

  if (channel === 'email') {
    return 'E-posta';
  }

  return channel || '-';
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

export function sanitizeFormItems(items) {
  return items.map((item) => ({
    name: String(item.name || '').trim(),
    quantity: Number(item.quantity) || 0,
    unitPrice: Number(item.unitPrice) || 0
  }));
}

export function validateItems(items) {
  if (!items.length) {
    return 'En az bir hizmet kalemi eklemelisiniz.';
  }

  for (const item of items) {
    if (!item.name) {
      return 'Tum kalemlerde hizmet kalemi adi zorunludur.';
    }

    if (item.quantity <= 0) {
      return 'Miktar 0 dan buyuk olmalidir.';
    }

    if (item.unitPrice < 0) {
      return 'Birim fiyat negatif olamaz.';
    }
  }

  return '';
}

export function normalizeReminderOpsResponse(data) {
  return {
    policy: {
      maxRetryCount: Number(data?.policy?.maxRetryCount) || 3
    },
    summary: {
      total: Number(data?.summary?.total) || 0,
      queued: Number(data?.summary?.queued) || 0,
      sent: Number(data?.summary?.sent) || 0,
      failed: Number(data?.summary?.failed) || 0,
      failedLast24h: Number(data?.summary?.failedLast24h) || 0,
      scheduledRetries: Number(data?.summary?.scheduledRetries) || 0,
      oldestQueuedMinutes:
        data?.summary?.oldestQueuedMinutes === null || data?.summary?.oldestQueuedMinutes === undefined
          ? null
          : Number(data.summary.oldestQueuedMinutes) || 0,
      whatsapp: Number(data?.summary?.whatsapp) || 0,
      email: Number(data?.summary?.email) || 0,
      failedRate: Number(data?.summary?.failedRate) || 0
    },
    filteredCount: Number(data?.filteredCount) || 0,
    errorBreakdown: Array.isArray(data?.errorBreakdown) ? data.errorBreakdown : [],
    jobs: Array.isArray(data?.jobs) ? data.jobs : []
  };
}
