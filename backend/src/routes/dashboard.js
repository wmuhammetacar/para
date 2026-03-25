import { Router } from 'express';
import { all, get, run, withDbTransaction } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { abuseRateLimit } from '../middleware/abuseRateLimit.js';
import { recordAuditLog } from '../utils/audit.js';
import { badRequest, notFound } from '../utils/httpErrors.js';
import {
  PLAN_CHANGE_REQUEST_TTL_MINUTES,
  assertBillingAuthorized,
  isRequestExpired,
  normalizeCohortMonths,
  normalizeGrowthPeriod,
  normalizeLimit,
  normalizeOptionalIsoDate,
  normalizeOptionalTextFilter,
  normalizePaymentReference,
  normalizePeriod,
  normalizePilotPeriod,
  normalizePlanChangeRequestId,
  normalizePlanPatch
} from '../utils/dashboardValidation.js';
import {
  addMonthsToMonthKey,
  buildGrowthHealth,
  buildPilotStatus,
  buildScopedDateFilter,
  buildTrendBuckets,
  formatMonthLabel,
  isoDateOffset,
  monthKeyOffset,
  monthOffsetBetween,
  parseMetadata,
  resolvePeriodContext,
  toMoney,
  toPercent
} from '../utils/dashboardMetrics.js';
import { getUserPlanSnapshot, listPlans } from '../utils/plans.js';

const router = Router();

router.use(authenticate);
router.use(abuseRateLimit);

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

