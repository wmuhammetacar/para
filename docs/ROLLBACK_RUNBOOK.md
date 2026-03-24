# Rollback Runbook

Bu runbook, staging release sonrasi kritik hata durumunda hizli geri donus adimlarini tanimlar.

## 1) Rollback Kriteri

Asagidakilerden biri gorulurse rollback uygulayin:

- Login, quote veya invoice akislari kullanilamaz durumda
- PDF olusturma kritik oranda hata veriyor
- API 5xx hata orani hizla artiyor

## 2) Hemen Yapilacaklar

1. Yeni deploy trafigini durdurun.
2. Sorunlu release paketini etiketleyin.
3. Bir onceki stabil paketi staging'e geri acin.

## 3) Staging Geri Donus Komutu (Ornek)

Sunucu klasor yapisi release bazliysa:

```bash
cd /var/www/teklifim-staging
ln -sfn releases/<onceki_surum> current
```

Process manager kullaniliyorsa servis yeniden yuklenir:

```bash
pm2 reload teklifim-backend
```

Rollback rehearsal otomasyonu:

```bash
./scripts/rollback-rehearsal.sh --deploy-path /var/www/teklifim-staging
```

Detayli tatbikat:
- `docs/ROLLBACK_REHEARSAL_RUNBOOK.md`

## 4) Dogrulama

Rollback sonrasi su kontrol zorunludur:

- `/health` 200 donuyor
- Demo hesap ile login calisiyor
- Dashboard verisi geliyor
- Quote/Invoice PDF export calisiyor

## 5) Olay Kaydi

Her rollback sonrasi:

- Kisa incident ozeti
- Root cause notu
- Tekrarini onleyici aksiyon maddesi
