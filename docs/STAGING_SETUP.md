# Staging Setup Guide

Bu dokuman, `staging-release` workflow'unun deploy adimini aktif etmek icin gereken ayarlari listeler.

## 1) GitHub Secrets

Repository Settings > Secrets and variables > Actions altinda asagidaki secret'lari tanimlayin:

- `STAGING_SSH_HOST`: Staging sunucu host/IP
- `STAGING_SSH_USER`: SSH kullanici adi
- `STAGING_SSH_KEY`: Private key (PEM formatinda)
- `STAGING_DEPLOY_PATH`: Sunucuda deploy klasoru (ornek: `/var/www/teklifim-staging`)
- `STAGING_HEALTHCHECK_URL` (opsiyonel): Deploy sonrasi `curl` ile kontrol edilecek endpoint (ornek: `https://staging.example.com/health`)

Not: `STAGING_SSH_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_KEY`, `STAGING_DEPLOY_PATH` secret'larindan biri eksikse workflow deploy adimini otomatik olarak atlar.

## 2) Staging Workflow Tetikleme

- Otomatik: `develop` branch'ine push
- Manuel: GitHub Actions > `Staging Release` > `Run workflow`

## 3) Basarili Calisma Kriterleri

Deploy adimina gecmeden once su quality gate'ler gecmelidir:

- Backend syntax + coverage
- Frontend unit coverage
- Playwright e2e smoke
- Frontend build

## 4) Sunucu Hazirlik Kontrolu

Staging sunucuda asgari olarak:

- Node.js 22+
- Yeterli disk alani
- SSH ile key-based giris
- `STAGING_DEPLOY_PATH` yazma izni

## 5) Release Sonrasi Smoke

Deploy sonrasi hizli API smoke:

```bash
./scripts/api-smoke.sh
```

Detaylar:
- `docs/STAGING_SMOKE_RUNBOOK.md`
