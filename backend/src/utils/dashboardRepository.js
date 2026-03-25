import { all, get, run } from '../db.js';

export async function getDashboardBaseCounts(userId, scopes) {
  const { customerDateScope, quoteDateScope, invoiceDateScope } = scopes;

  return get(
    `
    SELECT
      (SELECT COUNT(*) FROM customers WHERE user_id = ?${customerDateScope.sql}) AS totalCustomers,
      (SELECT COUNT(*) FROM quotes WHERE user_id = ?${quoteDateScope.sql}) AS totalQuotes,
      (SELECT COUNT(*) FROM invoices WHERE user_id = ?${invoiceDateScope.sql}) AS totalInvoices
    `,
    [
      userId,
      ...customerDateScope.params,
      userId,
      ...quoteDateScope.params,
      userId,
      ...invoiceDateScope.params
    ]
  );
}

export async function getDashboardInvoiceSummary(userId, invoiceDateScope, todayIso) {
  return get(
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
      userId,
      ...invoiceDateScope.params
    ]
  );
}

export async function listAuditActivityRows(userId, filters) {
  const { limit, eventType, resourceType, dateFrom, dateTo } = filters;
  const whereParts = ['user_id = ?'];
  const params = [userId];

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

  return all(
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
}

export async function getGrowthFunnelRow(userId, dateFrom) {
  return get(
    `
    SELECT
      (SELECT COUNT(*) FROM customers WHERE user_id = ? AND date(created_at) >= date(?)) AS customers,
      (SELECT COUNT(*) FROM quotes WHERE user_id = ? AND date(date) >= date(?)) AS quotes,
      (SELECT COUNT(*) FROM invoices WHERE user_id = ? AND date(date) >= date(?)) AS invoices,
      (SELECT COUNT(*) FROM invoices WHERE user_id = ? AND payment_status = 'paid' AND date(date) >= date(?)) AS paid_invoices
    `,
    [userId, dateFrom, userId, dateFrom, userId, dateFrom, userId, dateFrom]
  );
}

export async function getGrowthRevenueRow(userId, dateFrom, dateTo) {
  return get(
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
}

export async function getGrowthPreviousRevenueRow(userId, previousDateFrom, previousDateTo) {
  return get(
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
}

export async function getGrowthVelocityRow(userId, dateFrom, dateTo) {
  return get(
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
}

export async function listGrowthTrendRows(userId, trendDateFrom) {
  return all(
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
}

export async function listGrowthCohortSizeRows(userId, cohortStartDate) {
  return all(
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
}

export async function listGrowthCohortActivityRows(userId, cohortStartDate) {
  return all(
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
}

export async function getPilotReadinessRows(userId, dateFrom, dateTo) {
  return Promise.all([
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
}

export async function getActivationCounts(userId) {
  return get(
    `
    SELECT
      (SELECT COUNT(*) FROM customers WHERE user_id = ?) AS total_customers,
      (SELECT COUNT(*) FROM quotes WHERE user_id = ?) AS total_quotes,
      (SELECT COUNT(*) FROM invoices WHERE user_id = ?) AS total_invoices,
      (SELECT COUNT(*) FROM reminder_jobs WHERE user_id = ? AND status = 'sent') AS total_sent_reminders
    `,
    [userId, userId, userId, userId]
  );
}

export async function getUserPlanRecord(userId) {
  return get('SELECT id, plan_code FROM users WHERE id = ?', [userId]);
}

export async function expireOldPlanChangeRequests(userId) {
  return run(
    `
    UPDATE billing_plan_change_requests
    SET status = 'expired'
    WHERE user_id = ? AND status = 'pending' AND datetime(expires_at) < datetime('now')
    `,
    [userId]
  );
}

export async function insertPlanChangeRequest(userId, planCode, ttlMinutes) {
  return run(
    `
    INSERT INTO billing_plan_change_requests (user_id, target_plan_code, status, expires_at)
    VALUES (?, ?, 'pending', datetime('now', ?))
    `,
    [userId, planCode, `+${ttlMinutes} minute`]
  );
}

export async function getPlanChangeRequestById(requestId) {
  return get(
    `
    SELECT id, user_id, target_plan_code, status, expires_at, payment_reference, created_at, paid_at, applied_at
    FROM billing_plan_change_requests
    WHERE id = ?
    `,
    [requestId]
  );
}

export async function getPlanChangeRequestForUser(requestId, userId) {
  return get(
    `
    SELECT id, user_id, target_plan_code, status, payment_reference, created_at, paid_at, applied_at, expires_at
    FROM billing_plan_change_requests
    WHERE id = ? AND user_id = ?
    `,
    [requestId, userId]
  );
}

export async function markPlanChangeRequestExpired(requestId) {
  return run(
    "UPDATE billing_plan_change_requests SET status = 'expired' WHERE id = ? AND status = 'pending'",
    [requestId]
  );
}

export async function markPlanChangeRequestPaid(requestId, paymentReference) {
  return run(
    `
    UPDATE billing_plan_change_requests
    SET status = 'paid',
        payment_reference = ?,
        paid_at = datetime('now')
    WHERE id = ? AND status = 'pending'
    `,
    [paymentReference, requestId]
  );
}

export async function markPlanChangeRequestApplied(requestId) {
  return run(
    `
    UPDATE billing_plan_change_requests
    SET status = 'applied',
        applied_at = datetime('now')
    WHERE id = ? AND status = 'paid'
    `,
    [requestId]
  );
}

export async function updateUserPlanCode(userId, planCode) {
  return run('UPDATE users SET plan_code = ? WHERE id = ?', [planCode, userId]);
}
