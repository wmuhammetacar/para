# Customer Onboarding and Support SOP

Bu SOP, yeni musteri aktivasyonu ve ilk destek surecini standart hale getirir.

## 1) Onboarding Adimlari

1. Musteri icin hesap olusturulur (`/auth/register`).
2. Temel profil bilgileri ve sirket adi dogrulanir.
3. En az 1 musteri kaydi birlikte olusturulur.
4. En az 1 teklif ve 1 fatura olusturma adimi canli gosterilir.
5. PDF export adimi musteri ile birlikte test edilir.

## 2) Go-Live Hazirlik Kontrolu

- Login sorunsuz
- Customer CRUD sorunsuz
- Quote kayit + PDF sorunsuz
- Invoice kayit + PDF sorunsuz
- Dashboard metrikleri beklenen degerde

## 3) Destek Seviyesi (MVP)

- Kritik konu (login, veri kaybi, fatura kesememe): hedef ilk donus <= 2 saat
- Orta seviye konu (yanlis veri goruntuleme, performans): hedef ilk donus <= 8 saat
- Dusuk seviye konu (kullanim sorulari): hedef ilk donus <= 24 saat

## 4) Destek Talebi Kaydi

Her destek talebinde asagidaki bilgi zorunludur:

- Musteri adi
- Sorun ozeti
- Islem zamani
- Mumkunse `X-Request-Id`
- Cozum notu ve kapanis zamani
