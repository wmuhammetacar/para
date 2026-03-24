# Corporate Trust Package (Teklifim)

Bu dokuman, Teklifim MVP'sinin kurumsal guven beklentilerine uygun olarak nasil yonetilecegini tanimlar.
Amac: urunu teknik olarak calisir olmanin otesine tasiyip, operasyonel olarak guvenilir, denetlenebilir ve tekrar edilebilir hale getirmek.

## 1) Package Scope

- Kalite guvencesi: test/coverage/e2e zorunlu gecis kapilari
- Guvenlik ve yetki guvencesi: cross-user izolasyon testleri + validasyon standartlari
- Operasyon guvencesi: release checklist, rollback runbook, monitoring/alert adimlari
- Kanit guvencesi: CI artifactleri ve coverage raporlari ile izlenebilirlik

## 2) Kurumsal Kalite Kapilari

Asagidaki kontroller release adayi icin zorunludur:

1. Backend syntax kontrolu
2. Backend coverage testleri
3. Frontend unit testleri
4. Frontend production build
5. Frontend e2e (smoke + workflow + quality)

Tek komut:

```bash
./scripts/quality-gate.sh
```

## 3) Guvenlik ve Izolasyon Kontrol Matrisi

| Kontrol | Uygulama Durumu | Kanit |
|---|---|---|
| JWT ile endpoint koruma | Uygulandi | `backend/src/middleware/auth.js` |
| Auth brute-force korumasi | Uygulandi | `backend/src/middleware/authRateLimit.js` |
| Cross-user veri izolasyonu | Uygulandi | `backend/tests/authorization-isolation.test.js` |
| Input validasyon (customer/date/items) | Uygulandi | `backend/src/routes/customers.js`, `backend/src/utils/documents.js` |
| Standart hata semasi | Uygulandi | `backend/src/utils/httpErrors.js`, `backend/src/middleware/errorHandler.js` |

## 4) Release Governance

Release oncesi zorunlu belge ve kontroller:

- `docs/RELEASE_CHECKLIST.md`
- `docs/DEFINITION_OF_DONE.md`
- `docs/ROLLBACK_RUNBOOK.md`
- `docs/MONITORING_ALERTS.md`

Onay rolu onerisi (MVP):

- Engineering Owner: teknik gate sorumlusu
- QA Owner: e2e/akış onayi
- Business Owner: pilot musteri akisi onayi

## 5) Incident ve SLA Calisma Modeli

Onceliklendirme:

1. P1 (kritik): login, quote, invoice, pdf ana akis kesintisi
2. P2 (yuksek): ana akis var ama ciddi kalite bozulmasi
3. P3 (orta): workaround ile ilerlenebilir

Hedef yanit suresi:

- P1: 15 dakika icinde ilk yanit, 24 saat icinde kalici cozum/rollback
- P2: 2 saat icinde ilk yanit, 72 saat icinde cozum
- P3: sprint backlog icinde planli cozum

## 6) Kanit ve Denetlenebilirlik

CI artifact ve raporlari:

- Backend coverage artifact
- Frontend coverage artifact
- Playwright test sonucu

Lokal kalite raporu:

```bash
./scripts/quality-gate.sh
```

Bu komut basarisiz olursa release adayi "go/no-go: no-go" kabul edilir.

## 7) Kisa Durum Ozeti (2026-03-23)

- Backend coverage: %79+ global
- Frontend unit test seti: genisletilmis (customers/quotes/invoices/detail/login)
- E2E seti: smoke + workflow + quality
- CI: backend + frontend + zorunlu e2e kapisi

Bu paket ile Teklifim, "yalnizca calisan MVP" seviyesinden "kontrollu release yapabilen MVP" seviyesine gecmistir.
