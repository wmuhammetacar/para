# Teklifim Professional Development Program

Bu dokuman, Teklifim MVP'sini profesyonel bir urune donusturmek icin 12 haftalik uygulama programini tanimlar.

## 1) Program Hedefleri

- Urun kalitesi: kritik bug oranini azaltmak, stabiliteyi artirmak
- Operasyon kalitesi: takip edilebilir release ve rollback disiplinine gecmek
- Kod kalitesi: net standartlar, tekrar edilebilir kontrol adimlari, otomasyon
- Ticari hazirlik: onboarding, faturalama akisi guveni, raporlama guvenilirligi

## 2) Basari Olcutleri (KPI)

- Uptime (prod): >= %99.5
- Kritik bug cozum suresi: <= 24 saat
- Yeni release sikligi: haftada en az 1 release
- Sprint hedef tamamlama: >= %80
- PDF olusturma hata orani: < %1
- Dashboard verisi tutarlilik sapmasi: %0

## 3) Fazlar ve Zamanlama

### Faz 0 - Stabilizasyon ve Temel Disiplin (Hafta 1)

Teslimatlar:
- Standart gelistirme sureci dokumani
- Branching ve PR kural seti
- CI pipeline (build + smoke)
- Defect triage akisi

Kabul kriteri:
- Her PR icin otomatik kontrol calisiyor
- Release oncesi kontrol listesi zorunlu

### Faz 1 - Kod Kalitesi ve Test Altyapisi (Hafta 2-4)

Teslimatlar:
- Backend icin birim + entegrasyon testleri (auth, customer, quote, invoice)
- Frontend icin kritik akis testleri (login, create quote, create invoice)
- Lint/format standardizasyonu
- Hata siniflandirma ve log format standardi

Kabul kriteri:
- Kritik API endpointlerinde temel test kapsami
- Ana akislarda regresyon testi mevcut

### Faz 2 - Urun Saglamlastirma (Hafta 5-8)

Teslimatlar:
- Validation katmanini guclendirme
- Yetki kontrolu ve guvenlik sertlestirmesi
- PDF tasarim standardizasyonu (sablon kalitesi)
- Performans iyilestirmeleri (listeleme ve raporlama)

Kabul kriteri:
- Guvenlik checklist maddeleri tamam
- 1000+ kayitta kabul edilebilir listeleme performansi

### Faz 3 - Operasyon ve Ticari Hazirlik (Hafta 9-12)

Teslimatlar:
- Monitoring ve alert metrikleri
- Release/rollback runbook
- Musteri onboarding ve destek SOP
- Basit fiyatlandirma ve paketleme dokumani

Kabul kriteri:
- Canliya cikis proseduru tekrar edilebilir
- 1 pilot musteri ile end-to-end akis dogrulandi

## 4) Workstream Yapisi

- Product: backlog onceliklendirme, kabul kriterleri
- Engineering: implementasyon, test, teknik borc azaltma
- QA: regresyon seti, release onayi
- Ops: deploy, monitoring, incident yonetimi
- Business: demo akisi, fiyatlama, musteri geri bildirimi

## 5) Sprint Ritmi

- Sprint suresi: 2 hafta
- Planlama: Pazartesi
- Mid-sprint kontrol: 1. hafta Persembe
- Demo + Retro: 2. hafta Cuma

Rituel ciktisi:
- Sprint hedefi
- Sprint backlog
- Risk listesi
- Release adayi listesi

## 6) Kalite Kapilari (Quality Gates)

Bir is "done" sayilmasi icin:
- Kabul kriterleri gecti
- Kod incelemesi tamamlandi
- CI basarili
- Dokumantasyon guncellendi
- Smoke test gecildi

## 7) Risk Yonetimi

Temel riskler:
- Tek kisilik bilgi bagimliligi
- Test eksikligi kaynakli regressions
- Hızlı feature baskisi nedeniyle teknik borc birikimi

Azaltim aksiyonlari:
- PR kontrol listesi
- Haftalik teknik borc saati
- Kritik akislarda zorunlu test

## 8) Ilk 30 Gun Sonu Beklenen Durum

- Program ritmi oturmus
- En kritik akislarda testler var
- Release adimlari standartlasmis
- Canli pilota hazir bir kalite seviyesi yakalanmis

## 9) Mevcut Durum Notu

- Sprint 0 temel surec kurulumu tamamlandi (`docs/SPRINT_0_PLAN.md`).
- Sprint 1 icrasi tamamlandi (`docs/SPRINT_1_EXECUTION.md`).
