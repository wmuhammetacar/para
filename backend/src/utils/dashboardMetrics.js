export function isoDateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildScopedDateFilter(column, startDate) {
  if (!startDate) {
    return {
      sql: '',
      params: []
    };
  }

  return {
    sql: ` AND date(${column}) >= date(?)`,
    params: [startDate]
  };
}

export function resolvePeriodContext(period) {
  switch (period) {
    case 'all':
      return { period, label: 'Tum Zamanlar', startDate: null };
    case 'today':
      return { period, label: 'Bugun', startDate: isoDateOffset(0) };
    case '7':
      return { period, label: 'Son 7 Gun', startDate: isoDateOffset(-6) };
    case '30':
      return { period, label: 'Son 30 Gun', startDate: isoDateOffset(-29) };
    default:
      return null;
  }
}

export function toPercent(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  return Number(((part / total) * 100).toFixed(1));
}

export function toMoney(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function parseMonthKey(monthKey) {
  const [year, month] = String(monthKey).split('-').map((part) => Number(part));
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return null;
  }

  return { year, month };
}

function monthKeyFromDate(date) {
  return date.toISOString().slice(0, 7);
}

export function monthKeyOffset(offset) {
  const cursor = new Date();
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() + offset);
  return monthKeyFromDate(cursor);
}

export function addMonthsToMonthKey(monthKey, offset) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) {
    return null;
  }

  const cursor = new Date(Date.UTC(parsed.year, parsed.month - 1 + offset, 1));
  return monthKeyFromDate(cursor);
}

export function monthOffsetBetween(startMonthKey, endMonthKey) {
  const start = parseMonthKey(startMonthKey);
  const end = parseMonthKey(endMonthKey);
  if (!start || !end) {
    return 0;
  }

  return end.year * 12 + (end.month - 1) - (start.year * 12 + (start.month - 1));
}

export function formatMonthLabel(monthKey) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) {
    return monthKey;
  }

  return new Intl.DateTimeFormat('tr-TR', {
    month: 'short',
    year: 'numeric'
  }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, 1)));
}

export function buildGrowthHealth(quoteToInvoiceRate, invoiceToPaidRate) {
  const score = Math.round(quoteToInvoiceRate * 0.55 + invoiceToPaidRate * 0.45);

  if (score >= 75) {
    return {
      score,
      status: 'healthy',
      insight: 'Donusum zinciri guclu. Mevcut tempoyu koruyup tahsilat hizini optimize edin.'
    };
  }

  if (score >= 45) {
    return {
      score,
      status: 'watch',
      insight: 'Donusum orta seviyede. Teklif-fatura ve tahsilat adimlarini yakindan takip edin.'
    };
  }

  return {
    score,
    status: 'critical',
    insight: 'Donusum zayif. Onboarding ve tahsilat aksiyonlarini hizlandirmaniz onerilir.'
  };
}

export function buildPilotStatus(score) {
  if (score >= 85) {
    return { code: 'ready', label: 'Pilot Hazir' };
  }

  if (score >= 60) {
    return { code: 'watch', label: 'Izlemeye Acik' };
  }

  return { code: 'risk', label: 'Riskli' };
}

export function buildTrendBuckets(monthCount = 6) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('tr-TR', {
    month: 'short',
    year: 'numeric'
  });
  const buckets = [];

  for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, '0');
    const monthKey = `${year}-${month}`;

    buckets.push({
      monthKey,
      label: formatter.format(cursor),
      issuedRevenue: 0,
      collectedRevenue: 0,
      createdInvoices: 0,
      paidInvoices: 0
    });
  }

  return buckets;
}

export function parseMetadata(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
