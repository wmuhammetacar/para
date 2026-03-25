import { formatCurrency } from '../api';

export default function ItemRows({ items, onChange, onAdd, onRemove }) {
  return (
    <div className="space-y-3">
      <div className="hidden grid-cols-[1.7fr_0.7fr_0.9fr_0.9fr_auto] gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
        <span>Hizmet Kalemi</span>
        <span>Miktar</span>
        <span>Birim Fiyat</span>
        <span>Tutar</span>
        <span>Islemler</span>
      </div>

      {items.map((item, index) => {
        const lineTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);

        return (
          <div
            key={index}
            className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2 md:grid-cols-[1.7fr_0.7fr_0.9fr_0.9fr_auto]"
          >
            <input
              type="text"
              placeholder="Hizmet kalemi adi"
              value={item.name}
              onChange={(event) => onChange(index, 'name', event.target.value)}
            />
            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Miktar"
              value={item.quantity}
              onChange={(event) => onChange(index, 'quantity', event.target.value)}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Birim fiyat"
              value={item.unitPrice}
              onChange={(event) => onChange(index, 'unitPrice', event.target.value)}
            />
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
              {formatCurrency(lineTotal)}
            </div>
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="btn-secondary"
              disabled={items.length === 1}
            >
              Sil
            </button>
          </div>
        );
      })}

      <button type="button" onClick={onAdd} className="btn-secondary">
        + Hizmet Kalemi Ekle
      </button>
    </div>
  );
}
