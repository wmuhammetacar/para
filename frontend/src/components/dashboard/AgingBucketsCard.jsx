export default function AgingBucketsCard({ loading, stats, formatCurrency }) {
  if (loading) {
    return null;
  }

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-slate-900">Gecikme Yaslandirmasi</h3>
      <p className="mt-1 text-sm text-slate-600">Gecikmenin gun dagilimi</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-700">0-7 Gun</p>
          <p className="mt-1 text-lg font-bold text-amber-700">{formatCurrency(stats.overdueBuckets?.days0to7)}</p>
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
          <p className="text-xs font-semibold text-orange-700">8-30 Gun</p>
          <p className="mt-1 text-lg font-bold text-orange-700">{formatCurrency(stats.overdueBuckets?.days8to30)}</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-xs font-semibold text-rose-700">31+ Gun</p>
          <p className="mt-1 text-lg font-bold text-rose-700">{formatCurrency(stats.overdueBuckets?.days31plus)}</p>
        </div>
      </div>
    </div>
  );
}
