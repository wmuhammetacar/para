import { badRequest } from '../utils/httpErrors.js';
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
import {
  normalizeCohortMonths,
  normalizeGrowthPeriod,
  normalizeLimit,
  normalizeOptionalIsoDate,
  normalizeOptionalTextFilter,
  normalizePeriod,
  normalizePilotPeriod
} from '../utils/dashboardValidation.js';
import {
  getActivationCounts,
  getDashboardBaseCounts,
  getDashboardInvoiceSummary,
  getGrowthFunnelRow,
  getGrowthPreviousRevenueRow,
  getGrowthRevenueRow,
  getGrowthVelocityRow,
  getPilotReadinessRows,
  listAuditActivityRows,
  listGrowthCohortActivityRows,
  listGrowthCohortSizeRows,
  listGrowthTrendRows
} from '../utils/dashboardRepository.js';

export async function getDashboardStats({ userId, query }) {
  const period = normalizePeriod(query.period);
  const context = resolvePeriodContext(period);

  if (!context) {
    throw badRequest('Gecersiz donem. Desteklenen degerler: all, today, 7, 30.', [
      { field: 'period', rule: 'enum', values: ['all', 'today', '7', '30'] }
    ]);
  }

  const customerDateScope = buildScopedDateFilter('created_at', context.startDate);
  const quoteDateScope = buildScopedDateFilter('date', context.startDate);
  const invoiceDateScope = buildScopedDateFilter('date', context.startDate);

  const [row, invoiceSummary] = await Promise.all([
    getDashboardBaseCounts(userId, {
      customerDateScope,
      quoteDateScope,
      invoiceDateScope
    }),
    getDashboardInvoiceSummary(userId, invoiceDateScope, new Date().toISOString().slice(0, 10))
  ]);

  return {
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
  };
}

export async function getDashboardActivity({ userId, query }) {
  const limit = normalizeLimit(query.limit, 8);
  const eventType = normalizeOptionalTextFilter(query.eventType, 'eventType', 120);
  const resourceType = normalizeOptionalTextFilter(query.resourceType, 'resourceType', 80);
  const dateFrom = normalizeOptionalIsoDate(query.dateFrom, 'dateFrom');
  const dateTo = normalizeOptionalIsoDate(query.dateTo, 'dateTo');

  const rows = await listAuditActivityRows(userId, {
    limit,
    eventType,
    resourceType,
    dateFrom,
    dateTo
  });

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

  return {
    limit,
    count: activities.length,
    activities
  };
}

export async function getDashboardGrowth({ userId, query }) {
  const periodDays = normalizeGrowthPeriod(query.period);
  const cohortMonths = normalizeCohortMonths(query.cohortMonths);
  const dateFrom = isoDateOffset(-(periodDays - 1));
  const dateTo = isoDateOffset(0);
  const previousDateTo = isoDateOffset(-periodDays);
  const previousDateFrom = isoDateOffset(-(periodDays * 2 - 1));

  const [funnelRow, revenueRow, previousRevenueRow, velocityRow] = await Promise.all([
    getGrowthFunnelRow(userId, dateFrom),
    getGrowthRevenueRow(userId, dateFrom, dateTo),
    getGrowthPreviousRevenueRow(userId, previousDateFrom, previousDateTo),
    getGrowthVelocityRow(userId, dateFrom, dateTo)
  ]);

  const trendBuckets = buildTrendBuckets(6);
  const trendDateFrom = `${trendBuckets[0]?.monthKey || new Date().toISOString().slice(0, 7)}-01`;
  const trendRows = await listGrowthTrendRows(userId, trendDateFrom);

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
  const cohortMonthKeys = Array.from({ length: cohortMonths }, (_, index) =>
    monthKeyOffset(-(cohortMonths - 1 - index))
  );
  const currentMonthKey = monthKeyOffset(0);

  const [cohortSizeRows, cohortActivityRows] = await Promise.all([
    listGrowthCohortSizeRows(userId, cohortStartDate),
    listGrowthCohortActivityRows(userId, cohortStartDate)
  ]);

  const cohortSizes = new Map(cohortSizeRows.map((row) => [row.cohort_month, Number(row.cohort_size) || 0]));
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

  return {
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
  };
}

export async function getDashboardPilotReadiness({ userId, query }) {
  const periodDays = normalizePilotPeriod(query.period);
  const dateFrom = isoDateOffset(-(periodDays - 1));
  const dateTo = isoDateOffset(0);

  const [baseCounts, periodInvoiceCounts, reminderQuality, receivableRisk, recentActivity] = await getPilotReadinessRows(
    userId,
    dateFrom,
    dateTo
  );

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

  return {
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
  };
}

export async function getDashboardActivation({ userId }) {
  const counts = await getActivationCounts(userId);

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
    const progressPercent = Math.max(0, Math.min(100, Math.round((Math.min(safeCurrent, safeTarget) / safeTarget) * 100)));
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

  return {
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
  };
}