router.get('/growth', async (req, res, next) => {
  try {
    const periodDays = normalizeGrowthPeriod(req.query.period);
    const cohortMonths = normalizeCohortMonths(req.query.cohortMonths);
    const dateFrom = isoDateOffset(-(periodDays - 1));
    const dateTo = isoDateOffset(0);
    const userId = req.user.id;
    const previousDateTo = isoDateOffset(-periodDays);
    const previousDateFrom = isoDateOffset(-(periodDays * 2 - 1));

    const funnelRow = await get(
      `
      SELECT
        (SELECT COUNT(*) FROM customers WHERE user_id = ? AND date(created_at) >= date(?)) AS customers,
        (SELECT COUNT(*) FROM quotes WHERE user_id = ? AND date(date) >= date(?)) AS quotes,
        (SELECT COUNT(*) FROM invoices WHERE user_id = ? AND date(date) >= date(?)) AS invoices,
        (SELECT COUNT(*) FROM invoices WHERE user_id = ? AND payment_status = 'paid' AND date(date) >= date(?)) AS paid_invoices
      `,
      [userId, dateFrom, userId, dateFrom, userId, dateFrom, userId, dateFrom]
    );

    const revenueRow = await get(
      `
      SELECT
        COALESCE(
          SUM(CASE WHEN date(date) >= date(?) AND date(date) <= date(?) THEN total ELSE 0 END),
          0
        ) AS issued_revenue,
        COALESCE(
          SUM(
            CASE
              WHEN payment_status = 'paid'
                AND date(COALESCE(paid_at, date)) >= date(?)
                AND date(COALESCE(paid_at, date)) <= date(?)
              THEN total
              ELSE 0
            END
          ),
          0
        ) AS collected_revenue,
        COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN total ELSE 0 END), 0) AS open_receivable,
        COALESCE(
          SUM(CASE WHEN payment_status = 'pending' AND date(due_date) < date(?) THEN total ELSE 0 END),
          0
        ) AS overdue_receivable
      FROM invoices
      WHERE user_id = ?
      `,
      [dateFrom, dateTo, dateFrom, dateTo, dateTo, userId]
    );

    const previousRevenueRow = await get(
      `
      SELECT
        COALESCE(
          SUM(CASE WHEN date(date) >= date(?) AND date(date) <= date(?) THEN total ELSE 0 END),
          0
        ) AS issued_revenue,
        COALESCE(
          SUM(
            CASE
              WHEN payment_status = 'paid'
                AND date(COALESCE(paid_at, date)) >= date(?)
                AND date(COALESCE(paid_at, date)) <= date(?)
              THEN total
              ELSE 0
            END
          ),
          0
        ) AS collected_revenue
      FROM invoices
      WHERE user_id = ?
      `,
      [previousDateFrom, previousDateTo, previousDateFrom, previousDateTo, userId]
    );

    const velocityRow = await get(
      `
      SELECT
        AVG(
          CASE
            WHEN i.quote_id IS NOT NULL AND q.id IS NOT NULL
            THEN julianday(date(i.date)) - julianday(date(q.date))
            ELSE NULL
          END
        ) AS quote_to_invoice_avg_days,
        AVG(
          CASE
            WHEN i.payment_status = 'paid' AND i.paid_at IS NOT NULL
            THEN julianday(date(i.paid_at)) - julianday(date(i.date))
            ELSE NULL
          END
        ) AS invoice_to_paid_avg_days
      FROM invoices i
      LEFT JOIN quotes q ON q.id = i.quote_id AND q.user_id = i.user_id
      WHERE i.user_id = ? AND date(i.date) >= date(?) AND date(i.date) <= date(?)
      `,
      [userId, dateFrom, dateTo]
    );

    const trendBuckets = buildTrendBuckets(6);
    const trendDateFrom = `${trendBuckets[0]?.monthKey || new Date().toISOString().slice(0, 7)}-01`;
    const trendRows = await all(
      `
      SELECT
        strftime('%Y-%m', date) AS month_key,
        COUNT(*) AS created_invoices,
        COALESCE(SUM(total), 0) AS issued_revenue,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END), 0) AS paid_invoices,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END), 0) AS collected_revenue
      FROM invoices
      WHERE user_id = ? AND date(date) >= date(?)
      GROUP BY month_key
      ORDER BY month_key ASC
      `,
      [userId, trendDateFrom]
    );

    const trendByMonth = new Map(
      trendRows.map((row) => [
        row.month_key,
        {
          issuedRevenue: Number((Number(row.issued_revenue) || 0).toFixed(2)),
          collectedRevenue: Number((Number(row.collected_revenue) || 0).toFixed(2)),
          createdInvoices: Number(row.created_invoices) || 0,
          paidInvoices: Number(row.paid_invoices) || 0
        }
      ])
    );

    const trend = trendBuckets.map((bucket) => ({
      ...bucket,
      ...(trendByMonth.get(bucket.monthKey) || {})
    }));

    const cohortStartMonthKey = monthKeyOffset(-(cohortMonths - 1));
    const cohortStartDate = `${cohortStartMonthKey}-01`;
    const cohortMonthKeys = Array.from({ length: cohortMonths }, (_, index) => monthKeyOffset(-(cohortMonths - 1 - index)));
    const currentMonthKey = monthKeyOffset(0);

    const cohortSizeRows = await all(
      `
      SELECT
        strftime('%Y-%m', first_invoice_date) AS cohort_month,
        COUNT(*) AS cohort_size
      FROM (
        SELECT customer_id, MIN(date(date)) AS first_invoice_date
        FROM invoices
        WHERE user_id = ?
        GROUP BY customer_id
      ) first_invoice
      WHERE date(first_invoice_date) >= date(?)
      GROUP BY cohort_month
      ORDER BY cohort_month ASC
      `,
      [userId, cohortStartDate]
    );

    const cohortActivityRows = await all(
      `
      WITH customer_first AS (
        SELECT customer_id, MIN(date(date)) AS first_invoice_date
        FROM invoices
        WHERE user_id = ?
        GROUP BY customer_id
      ),
      cohort_customers AS (
        SELECT
          customer_id,
          strftime('%Y-%m', first_invoice_date) AS cohort_month
        FROM customer_first
        WHERE date(first_invoice_date) >= date(?)
      )
      SELECT
        c.cohort_month,
        strftime('%Y-%m', i.date) AS activity_month,
        COUNT(DISTINCT i.customer_id) AS active_customers,
        COALESCE(SUM(i.total), 0) AS revenue
      FROM cohort_customers c
      JOIN invoices i ON i.customer_id = c.customer_id AND i.user_id = ?
      WHERE date(i.date) >= date(?)
      GROUP BY c.cohort_month, activity_month
      ORDER BY c.cohort_month ASC, activity_month ASC
      `,
      [userId, cohortStartDate, userId, cohortStartDate]
    );

    const cohortSizes = new Map(
      cohortSizeRows.map((row) => [row.cohort_month, Number(row.cohort_size) || 0])
    );
    const cohortActivityMap = new Map(
      cohortActivityRows.map((row) => [
        `${row.cohort_month}|${row.activity_month}`,
        {
          activeCustomers: Number(row.active_customers) || 0,
          revenue: toMoney(row.revenue)
        }
      ])
    );

    const retention = cohortMonthKeys.map((cohortMonth) => {
      const cohortSize = cohortSizes.get(cohortMonth) || 0;
      const maxVisibleOffset = Math.max(0, Math.min(cohortMonths - 1, monthOffsetBetween(cohortMonth, currentMonthKey)));
      const points = Array.from({ length: maxVisibleOffset + 1 }, (_, offset) => {
        const activityMonth = addMonthsToMonthKey(cohortMonth, offset);
        const activity = cohortActivityMap.get(`${cohortMonth}|${activityMonth}`) || {
          activeCustomers: 0,
          revenue: 0
        };

        return {
          monthOffset: offset,
          activityMonth,
          activityLabel: formatMonthLabel(activityMonth),
          activeCustomers: activity.activeCustomers,
          retentionRate: toPercent(activity.activeCustomers, cohortSize),
          revenue: toMoney(activity.revenue)
        };
      });

      return {
        cohortMonth,
        cohortLabel: formatMonthLabel(cohortMonth),
        cohortSize,
        totalRevenue: toMoney(points.reduce((sum, point) => sum + point.revenue, 0)),
        points
      };
    });

    const funnel = {
      customers: Number(funnelRow?.customers) || 0,
      quotes: Number(funnelRow?.quotes) || 0,
      invoices: Number(funnelRow?.invoices) || 0,
      paidInvoices: Number(funnelRow?.paid_invoices) || 0
    };
    const quoteToInvoiceRate = toPercent(funnel.invoices, funnel.quotes);
    const invoiceToPaidRate = toPercent(funnel.paidInvoices, funnel.invoices);
    const health = buildGrowthHealth(quoteToInvoiceRate, invoiceToPaidRate);
    const currentIssued = toMoney(revenueRow?.issued_revenue);
    const currentCollected = toMoney(revenueRow?.collected_revenue);
    const previousIssued = toMoney(previousRevenueRow?.issued_revenue);
    const previousCollected = toMoney(previousRevenueRow?.collected_revenue);
    const issuedGrowthRate = previousIssued > 0 ? toPercent(currentIssued - previousIssued, previousIssued) : 0;
    const collectedGrowthRate = previousCollected > 0 ? toPercent(currentCollected - previousCollected, previousCollected) : 0;

    res.json({
      periodDays,
      cohortMonths,
      dateFrom,
      dateTo,
      funnel: {
        ...funnel,
        quoteToInvoiceRate,
        invoiceToPaidRate
      },
      revenue: {
        issued: currentIssued,
        collected: currentCollected,
        openReceivable: toMoney(revenueRow?.open_receivable),
        overdueReceivable: toMoney(revenueRow?.overdue_receivable)
      },
      comparison: {
        previousPeriod: {
          dateFrom: previousDateFrom,
          dateTo: previousDateTo,
          issued: previousIssued,
          collected: previousCollected
        },
        issuedGrowthRate,
        collectedGrowthRate
      },
      velocity: {
        quoteToInvoiceAvgDays: Number((Number(velocityRow?.quote_to_invoice_avg_days) || 0).toFixed(1)),
        invoiceToPaidAvgDays: Number((Number(velocityRow?.invoice_to_paid_avg_days) || 0).toFixed(1))
      },
      health,
      trend,
      retention
    });
  } catch (error) {
    next(error);
  }
});

