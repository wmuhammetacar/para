import process from 'node:process';

function normalizeBaseUrl(value) {
  const base = String(value || 'http://127.0.0.1:4000').trim();
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  let body = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { response, body };
}

async function requestPdf(baseUrl, path, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const contentType = response.headers.get('content-type') || '';
  return {
    ok: response.ok,
    statusCode: response.status,
    contentType
  };
}

async function resolveToken(baseUrl, email, password) {
  async function login() {
    return requestJson(baseUrl, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
  }

  const first = await login();
  if (first.response.ok && first.body?.token) {
    return first.body.token;
  }

  if (first.response.status === 401 || first.response.status === 404) {
    const registerResponse = await requestJson(baseUrl, '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        companyName: 'Teklifim Smoke User'
      })
    });

    if (!registerResponse.response.ok && registerResponse.response.status !== 409) {
      throw new Error(`Register failed: status ${registerResponse.response.status}`);
    }

    const second = await login();
    if (second.response.ok && second.body?.token) {
      return second.body.token;
    }

    throw new Error(`Login failed after register: status ${second.response.status}`);
  }

  throw new Error(`Login failed: status ${first.response.status}`);
}

function assertOk(check, message) {
  if (!check) {
    throw new Error(message);
  }
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.SMOKE_BASE_URL || process.env.PERF_BASE_URL || 'http://127.0.0.1:4000');
  const email = process.env.SMOKE_EMAIL || 'smoke@teklifim.local';
  const password = process.env.SMOKE_PASSWORD || 'Smoke12345';
  const strictPdf = toBoolean(process.env.SMOKE_STRICT_PDF, false);

  const report = {
    baseUrl,
    checks: []
  };

  const health = await requestJson(baseUrl, '/health');
  assertOk(health.response.ok, `/health failed: ${health.response.status}`);
  report.checks.push({ name: 'health', status: health.response.status });

  const token = await resolveToken(baseUrl, email, password);
  report.checks.push({ name: 'auth', status: 'ok' });

  const authHeaders = {
    Authorization: `Bearer ${token}`
  };

  const dashboard = await requestJson(baseUrl, '/api/dashboard/stats?period=30', {
    headers: authHeaders
  });
  assertOk(dashboard.response.ok, `/api/dashboard/stats failed: ${dashboard.response.status}`);
  report.checks.push({ name: 'dashboard_stats', status: dashboard.response.status });

  const customers = await requestJson(baseUrl, '/api/customers?withMeta=1&page=1&limit=10', {
    headers: authHeaders
  });
  assertOk(customers.response.ok, `/api/customers failed: ${customers.response.status}`);
  report.checks.push({ name: 'customers', status: customers.response.status });

  const quotes = await requestJson(baseUrl, '/api/quotes?withMeta=1&page=1&limit=10', {
    headers: authHeaders
  });
  assertOk(quotes.response.ok, `/api/quotes failed: ${quotes.response.status}`);
  report.checks.push({ name: 'quotes', status: quotes.response.status });

  const invoices = await requestJson(baseUrl, '/api/invoices?withMeta=1&status=all&page=1&limit=10', {
    headers: authHeaders
  });
  assertOk(invoices.response.ok, `/api/invoices failed: ${invoices.response.status}`);
  report.checks.push({ name: 'invoices', status: invoices.response.status });

  const firstQuote = Array.isArray(quotes.body?.data) ? quotes.body.data[0] : null;
  if (firstQuote?.id) {
    const quotePdf = await requestPdf(baseUrl, `/api/quotes/${firstQuote.id}/pdf`, token);
    const quotePdfOk = quotePdf.ok && quotePdf.contentType.includes('application/pdf');
    if (strictPdf) {
      assertOk(quotePdfOk, `/api/quotes/:id/pdf failed: status=${quotePdf.statusCode}, contentType=${quotePdf.contentType}`);
    }
    report.checks.push({
      name: 'quote_pdf',
      status: quotePdf.statusCode,
      contentType: quotePdf.contentType,
      ok: quotePdfOk
    });
  } else {
    report.checks.push({ name: 'quote_pdf', status: 'skipped_no_quote' });
  }

  const firstInvoice = Array.isArray(invoices.body?.data) ? invoices.body.data[0] : null;
  if (firstInvoice?.id) {
    const invoicePdf = await requestPdf(baseUrl, `/api/invoices/${firstInvoice.id}/pdf`, token);
    const invoicePdfOk = invoicePdf.ok && invoicePdf.contentType.includes('application/pdf');
    if (strictPdf) {
      assertOk(
        invoicePdfOk,
        `/api/invoices/:id/pdf failed: status=${invoicePdf.statusCode}, contentType=${invoicePdf.contentType}`
      );
    }
    report.checks.push({
      name: 'invoice_pdf',
      status: invoicePdf.statusCode,
      contentType: invoicePdf.contentType,
      ok: invoicePdfOk
    });
  } else {
    report.checks.push({ name: 'invoice_pdf', status: 'skipped_no_invoice' });
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('API smoke failed:', error.message);
  process.exit(1);
});
