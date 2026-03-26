export default function AgingBucketsCard({ loading, stats, formatCurrency }) {
  if (loading) {
    return null;
  }

  return (
    <div className="card-subtle rounded-2xl border p-5">
      <h3 className="text-lg font-semibold text-slate-900">Gecikme dagilimi</h3>
      <p className="mt-1 text-sm text-slate-600">Vadesi gecen tutarlar</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-600">0-7 gun</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(stats.overdueBuckets?.days0to7)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-600">8-30 gun</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(stats.overdueBuckets?.days8to30)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-600">31+ gun</p>
          <p className="mt-1 text-lg font-bold text-rose-700">{formatCurrency(stats.overdueBuckets?.days31plus)}</p>
        </div>
      </div>
    </div>
  );
}