router.get('/pilot-readiness', async (req, res, next) => {
  try {
    const periodDays = normalizePilotPeriod(req.query.period);
    const dateFrom = isoDateOffset(-(periodDays - 1));
    const dateTo = isoDateOffset(0);
    const userId = req.user.id;

    const [baseCounts, periodInvoiceCounts, reminderQuality, receivableRisk, recentActivity] = await Promise.all([
      get(
        `
        SELECT
          (SELECT COUNT(*) FROM customers WHERE user_id = ?) AS total_customers,
          (SELECT COUNT(*) FROM quotes WHERE user_id = ?) AS total_quotes,
          (SELECT COUNT(*) FROM invoices WHERE user_id = ?) AS total_invoices,
          (SELECT COUNT(*) FROM reminder_jobs WHERE user_id = ? AND status = 'sent') AS total_sent_reminders
        `,
        [userId, userId, userId, userId]
      ),
      get(
        `
        SELECT
          COUNT(*) AS total_invoices,
          COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END), 0) AS paid_invoices
        FROM invoices
        WHERE user_id = ? AND date(date) >= date(?) AND date(date) <= date(?)
        `,
        [userId, dateFrom, dateTo]
      ),
      get(
        `
        SELECT
          COUNT(*) AS total_reminders,
          COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_reminders
        FROM reminder_jobs
        WHERE user_id = ? AND datetime(created_at) >= datetime(?) AND datetime(created_at) <= datetime(?)
        `,
        [userId, `${dateFrom} 00:00:00`, `${dateTo} 23:59:59`]
      ),
      get(
        `
        SELECT
          COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN total ELSE 0 END), 0) AS pending_total,
          COALESCE(
            SUM(CASE WHEN payment_status = 'pending' AND date(due_date) < date(?) THEN total ELSE 0 END),
            0
          ) AS overdue_total
        FROM invoices
        WHERE user_id = ?
        `,
        [dateTo, userId]
      ),
      get(
        `
        SELECT COUNT(*) AS audit_events_7d
        FROM audit_logs
        WHERE user_id = ? AND datetime(created_at) >= datetime('now', '-7 day')
        `,
        [userId]
      )
    ]);

    const onboardingPassed =
      (Number(baseCounts?.total_customers) || 0) >= 1 &&
      (Number(baseCounts?.total_quotes) || 0) >= 1 &&
      (Number(baseCounts?.total_invoices) || 0) >= 1 &&
      (Number(baseCounts?.total_sent_reminders) || 0) >= 1;

    const periodInvoices = Number(periodInvoiceCounts?.total_invoices) || 0;
    const periodPaidInvoices = Number(periodInvoiceCounts?.paid_invoices) || 0;
    const collectionRate = toPercent(periodPaidInvoices, periodInvoices);

    const totalReminders = Number(reminderQuality?.total_reminders) || 0;
    const failedReminders = Number(reminderQuality?.failed_reminders) || 0;
    const reminderFailureRate = toPercent(failedReminders, totalReminders);

    const pendingTotal = toMoney(receivableRisk?.pending_total);
    const overdueTotal = toMoney(receivableRisk?.overdue_total);
    const overdueRatio = pendingTotal > 0 ? toPercent(overdueTotal, pendingTotal) : 0;
    const auditEvents7d = Number(recentActivity?.audit_events_7d) || 0;

    const checks = [
      {
        key: 'onboarding',
        label: 'Onboarding Tamamlama',
        passed: onboardingPassed,
        value: onboardingPassed ? 'Tamamlandi' : 'Eksik',
        target: '4/4 adim',
        severity: onboardingPassed ? 'ok' : 'high',
        ctaPath: '/onboarding'
      },
      {
        key: 'invoice_volume',
        label: 'Pilot Islem Hacmi',
        passed: periodInvoices >= 3,
        value: `${periodInvoices} fatura`,
        target: '>= 3 fatura',
        severity: periodInvoices >= 3 ? 'ok' : 'medium',
        ctaPath: '/invoices'
      },
      {
        key: 'collection_rate',
        label: 'Tahsilat Donusumu',
        passed: collectionRate >= 40,
        value: `%${collectionRate}`,
        target: '>= %40',
        severity: collectionRate >= 40 ? 'ok' : 'medium',
        ctaPath: '/growth'
      },
      {
        key: 'reminder_reliability',
        label: 'Hatirlatma Guvenilirligi',
        passed: totalReminders === 0 ? true : reminderFailureRate <= 20,
        value: totalReminders === 0 ? 'Veri yok' : `%${reminderFailureRate} hata`,
        target: '<= %20 hata',
        severity: totalReminders === 0 || reminderFailureRate <= 20 ? 'ok' : 'high',
        ctaPath: '/invoices'
      },
      {
        key: 'overdue_risk',
        label: 'Gecikme Riski',
        passed: pendingTotal === 0 ? true : overdueRatio <= 35,
        value: pendingTotal === 0 ? 'Risk yok' : `%${overdueRatio} gecikme`,
        target: '<= %35',
        severity: pendingTotal === 0 || overdueRatio <= 35 ? 'ok' : 'high',
        ctaPath: '/dashboard'
      },
      {
        key: 'activity_signal',
        label: 'Son 7 Gun Operasyon Sinyali',
        passed: auditEvents7d >= 5,
        value: `${auditEvents7d} olay`,
        target: '>= 5 olay',
        severity: auditEvents7d >= 5 ? 'ok' : 'medium',
        ctaPath: '/dashboard'
      }
    ];

    const passedChecks = checks.filter((check) => check.passed).length;
    const totalChecks = checks.length;
    const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;
    const status = buildPilotStatus(score);
    const nextActions = checks
      .filter((check) => !check.passed)
      .slice(0, 3)
      .map((check) => ({
        key: check.key,
        label: check.label,
        ctaPath: check.ctaPath,
        reason: `${check.value} (hedef: ${check.target})`
      }));

    res.json({
      periodDays,
      dateFrom,
      dateTo,
      generatedAt: new Date().toISOString(),
      score,
      status,
      summary: {
        passedChecks,
        totalChecks
      },
      financialRisk: {
        pendingTotal,
        overdueTotal,
        overdueRatio
      },
      checks,
      nextActions
    });
  } catch (error) {
    next(error);
  }
});

