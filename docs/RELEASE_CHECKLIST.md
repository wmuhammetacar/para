# Release Checklist

Son readiness raporu: `docs/RELEASE_READINESS_2026-03-25.md`

## Pre-Release

- [ ] Open bug listesi gozden gecirildi
- [ ] Kritik bug kalmadi
- [ ] Backend quality gate gecti (`npm run quality:gate`)
- [ ] Frontend quality gate gecti (`npm run quality:gate`)
- [ ] E2E quality suite gecti (`npm run quality:e2e`)
- [ ] Database backup dogrulandi

## Release

- [ ] Tag olusturuldu
- [ ] Changelog guncellendi
- [ ] Deploy tamamlandi
- [ ] Health check basarili

## Post-Release

- [ ] Login, quote, invoice akislari test edildi
- [ ] PDF export test edildi
- [ ] Dashboard metrikleri dogru
- [ ] Geri donus (rollback) plani hazir

## Go/No-Go Sign-Off

- [ ] Engineering Owner onayi
- [ ] QA Owner onayi
- [ ] Business Owner onayi
- [ ] Release karari: Go
