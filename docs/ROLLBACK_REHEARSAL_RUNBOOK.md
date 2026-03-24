# Rollback Rehearsal Runbook

Bu runbook staging'de rollback senaryosunu canliya zarar vermeden test etmek icin kullanilir.

## Amac

- Rollback komutunun gercekten calistigini release oncesi dogrulamak
- Operasyon ekibinin geri donus refleksini olcmek
- Kesinti aninda belirsizligi azaltmak

## Script

```bash
./scripts/rollback-rehearsal.sh --deploy-path /var/www/teklifim-staging
```

Bu komut default olarak **dry-run** yapar (degisiklik uygulamaz).

## Execute Modu

Gercek tatbikat (symlink once previous release'e, sonra tekrar orijinale doner):

```bash
./scripts/rollback-rehearsal.sh \
  --deploy-path /var/www/teklifim-staging \
  --execute \
  --reload-cmd "pm2 reload teklifim-backend"
```

## Beklenen Sonuc

- `Rollback switch successful` mesaji
- Ardindan `original target restored` mesaji
- `current` symlink tatbikat sonunda ilk haline donmus olur

## On Kosullar

- Deploy yapisi `releases/<surum>` + `current` symlink modelinde olmali
- `releases` altinda en az 2 release bulunmali
