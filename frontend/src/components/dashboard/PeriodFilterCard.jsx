export default function PeriodFilterCard({ period, periodOptions, periodLabel, periodRangeText, onPeriodChange }) {
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="chip bg-slate-100 text-slate-700">Donem</div>
        {periodOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onPeriodChange(option.value)}
            className={option.value === period ? 'btn-primary px-3 py-2 text-xs' : 'btn-secondary px-3 py-2 text-xs'}
          >
            {option.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">Secili donem: {periodLabel || 'Tum Zamanlar'}</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">Tarih araligi: {periodRangeText}</p>
    </div>
  );
}
