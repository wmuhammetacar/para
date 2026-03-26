import { EMPTY_STATE_LABELS } from '../../constants/uiText';

export default function ReminderOpsSection({
  loadingReminderOps,
  reminderOps,
  reminderSummary,
  reminderPolicy,
  reminderStatusFilters,
  reminderOpsStatusFilter,
  reminderErrorBreakdown,
  reminderJobs,
  retryingReminderId,
  onReminderOpsStatusFilterChange,
  onRetryReminderJob,
  formatDateTime,
  reminderChannelLabel,
  reminderStatusClasses,
  reminderJobStatusLabel
}) {
  return (
    <div className="card-subtle rounded-2xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="panel-title">Hatirlatma kayitlari</h3>
          <p className="text-xs text-slate-500">Gonderim gecmisini kontrol edin.</p>
        </div>
        <span className="chip">Kayit: {reminderOps.filteredCount}</span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-2.5">
          <p className="text-[11px] text-slate-500">Kuyrukta</p>
          <p className="text-sm font-semibold text-slate-800">{reminderSummary.queued}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-2.5">
          <p className="text-[11px] text-slate-500">Hata</p>
          <p className="text-sm font-semibold text-slate-800">{reminderSummary.failed}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-2.5">
          <p className="text-[11px] text-slate-500">24s hata</p>
          <p className="text-sm font-semibold text-slate-800">{reminderSummary.failedLast24h}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-2.5">
          <p className="text-[11px] text-slate-500">Hata orani</p>
          <p className="text-sm font-semibold text-slate-800">%{reminderSummary.failedRate}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-600">Durum:</span>
        {reminderStatusFilters.map((option) => (
          <button
            key={option.key}
            type="button"
            className={
              reminderOpsStatusFilter === option.key ? 'btn-primary px-3 py-2 text-xs' : 'btn-secondary px-3 py-2 text-xs'
            }
            onClick={() => onReminderOpsStatusFilterChange(option.key)}
          >
            {option.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">Maks deneme: {reminderPolicy.maxRetryCount}</span>
      </div>

      {reminderErrorBreakdown.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {reminderErrorBreakdown.map((errorRow) => (
            <span key={`${errorRow.message}:${errorRow.total}`} className="chip">
              {errorRow.message} ({errorRow.total})
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2 pr-4">Zaman</th>
              <th className="py-2 pr-4">Fatura</th>
              <th className="py-2 pr-4">Kanal</th>
              <th className="py-2 pr-4">Durum</th>
              <th className="py-2 pr-4">Deneme</th>
              <th className="py-2 pr-4">Sonraki Deneme</th>
              <th className="py-2 pr-4">Hata</th>
              <th className="py-2">Islem</th>
            </tr>
          </thead>
          <tbody>
            {loadingReminderOps ? (
              <tr>
                <td className="py-6 text-center text-slate-500" colSpan={8}>
                  Hatirlatma kayitlari yukleniyor...
                </td>
              </tr>
            ) : null}
            {!loadingReminderOps &&
              reminderJobs.map((job) => (
                <tr key={job.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4 text-slate-600">{formatDateTime(job.processed_at || job.created_at)}</td>
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-slate-800">{job.invoice_number}</p>
                    <p className="text-xs text-slate-500">{job.customer_name || '-'}</p>
                  </td>
                  <td className="table-cell-muted py-3 pr-4">{reminderChannelLabel(job.channel)}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${reminderStatusClasses(job.status)}`}>
                      {reminderJobStatusLabel(job)}
                    </span>
                  </td>
                  <td className="table-cell-muted py-3 pr-4">
                    {Number(job.retry_count) || 0} / {reminderPolicy.maxRetryCount}
                  </td>
                  <td className="table-cell-muted py-3 pr-4">{formatDateTime(job.next_attempt_at)}</td>
                  <td className="table-cell-muted py-3 pr-4">{job.error_message || '-'}</td>
                  <td className="py-3">
                    {job.status === 'failed' ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => onRetryReminderJob(job.id)}
                        disabled={
                          retryingReminderId === job.id ||
                          (Number(job.retry_count) || 0) >= reminderPolicy.maxRetryCount
                        }
                      >
                        {(Number(job.retry_count) || 0) >= reminderPolicy.maxRetryCount
                          ? 'Limit Doldu'
                          : retryingReminderId === job.id
                            ? 'Deneniyor...'
                            : 'Yeniden Dene'}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            {!loadingReminderOps && reminderJobs.length === 0 ? (
              <tr>
                <td className="py-6 text-center text-slate-500" colSpan={8}>
                  {EMPTY_STATE_LABELS.noReminderRecords}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
