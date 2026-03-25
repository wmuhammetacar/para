export default function RecentActivitiesCard({
  loading,
  activities,
  formatDateTime,
  activityEventLabel,
  activityResourceLabel,
  activityDetail
}) {
  if (loading) {
    return null;
  }

  return (
    <div className="card overflow-x-auto">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-900">Son Hareketler</h3>
        <p className="text-xs text-slate-500">Son 8 kayit</p>
      </div>

      <table className="mt-4 min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-2 pr-4">Zaman</th>
            <th className="py-2 pr-4">Islem</th>
            <th className="py-2 pr-4">Kaynak</th>
            <th className="py-2 pr-4">Detay</th>
          </tr>
        </thead>
        <tbody>
          {activities.map((activity) => (
            <tr key={activity.id} className="border-b border-slate-100">
              <td className="table-cell-muted py-3 pr-4">{formatDateTime(activity.createdAt)}</td>
              <td className="py-3 pr-4 font-medium text-slate-800">{activityEventLabel(activity.eventType)}</td>
              <td className="table-cell-muted py-3 pr-4">{activityResourceLabel(activity)}</td>
              <td className="table-cell-muted py-3 pr-4">{activityDetail(activity)}</td>
            </tr>
          ))}
          {!activities.length ? (
            <tr>
              <td className="py-8 text-center text-slate-500" colSpan={4}>
                Bu donem icin kayit bulunamadi.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
