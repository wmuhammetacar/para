# Performance Baseline Runbook

Bu dokuman Teklifim backend performansini standard bir yuk profiliyle olcmek icin kullanilir.

## Amac

- Kritik endpointlerde response suresi ve hata oranini olcmek
- Sprint bazli performans iyilestirmelerinin etkisini karsilastirmali izlemek
- Lokal/staging ortamlarda hizli p95 kontrolu yapmak

## Hazirlik

1. Backend ayaga kaldir:

```bash
cd backend
npm install
npm run seed
npm run dev
```

2. Benchmark login davranisi:

- Varsayilan hesap: `perf@teklifim.local`
- Varsayilan sifre: `Perf12345`
- Hesap yoksa script otomatik olarak register edip devam eder

## Benchmark Komutu

```bash
cd backend
npm run perf:benchmark
```

Opsiyonel ortam degiskenleri:

- `PERF_BASE_URL` (varsayilan: `http://127.0.0.1:4000`)
- `PERF_EMAIL` (varsayilan: `perf@teklifim.local`)
- `PERF_PASSWORD` (varsayilan: `Perf12345`)
- `PERF_REQUESTS_PER_ENDPOINT` (varsayilan: `40`)
- `PERF_CONCURRENCY` (varsayilan: `4`)
- `PERF_TIMEOUT_MS` (varsayilan: `8000`)
- `PERF_TARGET_P95_MS` (varsayilan: `350`)
- `PERF_FAIL_ON_SLO` (`1/true` olursa SLO disi sonuc varsa exit code `1`)

Ornek:

```bash
PERF_REQUESTS_PER_ENDPOINT=80 PERF_CONCURRENCY=8 PERF_TARGET_P95_MS=300 npm run perf:benchmark
```

## Hedefler (MVP-Plus)

- Endpoint p95: `<= 350ms`
- Endpoint error rate: `%0`
- `/health/metrics` uzerinden latency percentile alanlari gorunur:
  - `metrics.latencyMs.p50`
  - `metrics.latencyMs.p95`
  - `metrics.latencyMs.p99`

## Notlar

- Sonuclar ortam kaynagina baglidir (CPU, disk, ayni anda calisan surecler).
- Karsilastirma icin ayni makine ve benzer yuk kosullarinda tekrar olun.
- Benchmark oncesi seed/dis temizligi ile veri dagilimini stabilize etmek onerilir.

## Baseline Sonucu (March 24, 2026)

Calistirilan profil:

- `PERF_REQUESTS_PER_ENDPOINT=25`
- `PERF_CONCURRENCY=5`
- `PERF_TARGET_P95_MS=350`

Ozet:

- `Health` p95: `27.57ms`
- `Metrics` p95: `20.18ms`
- `Dashboard Stats` p95: `48.70ms`
- `Dashboard Activity` p95: `21.54ms`
- `Customers List` p95: `25.60ms`
- `Quotes List` p95: `26.36ms`
- `Invoices List` p95: `28.06ms`

Tum endpointlerde hata orani `%0` ve p95 hedefi `<=350ms` karsilanmistir.
