# Disaster Recovery Drill Runbook

Bu runbook, Teklifim SQLite veritabani icin otomatik backup/restore dogrulama tatbikatini tanimlar.

## Amac

- Canli DB'ye dokunmadan backup/restore zincirinin calistigini dogrulamak
- Restore sonrasi veri butunlugunu otomatik kontrol etmek
- Release oncesi operasyonel guveni arttirmak

## Nasil Calisir

`npm run dr:drill` komutu:

1. Mevcut DB'yi gecici bir temp klasore kopyalar
2. Bu kopya uzerinde `backupDb.js` calistirir
3. Uretilen backup dosyasini farkli bir temp DB hedefine `restoreDb.js` ile geri yukler
4. Her iki DB icin:
   - `PRAGMA quick_check` sonucu
   - Temel tablo ozetleri (`count`, `max(id)`)
     karsilastirilir
5. Eslesme varsa `0` kodu ile biter; sorun varsa `1` kodu ile fail verir

## Komut

```bash
cd backend
npm run dr:drill
```

Opsiyonel:

- `DR_KEEP_TMP=1` verilirse temp drill klasoru silinmez

Ornek:

```bash
cd backend
DR_KEEP_TMP=1 npm run dr:drill
```

## Beklenen Cikti

- JSON formatli drill raporu:
  - `checks.quickCheckOriginal`
  - `checks.quickCheckRestored`
  - `checks.summaryMatch`
- Basarili durumda `summaryMatch: true`

## Operasyon Onerisi

- Haftalik staging release oncesi en az 1 kez calistirin
- Büyük degisikliklerden sonra (DB schema/index) zorunlu kilin