router.get('/plan', async (req, res, next) => {
  try {
    const snapshot = await getUserPlanSnapshot(req.user.id);
    const availablePlans = listPlans();

    res.json({
      currentPlan: snapshot.plan,
      monthRange: snapshot.monthRange,
      usage: snapshot.metrics,
      availablePlans
    });
  } catch (error) {
    next(error);
  }
});

router.post('/plan/change-request', async (req, res, next) => {
  try {
    const planCode = normalizePlanPatch(req.body.planCode);
    const existing = await get('SELECT id, plan_code FROM users WHERE id = ?', [req.user.id]);
    if (!existing) {
      next(badRequest('Kullanici bulunamadi.'));
      return;
    }

    if (existing.plan_code === planCode) {
      next(
        badRequest('Secilen paket zaten aktif.', [
          { field: 'planCode', rule: 'differentFromCurrent' }
        ])
      );
      return;
    }

    await run(
      `
      UPDATE billing_plan_change_requests
      SET status = 'expired'
      WHERE user_id = ? AND status = 'pending' AND datetime(expires_at) < datetime('now')
      `,
      [req.user.id]
    );

    const insertResult = await run(
      `
      INSERT INTO billing_plan_change_requests (user_id, target_plan_code, status, expires_at)
      VALUES (?, ?, 'pending', datetime('now', ?))
      `,
      [req.user.id, planCode, `+${PLAN_CHANGE_REQUEST_TTL_MINUTES} minute`]
    );

    const createdRequest = await get(
      `
      SELECT id, target_plan_code, status, expires_at, created_at
      FROM billing_plan_change_requests
      WHERE id = ? AND user_id = ?
      `,
      [insertResult.id, req.user.id]
    );

    if (!createdRequest) {
      next(badRequest('Plan degisikligi talebi olusturulamadi.'));
      return;
    }

    await recordAuditLog({
      req,
      userId: req.user.id,
      eventType: 'PLAN_CHANGE_REQUEST_CREATED',
      resourceType: 'billing_plan_change_request',
      resourceId: String(createdRequest.id),
      metadata: {
        targetPlanCode: createdRequest.target_plan_code,
        status: createdRequest.status,
        expiresAt: createdRequest.expires_at
      }
    });

    res.status(201).json({
      id: createdRequest.id,
      userId: req.user.id,
      targetPlanCode: createdRequest.target_plan_code,
      status: createdRequest.status,
      createdAt: createdRequest.created_at,
      expiresAt: createdRequest.expires_at
    });
  } catch (error) {
    next(error);
  }
});

