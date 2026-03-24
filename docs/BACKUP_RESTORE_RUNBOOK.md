# Backup & Restore Runbook

Bu runbook SQLite veritabani icin temel backup/restore operasyonunu tarif eder.

## 1) Backup Alma

```bash
cd backend
npm run backup:db
```

Varsayilan:
- DB yolu: `DB_PATH` (`./database.sqlite`)
- Backup klasoru: `BACKUP_DIR` (`./backups`)

Cikti:
- `teklifim-backup-YYYYMMDD-HHMMSS.sqlite`
- varsa ek olarak `-wal` ve `-shm` dosyalari

## 2) Restore Etme

Onemli:
- Restore oncesi backend servisini durdurun.
- Hatali restore riskine karsi once mevcut DB'nin yedegini alin.

Komut:

```bash
cd backend
npm run restore:db -- --from ./backups/teklifim-backup-YYYYMMDD-HHMMSS.sqlite
```

## 3) Restore Sonrasi Dogrulama

```bash
cd backend
npm run dev
curl http://127.0.0.1:4000/health
```

Beklenen:
- Health endpoint `status: ok`
- Login / quote / invoice ana akislari normal calisir

## 4) Otomatik DR Tatbikati

Backup/restore zincirini canli DB'ye dokunmadan otomatik test etmek icin:

```bash
cd backend
npm run dr:drill
```

Detayli prosedur:
- `docs/DISASTER_RECOVERY_DRILL.md`
