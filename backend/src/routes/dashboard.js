import { Router } from 'express';
import { all, get } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { badRequest } from '../utils/httpErrors.js';

const router = Router();

router.use(authenticate);

function isoDateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizePeriod(value) {
  if (typeof value !== 'string') {
    return 'all';
  }

  const period = value.trim().toLowerCase();
  if (!period) {
    return 'all';
  }

  return period;
}

function buildScopedDateFilter(column, startDate) {
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

function resolvePeriodContext(period) {
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

function normalizeLimit(value, fallback = 20) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0 || limit > 50) {
    throw badRequest('Limit gecersiz. 1 ile 50 arasinda bir tam sayi olmali.', [
      { field: 'limit', rule: 'range', min: 1, max: 50 }
    ]);
  }

  return limit;
}

function normalizeOptionalTextFilter(value, field, maxLength) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (text.length > maxLength) {
    throw badRequest(`${field} en fazla ${maxLength} karakter olabilir.`, [
      { field, rule: 'maxLength', max: maxLength }
    ]);
  }

  return text;
}

function normalizeOptionalIsoDate(value, field) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const date = String(value).trim();
  const isValidFormat = /^\d{4}-\d{2}-\d{2}$/.test(date);
  if (!isValidFormat || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    throw badRequest(`${field} gecersiz. Beklenen format: YYYY-MM-DD.`, [
      { field, rule: 'date' }
    ]);
  }

  return date;
}

