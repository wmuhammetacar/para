import { get } from '../db.js';
import { businessRule } from './httpErrors.js';

const PLAN_DEFINITIONS = {
  starter: {
    code: 'starter',
    name: 'Baslangic',
    monthlyPriceTry: 499,
    yearlyPriceTry: 4790,
    description: 'Mikro isletmeler icin hizli teklif/fatura operasyonu',
    limits: {
      customers: 50,
      quotesPerMonth: 30,
      invoicesPerMonth: 30,
      remindersPerMonth: 60
    }
  },
  standard: {
    code: 'standard',
    name: 'Standart',
    monthlyPriceTry: 899,
    yearlyPriceTry: 8690,
    description: 'Duzenli teklif/fatura hacmi olan KOBI ekipleri icin',
    limits: {
      customers: 250,
      quotesPerMonth: 200,
      invoicesPerMonth: 200,
      remindersPerMonth: 400
    }
  }
};

const DEFAULT_PLAN_CODE = 'starter';

export function listPlans() {
  return Object.values(PLAN_DEFINITIONS);
}

export function getPlanByCode(value) {
  const code = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return PLAN_DEFINITIONS[code] || PLAN_DEFINITIONS[DEFAULT_PLAN_CODE];
}

export function normalizePlanCode(value) {
  const code = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return PLAN_DEFINITIONS[code] ? code : null;
}

function getMonthRange(date = new Date()) {
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const toIso = (cursor) => cursor.toISOString().slice(0, 10);

  return {
    from: toIso(monthStart),
    to: toIso(nextMonthStart)
  };
}

function buildLimitMetric(limit, used) {
  const safeUsed = Number(used) || 0;
  const safeLimit = Number.isFinite(limit) ? Number(limit) : null;

  if (safeLimit === null) {
    return {
      limit: null,
      used: safeUsed,
      remaining: null,
      utilizationPercent: 0,
      reached: false
    };
  }

  const remaining = Math.max(0, safeLimit - safeUsed);
  const utilizationPercent = safeLimit > 0 ? Math.min(100, Math.round((safeUsed / safeLimit) * 100)) : 0;

  return {
    limit: safeLimit,
    used: safeUsed,
    remaining,
    utilizationPercent,
    reached: safeUsed >= safeLimit
  };
}

async function getUserPlanCode(userId) {
  const row = await get('SELECT plan_code FROM users WHERE id = ?', [userId]);
  return row?.plan_code || DEFAULT_PLAN_CODE;
}

async function getUsageSnapshot(userId) {
  const monthRange = getMonthRange();

  const usage = await get(
    `
    SELECT
      (SELECT COUNT(*) FROM customers WHERE user_id = ?) AS customers,
      (
        SELECT COUNT(*)
        FROM quotes
        WHERE user_id = ?
          AND date(date) >= date(?)
          AND date(date) < date(?)
      ) AS quotes_month,
      (
        SELECT COUNT(*)
        FROM invoices
        WHERE user_id = ?
          AND date(date) >= date(?)
          AND date(date) < date(?)
      ) AS invoices_month,
      (
        SELECT COUNT(*)
        FROM reminder_jobs
        WHERE user_id = ?
          AND datetime(created_at) >= datetime(?)
          AND datetime(created_at) < datetime(?)
      ) AS reminders_month
    `,
    [
      userId,
      userId,
      monthRange.from,
      monthRange.to,
      userId,
      monthRange.from,
      monthRange.to,
      userId,
      `${monthRange.from} 00:00:00`,
      `${monthRange.to} 00:00:00`
    ]
  );

  return {
    monthRange,
    customers: Number(usage?.customers) || 0,
    quotesPerMonth: Number(usage?.quotes_month) || 0,
    invoicesPerMonth: Number(usage?.invoices_month) || 0,
    remindersPerMonth: Number(usage?.reminders_month) || 0
  };
}

export async function getUserPlanSnapshot(userId) {
  const [planCode, usage] = await Promise.all([getUserPlanCode(userId), getUsageSnapshot(userId)]);
  const plan = getPlanByCode(planCode);

  return {
    plan: {
      code: plan.code,
      name: plan.name,
      monthlyPriceTry: plan.monthlyPriceTry,
      yearlyPriceTry: plan.yearlyPriceTry,
      description: plan.description
    },
    monthRange: usage.monthRange,
    metrics: {
      customers: buildLimitMetric(plan.limits.customers, usage.customers),
      quotesPerMonth: buildLimitMetric(plan.limits.quotesPerMonth, usage.quotesPerMonth),
      invoicesPerMonth: buildLimitMetric(plan.limits.invoicesPerMonth, usage.invoicesPerMonth),
      remindersPerMonth: buildLimitMetric(plan.limits.remindersPerMonth, usage.remindersPerMonth)
    }
  };
}

const ACTION_TO_METRIC = {
  customer_create: 'customers',
  quote_create: 'quotesPerMonth',
  invoice_create: 'invoicesPerMonth',
  reminder_create: 'remindersPerMonth'
};

const ACTION_TO_LABEL = {
  customers: 'Musteri',
  quotesPerMonth: 'Aylik teklif',
  invoicesPerMonth: 'Aylik fatura',
  remindersPerMonth: 'Aylik hatirlatma'
};

export async function assertPlanLimit(userId, action) {
  const metricKey = ACTION_TO_METRIC[action];
  if (!metricKey) {
    return null;
  }

  const snapshot = await getUserPlanSnapshot(userId);
  const metric = snapshot.metrics?.[metricKey];

  if (!metric || !metric.reached) {
    return snapshot;
  }

  throw businessRule(
    `${ACTION_TO_LABEL[metricKey]} limitinize ulastiniz. Lutfen paketinizi yukselterek devam edin.`,
    [
      { field: 'planCode', value: snapshot.plan.code },
      { field: 'metric', value: metricKey },
      { field: 'limit', value: metric.limit },
      { field: 'used', value: metric.used }
    ]
  );
}

export function getDefaultPlanCode() {
  return DEFAULT_PLAN_CODE;
}
