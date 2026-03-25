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
      <div className="stat-card border-l-4 border-l-amber-500">
        <p className="text-sm text-slate-500">Acik Tahsilat</p>
        <p className="mt-2 text-3xl font-bold text-amber-700">{formatCurrency(stats.pendingReceivable)}</p>
        <p className="mt-3 text-xs text-slate-500">Takipteki toplam alacak</p>
      </div>

      <div className="stat-card border-l-4 border-l-rose-500">
        <p className="text-sm text-slate-500">Geciken Tahsilat</p>
        <p className="mt-2 text-3xl font-bold text-rose-700">{formatCurrency(stats.overdueReceivable)}</p>
        <p className="mt-3 text-xs text-slate-500">Vadesi gecmis alacak</p>
      </div>

      <div className="stat-card border-l-4 border-l-sky-500">
        <p className="text-sm text-slate-500">Takipteki Fatura</p>
        <p className="mt-2 text-3xl font-bold text-sky-700">{stats.pendingInvoiceCount}</p>
        <p className="mt-3 text-xs text-slate-500">Odeme bekleyen fatura adedi</p>
      </div>

      <div className="card bg-gradient-to-br from-brand-600 via-brand-600 to-brand-700 text-white">
        <p className="text-sm text-brand-100">Toplam Musteri</p>
        <p className="mt-2 text-3xl font-bold">{stats.totalCustomers}</p>
        <p className="mt-3 text-xs text-brand-100">Guncelleme: {updatedAt}</p>
      </div>
    </div>
  );
}
