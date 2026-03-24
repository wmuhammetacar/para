# Staging Smoke Runbook

Bu runbook staging release sonrasi hizli API saglik kontrolunu standartlastirir.

## Amac

- Deploy sonrasi kritik endpointlerin ayakta oldugunu dakikalar icinde dogrulamak
- Login ve temel liste endpointlerinde regressions yakalamak
- Ops ekibine tek komutla smoke proseduru vermek

## Komut

Yerel/staging baglantisi acik bir ortamda:

```bash
./scripts/api-smoke.sh
```

Varsayilan:

- Backend host: `127.0.0.1`
- Backend port: `4061`
- Script gecici backend ayaga kaldirir, smoke tamamlayinca kapatir

## Opsiyonel Degiskenler

- `SMOKE_BACKEND_PORT` (varsayilan `4061`)
- `SMOKE_HOST` (varsayilan `127.0.0.1`)
- `SMOKE_BASE_URL` (varsayilan `http://<host>:<port>`)
- `SMOKE_WAIT_SECONDS` (varsayilan `2`)
- `SMOKE_STRICT_PDF=1` (PDF endpointlerini strict fail modunda kontrol eder)

## Quality Gate Entegrasyonu

Tüm kalite kapisinda opsiyonel smoke:

```bash
RUN_API_SMOKE=1 ./scripts/quality-gate.sh
```

DR tatbikati ile birlikte:

```bash
RUN_DR_DRILL=1 RUN_API_SMOKE=1 ./scripts/quality-gate.sh
```
