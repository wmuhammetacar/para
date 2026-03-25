# Teklifim Agency Operations

Teklifim, dijital ajanslar icin konumlandirilmis bir operasyon SaaS urunudur.
Ana akis: `client -> teklif -> fatura -> odeme takibi -> hatirlatma`.
Amac, ajans sahiplerinin tahsilat kontrolunu guclendirirken buyuk ERP karmasina girmeden profesyonel bir operasyon paneli sunmaktir.

## Tech Stack

- Backend: Node.js + Express
- Frontend: React (Vite)
- Database: SQLite
- Styling: TailwindCSS
- PDF: PDFKit

## Features

1. Email + password authentication
2. Client management (create, edit, delete, quick search)
3. Quote workflow (create, edit, delete, detail view, service item presets, payment plan presets, auto total, PDF export)
4. Invoice + collection workflow (manual or from quote, create/edit/delete, detail view, due date + payment status tracking, PDF export, reminder queue: WhatsApp/E-posta, reminder ops + failed retry)
5. Agency dashboard (clients, active quotes, active invoices, expected revenue, overdue receivables, period filter: all/today/7/30)
6. Onboarding activation flow (first customer/quote/invoice/reminder checklist + quick-win priorities + estimated completion time)
7. Growth analytics panel (quote->invoice and invoice->payment conversion, 6-month trend, revenue composition)
8. Package and pricing management (starter/standard package switch + limit usage tracking)
9. Advanced growth analytics (period comparison, conversion velocity, cohort retention matrix)
10. Pilot readiness center (readiness score, control checklist, prioritized action plan)

## Project Structure

```text
teklifim/
  .github/
    workflows/
      ci.yml
      staging-release.yml
    ISSUE_TEMPLATE/
    pull_request_template.md
  docs/
    DEVELOPMENT_PROGRAM.md
    SPRINT_0_PLAN.md
    SPRINT_1_EXECUTION.md
    SPRINT_2_EXECUTION.md
    SPRINT_3_EXECUTION.md
    SPRINT_4_EXECUTION.md
    SPRINT_5_EXECUTION.md
    SPRINT_6_EXECUTION.md
    SPRINT_7_EXECUTION.md
    SPRINT_8_EXECUTION.md
    SPRINT_9_EXECUTION.md
    SPRINT_10_EXECUTION.md
    SPRINT_11_EXECUTION.md
    SPRINT_12_EXECUTION.md
    STAGING_SETUP.md
    STAGING_SMOKE_RUNBOOK.md
    ROLLBACK_RUNBOOK.md
    ROLLBACK_REHEARSAL_RUNBOOK.md
    BACKUP_RESTORE_RUNBOOK.md
    PERFORMANCE_BASELINE.md
    DISASTER_RECOVERY_DRILL.md
    MONITORING_ALERTS.md
    ONBOARDING_SUPPORT_SOP.md
    PRICING_PACKAGES.md
    PILOT_UAT_INTERNAL_REPORT.md
    DEFINITION_OF_DONE.md
    RELEASE_CHECKLIST.md
    RISK_REGISTER.md
  backend/
    tests/
    scripts/
      seed.js
      backupDb.js
      restoreDb.js
    src/
      middleware/
      routes/
      utils/
      app.js
      db.js
      server.js
    jest.config.cjs
    .env.example
    package.json
  frontend/
    e2e/
      smoke.spec.js
    src/
      components/
      contexts/
      test/
      pages/__tests__/
      pages/
      App.jsx
      api.js
      main.jsx
      index.css
    .env.example
    index.html
    package.json
    playwright.config.js
    tailwind.config.cjs
    postcss.config.cjs
    vite.config.js
  README.md
```

## Local Setup

### 1) Backend setup

```bash
cd backend
npm install
cp .env.example .env
DEMO_PASSWORD=Strong123 npm run seed
npm run dev
```

Backend default URL: `http://localhost:4000`

Demo user (opsiyonel, seed sirasinda olusturulur):

- Email: `demo@teklifim.com`
- Password: `DEMO_PASSWORD` env degeri

Demo verilerini temizlemek icin:

```bash
cd backend
npm run purge:demo
```

Backend `.env` icin kritik degiskenler:

