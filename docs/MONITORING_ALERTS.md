# Monitoring and Alerts

Bu dokuman, Teklifim MVP icin minimum izleme ve alarm kural setini tanimlar.

## 1) Teknik Kaynaklar

- Health endpoint: `GET /health`
- Metrics endpoint: `GET /health/metrics`
- Request log: JSON format (`time`, `requestId`, `method`, `path`, `status`, `durationMs`)

## 2) Izlenen Metrikler

`/health/metrics` response icindeki temel alanlar:

- `uptimeSeconds`
- `totalRequests`
- `requestsPerMinute`
- `total4xx`
- `total5xx`
- `authRateLimited`

## 3) Alarm Esikleri (MVP)

- **API Availability**: `/health` 2 dakika boyunca ulasilamazsa kritik alarm
- **Server Error Spike**: 5 dakika icinde `total5xx` artis hizi beklenenden yuksekse uyari
- **Auth Abuse**: `authRateLimited` degeri hizli artiyorsa guvenlik uyarisi
- **Traffic Drop**: `requestsPerMinute` normalin altina inerse operasyon uyarisi

## 4) Operasyon Aksiyonu

Alarm durumunda:

1. `X-Request-Id` ile hatali istekleri loglardan bulun.
2. Hata sinifini belirleyin (4xx / 5xx / rate-limit).
3. Gerekirse rollback runbook'u uygulayin (`docs/ROLLBACK_RUNBOOK.md`).
4. Incident ozeti ve aksiyonlari kayda alin.
