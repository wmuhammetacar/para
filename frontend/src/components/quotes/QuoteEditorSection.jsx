import AgencyPresetBar from '../AgencyPresetBar';
import ItemRows from '../ItemRows';
import { ACTION_LABELS } from '../../constants/uiText';

export default function QuoteEditorSection({
  formCardRef,
  editingId,
  loadingEdit,
  form,
  customers,
  total,
  totalQuotes,
  pageTotal,
  saving,
  onFormChange,
  onSubmit,
  onResetForm,
  onApplyServicePreset,
  onApplyPaymentPlanPreset,
  onUpdateItem,
  onAddItem,
  onRemoveItem,
  formatCurrency
}) {
  return (
    <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
      <div ref={formCardRef} className="card">
        <h3 className="panel-title">{editingId ? 'Teklifi duzenle' : 'Yeni teklif'}</h3>
        <p className="panel-description">Musteri ve kalemleri girin.</p>
        {loadingEdit ? <p className="mt-2 text-sm text-slate-500">Teklif yukleniyor...</p> : null}

        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-3 md:grid-cols-2">
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
          </div>

          <AgencyPresetBar
            onApplyServicePreset={onApplyServicePreset}
            onApplyPaymentPlanPreset={onApplyPaymentPlanPreset}
          />

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
              <button type="submit" className="btn-primary" disabled={saving || customers.length === 0}>
                {saving ? 'Kaydediliyor...' : editingId ? 'Guncelle' : 'Teklifi Kaydet'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <div className="card-subtle rounded-2xl border p-5">
        <p className="text-sm text-slate-500">Toplam teklif</p>
        <p className="mt-2 text-3xl font-bold text-slate-900">{totalQuotes}</p>
        <p className="mt-3 text-sm text-slate-600">Bu sayfadaki toplam</p>
        <p className="mt-1 text-lg font-semibold text-brand-700">{formatCurrency(pageTotal)}</p>
        {customers.length === 0 ? (
          <p className="mt-4 text-xs text-amber-700">
            Teklif olusturmak icin once musteri ekleyin.
          </p>
        ) : null}
      </div>
    </div>
  );
}
