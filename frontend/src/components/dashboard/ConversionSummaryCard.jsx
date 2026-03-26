export default function ConversionSummaryCard({ loading, growth, formatCurrency }) {
  if (loading) {
    return null;
  }

  return (
    <div className="card-subtle rounded-2xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Donusum</h3>
          <p className="mt-1 text-sm text-slate-600">Son {growth.periodDays || 0} gun</p>
        </div>
        <p className="text-xs text-slate-500">Skor: {growth.health?.score ?? 0}</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Tekliften Faturaya</p>
          <p className="mt-1 text-xl font-bold text-slate-900">%{growth.funnel?.quoteToInvoiceRate ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Faturadan Tahsilata</p>
          <p className="mt-1 text-xl font-bold text-slate-900">%{growth.funnel?.invoiceToPaidRate ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Kesilen Tutar</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(growth.revenue?.issued || 0)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Tahsil Edilen</p>
          <p className="mt-1 text-xl font-bold text-emerald-700">{formatCurrency(growth.revenue?.collected || 0)}</p>
        </div>
      </div>
    </div>
  );
}
