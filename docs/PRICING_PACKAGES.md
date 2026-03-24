# Pricing and Packages (MVP)

Bu dokuman, Teklifim MVP icin sade ve satilabilir paket yapisini tanimlar.

## 1) Paketler

### Baslangic

- Hedef: yeni kurulan mikro isletmeler
- Dahil:
  - Customer yonetimi
  - Teklif olusturma + PDF
  - Fatura olusturma + PDF
  - Dashboard ozet metrikleri
  - Paket limiti:
    - Musteri: 50
    - Aylik teklif: 30
    - Aylik fatura: 30
    - Aylik hatirlatma: 60
- Onerilen fiyat: 499 TRY / ay

### Standart

- Hedef: duzenli teklif/fatura hacmi olan KOBI
- Dahil:
  - Baslangic paketindeki tum ozellikler
  - Oncelikli destek SLA (is saatlerinde daha hizli geri donus)
  - Paket limiti:
    - Musteri: 250
    - Aylik teklif: 200
    - Aylik fatura: 200
    - Aylik hatirlatma: 400
- Onerilen fiyat: 899 TRY / ay

## 2) Satis Notlari

- MVP odagi: hizli teklif/fatura sureci ve operasyonel sadelik
- Demo akisi: login -> customer -> quote -> invoice -> PDF
- Ilk 7 gun aktif kullanimda destek yakin takibi onerilir

## 3) Paket Disi Not

- Bu dokuman MVP donemi icindir.
- Enterprise seviyede ozellestirme talebi ayrica tekliflendirilir.

## 4) Urun Icinde Uygulama

- Paket yonetimi uygulama icinde `/plans` ekranindan yapilir.
- API:
  - `GET /api/dashboard/plan`
  - `PATCH /api/dashboard/plan`
- Limit asiminda create endpointleri `BUSINESS_RULE_VIOLATION` kodu ile durdurulur.