function parseMetadata(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

router.get('/stats', async (req, res, next) => {
  try {
    const period = normalizePeriod(req.query.period);
    const context = resolvePeriodContext(period);

    if (!context) {
      next(
        badRequest('Gecersiz donem. Desteklenen degerler: all, today, 7, 30.', [
          { field: 'period', rule: 'enum', values: ['all', 'today', '7', '30'] }
        ])
      );
      return;
    }

    const customerDateScope = buildScopedDateFilter('created_at', context.startDate);
    const quoteDateScope = buildScopedDateFilter('date', context.startDate);
    const invoiceDateScope = buildScopedDateFilter('date', context.startDate);

    const row = await get(
      `
      SELECT
        (SELECT COUNT(*) FROM customers WHERE user_id = ?${customerDateScope.sql}) AS totalCustomers,
        (SELECT COUNT(*) FROM quotes WHERE user_id = ?${quoteDateScope.sql}) AS totalQuotes,
        (SELECT COUNT(*) FROM invoices WHERE user_id = ?${invoiceDateScope.sql}) AS totalInvoices
      `,
      [
        req.user.id,
        ...customerDateScope.params,
        req.user.id,
        ...quoteDateScope.params,
        req.user.id,
        ...invoiceDateScope.params
      ]
    );

    const todayIso = new Date().toISOString().slice(0, 10);
    const invoiceSummary = await get(
      `
      SELECT
        COALESCE(SUM(total), 0) AS totalRevenue,
        COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN total ELSE 0 END), 0) AS pendingReceivable,
        COALESCE(
          SUM(CASE WHEN payment_status = 'pending' AND date(due_date) < date(?) THEN total ELSE 0 END),
          0
        ) AS overdueReceivable,
        COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END), 0) AS pendingInvoiceCount,
        COALESCE(
          SUM(CASE WHEN payment_status = 'pending' AND date(due_date) < date(?) THEN 1 ELSE 0 END),
          0
        ) AS overdueInvoiceCount,
        COALESCE(
          SUM(
            CASE
              WHEN payment_status = 'pending'
                AND date(due_date) < date(?)
                AND CAST(julianday(date(?)) - julianday(date(due_date)) AS INTEGER) <= 7
              THEN total
              ELSE 0
            END
          ),
          0
        ) AS days0to7,
        COALESCE(
          SUM(
            CASE
              WHEN payment_status = 'pending'
                AND date(due_date) < date(?)
                AND CAST(julianday(date(?)) - julianday(date(due_date)) AS INTEGER) BETWEEN 8 AND 30
              THEN total
              ELSE 0
            END
          ),
          0
        ) AS days8to30,
        COALESCE(
          SUM(
            CASE
              WHEN payment_status = 'pending'
                AND date(due_date) < date(?)
                AND CAST(julianday(date(?)) - julianday(date(due_date)) AS INTEGER) > 30
              THEN total
              ELSE 0
            END
          ),
          0
        ) AS days31plus
      FROM invoices
      WHERE user_id = ?${invoiceDateScope.sql}
      `,
      [
        todayIso,
        todayIso,
        todayIso,
        todayIso,
        todayIso,
        todayIso,
        todayIso,
        todayIso,
        req.user.id,
        ...invoiceDateScope.params
      ]
    );

    res.json({
      period: context.period,
      periodLabel: context.label,
      dateFrom: context.startDate,
      totalCustomers: Number(row?.totalCustomers) || 0,
      totalQuotes: Number(row?.totalQuotes) || 0,
      totalInvoices: Number(row?.totalInvoices) || 0,
      totalRevenue: Number((Number(invoiceSummary?.totalRevenue) || 0).toFixed(2)),
      pendingReceivable: Number((Number(invoiceSummary?.pendingReceivable) || 0).toFixed(2)),
      overdueReceivable: Number((Number(invoiceSummary?.overdueReceivable) || 0).toFixed(2)),
      pendingInvoiceCount: Number(invoiceSummary?.pendingInvoiceCount) || 0,
      overdueInvoiceCount: Number(invoiceSummary?.overdueInvoiceCount) || 0,
      overdueBuckets: {
        days0to7: Number((Number(invoiceSummary?.days0to7) || 0).toFixed(2)),
        days8to30: Number((Number(invoiceSummary?.days8to30) || 0).toFixed(2)),
        days31plus: Number((Number(invoiceSummary?.days31plus) || 0).toFixed(2))
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/activity', async (req, res, next) => {
  try {
    const limit = normalizeLimit(req.query.limit, 8);
    const eventType = normalizeOptionalTextFilter(req.query.eventType, 'eventType', 120);
    const resourceType = normalizeOptionalTextFilter(req.query.resourceType, 'resourceType', 80);
    const dateFrom = normalizeOptionalIsoDate(req.query.dateFrom, 'dateFrom');
    const dateTo = normalizeOptionalIsoDate(req.query.dateTo, 'dateTo');

    const whereParts = ['user_id = ?'];
    const params = [req.user.id];

    if (eventType) {
      whereParts.push('event_type = ?');
      params.push(eventType);
    }

    if (resourceType) {
      whereParts.push('resource_type = ?');
      params.push(resourceType);
    }

    if (dateFrom) {
      whereParts.push('created_at >= ?');
      params.push(`${dateFrom} 00:00:00`);
    }

    if (dateTo) {
      whereParts.push('created_at <= ?');
      params.push(`${dateTo} 23:59:59`);
    }

    params.push(limit);

    const rows = await all(
      `
      SELECT
        id,
        event_type,
        resource_type,
        resource_id,
        request_id,
        ip_address,
        user_agent,
        metadata_json,
        created_at
      FROM audit_logs
      WHERE ${whereParts.join(' AND ')}
      ORDER BY id DESC
      LIMIT ?
      `,
      params
    );

    const activities = rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      requestId: row.request_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      metadata: parseMetadata(row.metadata_json),
      createdAt: row.created_at
    }));

    res.json({
      limit,
      count: activities.length,
      activities
    });
  } catch (error) {
    next(error);
  }
});

router.get('/activation', async (req, res, next) => {
  try {
    const counts = await get(
      `
      SELECT
        (SELECT COUNT(*) FROM customers WHERE user_id = ?) AS total_customers,
        (SELECT COUNT(*) FROM quotes WHERE user_id = ?) AS total_quotes,
        (SELECT COUNT(*) FROM invoices WHERE user_id = ?) AS total_invoices,
        (SELECT COUNT(*) FROM reminder_jobs WHERE user_id = ? AND status = 'sent') AS total_sent_reminders
      `,
      [req.user.id, req.user.id, req.user.id, req.user.id]
    );

    const steps = [
      {
        key: 'customer',
        label: 'Ilk Musteri Kaydi',
        description: 'Musteri listesine en az bir kayit ekleyin.',
        current: Number(counts?.total_customers) || 0,
        target: 1,
        ctaPath: '/customers'
      },
      {
        key: 'quote',
        label: 'Ilk Teklif Olusturma',
        description: 'Musteriniz icin en az bir teklif olusturun.',
        current: Number(counts?.total_quotes) || 0,
        target: 1,
        ctaPath: '/quotes'
      },
      {
        key: 'invoice',
        label: 'Ilk Fatura Olusturma',
        description: 'Tekliften veya manuel olarak en az bir fatura olusturun.',
        current: Number(counts?.total_invoices) || 0,
        target: 1,
        ctaPath: '/invoices'
      },
      {
        key: 'reminder',
        label: 'Ilk Tahsilat Hatirlatmasi',
        description: 'En az bir basarili hatirlatma gonderimi tamamlayin.',
        current: Number(counts?.total_sent_reminders) || 0,
        target: 1,
        ctaPath: '/invoices'
      }
    ].map((step) => ({
      ...step,
      completed: step.current >= step.target
    }));

    const completedSteps = steps.filter((step) => step.completed).length;
    const totalSteps = steps.length;
    const completionPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    const nextStep = steps.find((step) => !step.completed) || null;

    res.json({
      completedSteps,
      totalSteps,
      completionPercent,
      isCompleted: completedSteps === totalSteps,
      nextStep,
      steps
    });
  } catch (error) {
    next(error);
  }
});

export default router;