router.post('/plan/change-request/:id/confirm', async (req, res, next) => {
  try {
    assertBillingAuthorized(req);
    const requestId = normalizePlanChangeRequestId(req.params.id);
    const paymentReference = normalizePaymentReference(req.body.paymentReference);
    const billingRequest = await get(
      `
      SELECT id, user_id, target_plan_code, status, expires_at, paid_at, applied_at
      FROM billing_plan_change_requests
      WHERE id = ?
      `,
      [requestId]
    );

    if (!billingRequest) {
      next(notFound('Plan degisikligi talebi bulunamadi.'));
      return;
    }

    if (billingRequest.status === 'applied') {
      next(badRequest('Bu plan degisikligi talebi zaten uygulandi.'));
      return;
    }

    if (isRequestExpired(billingRequest.expires_at)) {
      if (billingRequest.status === 'pending') {
        await run(
          'UPDATE billing_plan_change_requests SET status = \'expired\' WHERE id = ? AND status = \'pending\'',
          [billingRequest.id]
        );
      }
      next(badRequest('Plan degisikligi talebinin suresi dolmus.'));
      return;
    }

    if (billingRequest.status !== 'pending') {
      next(badRequest('Bu plan degisikligi talebi bu asamada onaylanamaz.'));
      return;
    }

    await run(
      `
      UPDATE billing_plan_change_requests
      SET status = 'paid',
          payment_reference = ?,
          paid_at = datetime('now')
      WHERE id = ? AND status = 'pending'
      `,
      [paymentReference, billingRequest.id]
    );

    await recordAuditLog({
      req,
      userId: billingRequest.user_id,
      eventType: 'PLAN_CHANGE_PAYMENT_CONFIRMED',
      resourceType: 'billing_plan_change_request',
      resourceId: String(billingRequest.id),
      metadata: {
        targetPlanCode: billingRequest.target_plan_code,
        paymentReference
      }
    });

    const updated = await get(
      `
      SELECT id, user_id, target_plan_code, status, payment_reference, created_at, paid_at, expires_at
      FROM billing_plan_change_requests
      WHERE id = ?
      `,
      [billingRequest.id]
    );

    res.json({
      id: updated.id,
      userId: updated.user_id,
      targetPlanCode: updated.target_plan_code,
      status: updated.status,
      paymentReference: updated.payment_reference,
      createdAt: updated.created_at,
      paidAt: updated.paid_at,
      expiresAt: updated.expires_at
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/plan', async (req, res, next) => {
  try {
    const planCode = normalizePlanPatch(req.body.planCode);
    const planChangeRequestId = normalizePlanChangeRequestId(req.body.planChangeRequestId);
    const existing = await get('SELECT id, plan_code FROM users WHERE id = ?', [req.user.id]);
    if (!existing) {
      next(badRequest('Kullanici bulunamadi.'));
      return;
    }

    const billingRequest = await get(
      `
      SELECT id, user_id, target_plan_code, status, payment_reference, created_at, paid_at, applied_at, expires_at
      FROM billing_plan_change_requests
      WHERE id = ? AND user_id = ?
      `,
      [planChangeRequestId, req.user.id]
    );

    if (!billingRequest) {
      next(notFound('Plan degisikligi talebi bulunamadi.'));
      return;
    }

    if (billingRequest.target_plan_code !== planCode) {
      next(
        badRequest('Talep edilen paket ile odeme talebi uyusmuyor.', [
          { field: 'planCode', rule: 'mustMatchRequest' }
        ])
      );
      return;
    }

    if (isRequestExpired(billingRequest.expires_at)) {
      if (billingRequest.status === 'pending') {
        await run('UPDATE billing_plan_change_requests SET status = \'expired\' WHERE id = ?', [billingRequest.id]);
      }
      next(badRequest('Plan degisikligi talebinin suresi dolmus.'));
      return;
    }

    if (billingRequest.status !== 'paid') {
      next(
        badRequest('Plan degisikligi icin once odemenin onaylanmasi gerekir.', [
          { field: 'planChangeRequestId', rule: 'mustBePaid' }
        ])
      );
      return;
    }

    await withDbTransaction(async () => {
      if (existing.plan_code !== planCode) {
        await run('UPDATE users SET plan_code = ? WHERE id = ?', [planCode, req.user.id]);
        await recordAuditLog({
          req,
          userId: req.user.id,
          eventType: 'PLAN_UPDATED',
          resourceType: 'user',
          resourceId: String(req.user.id),
          metadata: {
            oldPlanCode: existing.plan_code || 'starter',
            newPlanCode: planCode,
            planChangeRequestId: billingRequest.id,
            paymentReference: billingRequest.payment_reference || null
          }
        });
      }

      await run(
        `
        UPDATE billing_plan_change_requests
        SET status = 'applied',
            applied_at = datetime('now')
        WHERE id = ? AND status = 'paid'
        `,
        [billingRequest.id]
      );
    });

    const snapshot = await getUserPlanSnapshot(req.user.id);
    const availablePlans = listPlans();

    res.json({
      currentPlan: snapshot.plan,
      monthRange: snapshot.monthRange,
      usage: snapshot.metrics,
      availablePlans
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

    const stepBlueprint = [
      {
        key: 'customer',
        label: 'Ilk Musteri Kaydi',
        description: 'Musteri listesine en az bir kayit ekleyin.',
        current: Number(counts?.total_customers) || 0,
        target: 1,
        ctaPath: '/customers',
        actionLabel: 'Musteri Ekle'
      },
      {
        key: 'quote',
        label: 'Ilk Teklif Olusturma',
        description: 'Musteriniz icin en az bir teklif olusturun.',
        current: Number(counts?.total_quotes) || 0,
        target: 1,
        ctaPath: '/quotes',
        actionLabel: 'Teklif Olustur'
      },
      {
        key: 'invoice',
        label: 'Ilk Fatura Olusturma',
        description: 'Tekliften veya manuel olarak en az bir fatura olusturun.',
        current: Number(counts?.total_invoices) || 0,
        target: 1,
        ctaPath: '/invoices',
        actionLabel: 'Fatura Olustur'
      },
      {
        key: 'reminder',
        label: 'Ilk Tahsilat Hatirlatmasi',
        description: 'En az bir basarili hatirlatma gonderimi tamamlayin.',
        current: Number(counts?.total_sent_reminders) || 0,
        target: 1,
        ctaPath: '/invoices',
        actionLabel: 'Hatirlatma Gonder'
      }
    ];

    const steps = stepBlueprint.map((step, index) => {
      const safeCurrent = Number(step.current) || 0;
      const safeTarget = Number(step.target) || 1;
      const completed = safeCurrent >= safeTarget;
      const progressPercent = Math.max(
        0,
        Math.min(100, Math.round((Math.min(safeCurrent, safeTarget) / safeTarget) * 100))
      );
      const remaining = Math.max(0, safeTarget - safeCurrent);
      const estimatedMinutes = completed ? 0 : Math.max(2, 2 + index);

      return {
        ...step,
        current: safeCurrent,
        target: safeTarget,
        completed,
        progressPercent,
        remaining,
        estimatedMinutes,
        priority: completed ? 999 : index + 1,
        status: completed ? 'completed' : 'pending'
      };
    });

    const completedSteps = steps.filter((step) => step.completed).length;
    const totalSteps = steps.length;
    const remainingSteps = Math.max(0, totalSteps - completedSteps);
    const completionPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    const nextStep = steps.find((step) => !step.completed) || null;
    const quickWins = steps
      .filter((step) => !step.completed)
      .slice(0, 2)
      .map((step) => ({
        key: step.key,
        label: step.label,
        ctaPath: step.ctaPath,
        estimatedMinutes: step.estimatedMinutes
      }));
    const estimatedMinutesLeft = steps
      .filter((step) => !step.completed)
      .reduce((sum, step) => sum + (Number(step.estimatedMinutes) || 0), 0);

    let momentumStatus = 'not_started';
    if (completionPercent >= 100) {
      momentumStatus = 'completed';
    } else if (completionPercent >= 50) {
      momentumStatus = 'on_track';
    } else if (completionPercent > 0) {
      momentumStatus = 'warming_up';
    }

    res.json({
      completedSteps,
      totalSteps,
      remainingSteps,
      completionPercent,
      isCompleted: completedSteps === totalSteps,
      estimatedMinutesLeft,
      momentumStatus,
      nextStep,
      quickWins,
      steps
    });
  } catch (error) {
    next(error);
  }
});

export default router;