- `JWT_SECRET`
- `COMPANY_NAME`
- `COMPANY_EMAIL` (opsiyonel, PDF footer/header icin)
- `COMPANY_PHONE` (opsiyonel, PDF footer/header icin)
- `COMPANY_ADDRESS` (opsiyonel, PDF footer/header icin)
- `COMPANY_TAX_NUMBER` (opsiyonel, PDF footer icin)
- `CORS_ORIGIN` (ornek: `http://localhost:5173,http://127.0.0.1:5173`)
- `BILLING_INTERNAL_TOKEN` (`POST /dashboard/plan/change-request/:id/confirm` icin zorunlu billing servis anahtari)
- `BILLING_PLAN_REQUEST_TTL_MINUTES` (plan degisikligi odeme talebi gecerlilik suresi, varsayilan: `30`)
- `METRICS_INTERNAL_TOKEN` (`GET /health/metrics` icin zorunlu internal erisim anahtari)
- `TRUST_PROXY` (`true/1` ise audit loglarinda `x-forwarded-for` trusted kabul edilir)
- `ABUSE_WRITE_RATE_LIMIT_WINDOW_MS`
- `ABUSE_WRITE_RATE_LIMIT_MAX`
- `ABUSE_PDF_RATE_LIMIT_WINDOW_MS`
- `ABUSE_PDF_RATE_LIMIT_MAX`
- `ABUSE_REMINDER_RATE_LIMIT_WINDOW_MS`
- `ABUSE_REMINDER_RATE_LIMIT_MAX`
- `AUDIT_LOG_RETENTION_DAYS`
- `AUDIT_PURGE_INTERVAL_MS`
- `AUTH_RATE_LIMIT_WINDOW_MS`
- `AUTH_RATE_LIMIT_MAX`
- `AUTH_LOGIN_MAX_FAILED_ATTEMPTS` (opsiyonel, varsayilan: `5`)
- `AUTH_LOGIN_LOCK_MINUTES` (opsiyonel, varsayilan: `15`)
- `HOST` (opsiyonel, varsayilan: `127.0.0.1`)
- `REMINDER_WORKER_INTERVAL_MS` (opsiyonel, varsayilan: `15000`)
- `REMINDER_MAX_RETRY_COUNT` (opsiyonel, varsayilan: `3`)
- `REMINDER_RETRY_BACKOFF_MINUTES` (opsiyonel, varsayilan: `5,15,30`)

### 2) Frontend setup

Yeni terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend default URL: `http://localhost:5173`

## Quality Commands

Backend:

```bash
cd backend
npm run check:syntax
npm test
npm run test:coverage
npm run purge:audit
npm run perf:benchmark
npm run dr:drill
npm run smoke:api
```

Frontend:

```bash
cd frontend
npm run test:run
npm run test:coverage
npm run build
```

E2E smoke:

```bash
cd frontend
npm run e2e:install
npm run e2e
```

Port cakismasi varsa:

```bash
cd frontend
E2E_BACKEND_PORT=4011 E2E_FRONTEND_PORT=5201 npm run e2e
```

Kurumsal kalite kapisi (tum kontroller tek komut):

```bash
./scripts/quality-gate.sh
```

## Example API Endpoints

Base URL: `http://localhost:4000/api`

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

### Dashboard

- `GET /dashboard/stats`
- `GET /dashboard/stats?period=all|today|7|30`
- `GET /dashboard/activity?limit=1..50&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`
- `GET /dashboard/growth?period=7..365&cohortMonths=3..12`
- `GET /dashboard/activation`
- `GET /dashboard/plan`
- `POST /dashboard/plan/change-request`
- `POST /dashboard/plan/change-request/:id/confirm`
  - Bu endpoint guvenlik nedeniyle `x-billing-token: <BILLING_INTERNAL_TOKEN>` header'i ister.
- `PATCH /dashboard/plan`
  - `planChangeRequestId` zorunludur; yalnizca `paid` durumuna gecmis talep uygulanir.
- `GET /dashboard/pilot-readiness?period=7..90`

### Health

- `GET /health`
- `GET /health/metrics`
  - Bu endpoint guvenlik nedeniyle `x-metrics-token: <METRICS_INTERNAL_TOKEN>` header'i ister.
### Customers

- `GET /customers`
- `GET /customers?withMeta=1&q=<text>&page=1&limit=20`
- `POST /customers`
- `PUT /customers/:id`
- `DELETE /customers/:id`

### Quotes

- `GET /quotes`
- `GET /quotes?withMeta=1&q=<text>&page=1&limit=20`
- `GET /quotes/:id`
- `POST /quotes`
- `PUT /quotes/:id`
- `DELETE /quotes/:id`
- `GET /quotes/:id/pdf`

### Invoices

- `GET /invoices`
- `GET /invoices?withMeta=1&status=all|pending|paid|overdue&q=<text>&page=1&limit=20`
- `GET /invoices/:id`
- `POST /invoices` (manual or from quote with `quoteId`)
- `PUT /invoices/:id`
- `PATCH /invoices/:id/payment` (status: `pending|paid`)
- `PATCH /invoices/payment/bulk` (toplu status guncelleme)
- `GET /invoices/:id/reminders`
- `POST /invoices/:id/reminders` (channel: `whatsapp|email`)
- `GET /invoices/reminders/ops` (query: `status`, `channel`, `limit`; response: summary + errorBreakdown + retry policy + backoff schedule)
- `POST /invoices/reminders/:reminderId/retry` (failed reminder retry)
- `DELETE /invoices/:id`
- `GET /invoices/:id/pdf`

## Sample Request Bodies

### Register

