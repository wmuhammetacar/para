# Engineering Standards

Bu dokuman, repo icin hafif ama net teknik sinirlari tanimlar.

## Backend Boundaries

1. `routes/*`:
- Request normalize et.
- Workflow/service cagir.
- HTTP response don.
- Route icinde cok adimli is akisi tutma.

2. `services/*`:
- Cok adimli workflow orkestrasyonu burada olur.
- Transaction sinirlari burada acik kalir.
- Audit log olaylari workflow seviyesinde tetiklenir.

3. `utils/*Repository.js`:
- SQL erisimi, query builder, mapleme burada.
- Reusable DB access desenlerini route/service disina tasir.

4. `utils/*Validation.js`:
- Input normalizasyonu ve explicit validation burada.
- Ortak listeleme kurallari icin `utils/listValidation.js` kullanilir.

## Frontend Boundaries

1. `pages/*`:
- Sayfa seviyesinde orkestrasyon ve state.
- Gereksiz tekrar olursa shared hook/util'e tasinir.

2. `components/*`:
- Sunum odakli parcalar.
- Is akisi kararlarini minimumda tut.

3. `hooks/*`:
- Tekrar eden yan etkiler ve UI state yardimcilari.
- Ornek: debounced input, timed success message.

4. `utils/*`:
- Pure helper fonksiyonlar.
- Ornek: paginated response normalize.

## Naming

- Route dosyalari: alan adi (`quotes.js`, `invoices.js`)
- Service dosyalari: `*WorkflowService.js` veya alan bazli `*Service.js`
- Repository dosyalari: `*Repository.js`
- Validation dosyalari: `*Validation.js`

## Quality Gate

- Backend: `npm run lint`, `npm run check:syntax`, `npm run test:coverage`
- Frontend: `npm run lint`, `npm run test:run`, `npm run build`
- Full gate: `./scripts/quality-gate.sh`
