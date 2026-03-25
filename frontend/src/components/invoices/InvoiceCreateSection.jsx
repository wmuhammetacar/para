import AgencyPresetBar from '../AgencyPresetBar';
import ItemRows from '../ItemRows';
import { ACTION_LABELS } from '../../constants/uiText';

export default function InvoiceCreateSection({
  editingId,
  loadingEdit,
  fromQuoteId,
  quotes,
  form,
  customers,
  total,
  savingFromQuote,
  savingManual,
  formCardRef,
  onFromQuoteChange,
  onCreateFromQuote,
  onFormChange,
  onApplyServicePreset,
  onApplyPaymentPlanPreset,
  onUpdateItem,
  onAddItem,
  onRemoveItem,
  onResetForm,
  onSubmit,
  formatCurrency
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card">
        <h3 className="panel-title">Tekliften Olustur</h3>
        <div className="mt-3 flex flex-col gap-2 md:flex-row">
          <select value={fromQuoteId} onChange={(event) => onFromQuoteChange(event.target.value)}>
            <option value="">Teklif secin</option>
            {quotes.map((quote) => (
              <option key={quote.id} value={quote.id}>
                {quote.quote_number} - {quote.customer_name}
              </option>
            ))}
          </select>
          <button type="button" className="btn-primary md:w-auto" onClick={onCreateFromQuote} disabled={savingFromQuote}>
            {savingFromQuote ? 'Olusturuluyor...' : 'Olustur'}
          </button>
        </div>
      </div>

      <div ref={formCardRef} className="card">
        <h3 className="panel-title">{editingId ? 'Faturayi Duzenle' : 'Manuel Fatura'}</h3>

        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
          {loadingEdit ? <p className="text-sm text-slate-500">Fatura bilgisi yukleniyor...</p> : null}

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">Musteri</label>
              <select
                value={form.customerId}
                onChange={(event) => onFormChange((prev) => ({ ...prev, customerId: event.target.value }))}
                required
              >
                <option value="">Musteri secin</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-slate-600">Tarih</label>
              <input
                type="date"
                value={form.date}
                onChange={(event) => onFormChange((prev) => ({ ...prev, date: event.target.value }))}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-slate-600">Vade</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) => onFormChange((prev) => ({ ...prev, dueDate: event.target.value }))}
                required
              />
            </div>
          </div>

          <AgencyPresetBar onApplyServicePreset={onApplyServicePreset} onApplyPaymentPlanPreset={onApplyPaymentPlanPreset} />

          <ItemRows items={form.items} onChange={onUpdateItem} onAdd={onAddItem} onRemove={onRemoveItem} />

          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-700">
              Toplam: <span className="font-semibold">{formatCurrency(total)}</span>
            </p>
            <div className="table-actions">
              {editingId ? (
                <button type="button" className="btn-secondary" onClick={onResetForm}>
                  {ACTION_LABELS.cancel}
                </button>
              ) : null}
              <button type="submit" className="btn-primary" disabled={savingManual}>
                {savingManual ? 'Kaydediliyor...' : editingId ? ACTION_LABELS.update : 'Faturayi Kaydet'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