```json
{
  "email": "owner@firma.com",
  "password": "Strong123",
  "companyName": "Firma Adi",
  "planCode": "starter"
}
```

### Login

```json
{
  "email": "owner@firma.com",
  "password": "Strong123"
}
```

### Create Customer

```json
{
  "name": "Acar Insaat",
  "phone": "+90 555 123 4567",
  "email": "info@acarinsaat.com",
  "address": "Kadikoy / Istanbul"
}
```

### Create Quote

```json
{
  "customerId": 1,
  "date": "2026-03-22",
  "items": [
    { "name": "Web Tasarim Hizmeti", "quantity": 1, "unitPrice": 12000 },
    { "name": "Bakim Paketi", "quantity": 1, "unitPrice": 3500 }
  ]
}
```

### Create Invoice (Manual)

```json
{
  "customerId": 1,
  "date": "2026-03-22",
  "items": [
    { "name": "Aylik Hizmet", "quantity": 1, "unitPrice": 5000 }
  ]
}
```

### Create Invoice (From Quote)

```json
{
  "quoteId": 1,
  "date": "2026-03-22"
}
```

## Notes

- Authentication is JWT Bearer token based.
- All protected endpoints require `Authorization: Bearer <token>`.
- PDF output includes company name, customer info, item table, total, and date with a corporate layout template.
- Auth endpointlerinde temel brute-force korumasi icin rate limit vardir.
- Auth ve auth disindaki protected write/pdf/reminder endpointlerinde DB-backed rate limit vardir.
- Login endpointinde hesap bazli gecici kilitleme vardir (ardisik hatali deneme limiti asildiginda).
- Tum API response'larinda `X-Request-Id` header'i doner.
- Kritik is aksiyonlari (`auth`, `customer`, `quote`, `invoice`) `audit_logs` tablosuna yazilir.
- Audit metadata alaninda e-posta/payload hassas alanlari maskelenir; eski audit kayitlari retention politikasina gore temizlenir.
- Monitoring icin `/health/metrics` endpointi mevcuttur.
- Customer API temel format/uzunluk dogrulamasi uygular (name, phone, email, address).
- Register API sifre politikasi uygular: 8-72 karakter, en az bir buyuk harf, bir kucuk harf ve bir rakam.
- Reminder operasyonlari icin status ozet/listesi ve failed job retry endpointleri mevcuttur.
- Reminder queue sadece `next_attempt_at` zamani gelen isleri isler; failed job'lar backoff politikasina gore otomatik yeniden planlanir.
- Plan degisikligi akisinda odeme onayi zorunludur (change-request -> billing confirm -> apply).

## Professional Development Program

Bu repository profesyonel gelistirme programi ile desteklenmektedir:

- Program yol haritasi: `docs/DEVELOPMENT_PROGRAM.md`
- Sprint 0 plani: `docs/SPRINT_0_PLAN.md`
- Sprint 1 execution: `docs/SPRINT_1_EXECUTION.md`
- Sprint 2 execution: `docs/SPRINT_2_EXECUTION.md`
- Sprint 3 execution: `docs/SPRINT_3_EXECUTION.md`
- Sprint 4 execution: `docs/SPRINT_4_EXECUTION.md`
- Sprint 5 execution: `docs/SPRINT_5_EXECUTION.md`
- Sprint 6 execution: `docs/SPRINT_6_EXECUTION.md`
- Definition of Done: `docs/DEFINITION_OF_DONE.md`
- Release checklist: `docs/RELEASE_CHECKLIST.md`
- Release readiness report: `docs/RELEASE_READINESS_2026-03-25.md`
- Risk register: `docs/RISK_REGISTER.md`
- Staging setup guide: `docs/STAGING_SETUP.md`
- Rollback runbook: `docs/ROLLBACK_RUNBOOK.md`
- Backup/restore runbook: `docs/BACKUP_RESTORE_RUNBOOK.md`
- Monitoring and alerts: `docs/MONITORING_ALERTS.md`
- Corporate trust package: `docs/CORPORATE_TRUST_PACKAGE.md`
- Onboarding and support SOP: `docs/ONBOARDING_SUPPORT_SOP.md`
- Pricing packages: `docs/PRICING_PACKAGES.md`
- Pilot UAT internal report: `docs/PILOT_UAT_INTERNAL_REPORT.md`
- CI pipeline: `.github/workflows/ci.yml`
- Staging release workflow: `.github/workflows/staging-release.yml`
- PR/Issue template seti: `.github/`

Backend kalite komutu:

```bash
cd backend
npm run check:syntax
```

DB backup/restore:

```bash
cd backend
npm run backup:db
npm run restore:db -- --from ./backups/teklifim-backup-YYYYMMDD-HHMMSS.sqlite
```

## Standard Error Schema

Backend hata response yapisi standarttir:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Musteri adi zorunludur.",
    "details": [{ "field": "name", "rule": "required" }]
  }
}
```
