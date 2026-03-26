export default function PrimaryStatsGrid({ loading, stats, updatedAt, formatCurrency }) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array.from({ length: 4 })].map((_, index) => (
          <div key={index} className="card animate-pulse">
            <div className="h-3 w-24 rounded bg-slate-200" />
            <div className="mt-4 h-8 w-20 rounded bg-slate-200" />
            <div className="mt-3 h-3 w-28 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="stat-card">
        <p className="text-sm text-slate-500">Acik tahsilat</p>
        <p className="mt-2 text-3xl font-bold text-slate-900">{formatCurrency(stats.pendingReceivable)}</p>
        <p className="mt-3 text-xs text-slate-500">Tahsilat bekleyen toplam tutar</p>
      </div>

      <div className="stat-card">
        <p className="text-sm text-slate-500">Geciken tahsilat</p>
        <p className="mt-2 text-3xl font-bold text-rose-700">{formatCurrency(stats.overdueReceivable)}</p>
        <p className="mt-3 text-xs text-slate-500">Vadesi gecen tutar</p>
      </div>

      <div className="stat-card">
        <p className="text-sm text-slate-500">Takipteki fatura</p>
        <p className="mt-2 text-3xl font-bold text-slate-900">{stats.pendingInvoiceCount}</p>
        <p className="mt-3 text-xs text-slate-500">Odeme bekleyen adet</p>
      </div>

      <div className="stat-card">
        <p className="text-sm text-slate-500">Toplam musteri</p>
        <p className="mt-2 text-3xl font-bold text-slate-900">{stats.totalCustomers}</p>
        <p className="mt-3 text-xs text-slate-500">Guncelleme: {updatedAt}</p>
      </div>
    </div>
  );
}
