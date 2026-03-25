import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { apiRequest, formatCurrency, formatDate } from '../api';
import { useAuth } from '../contexts/AuthContext';

const periodOptions = [
  { value: 30, label: '30 Gun' },
  { value: 90, label: '90 Gun' },
  { value: 180, label: '180 Gun' }
];

const cohortOptions = [
  { value: 3, label: '3 Ay Kohort' },
  { value: 6, label: '6 Ay Kohort' },
  { value: 9, label: '9 Ay Kohort' },
  { value: 12, label: '12 Ay Kohort' }
];

const emptyGrowth = {
  periodDays: 90,
  cohortMonths: 6,
  dateFrom: null,
  dateTo: null,
  funnel: {
    customers: 0,
    quotes: 0,
    invoices: 0,
    paidInvoices: 0,
    quoteToInvoiceRate: 0,
    invoiceToPaidRate: 0
  },
  revenue: {
    issued: 0,
    collected: 0,
    openReceivable: 0,
    overdueReceivable: 0
  },
  comparison: {
    previousPeriod: {
      dateFrom: null,
      dateTo: null,
      issued: 0,
      collected: 0
    },
    issuedGrowthRate: 0,
    collectedGrowthRate: 0
  },
  velocity: {
    quoteToInvoiceAvgDays: 0,
    invoiceToPaidAvgDays: 0
  },
  health: {
    score: 0,
    status: 'watch',
    insight: '-'
  },
  retention: []
};

export default function GrowthPage() {
  const { token } = useAuth();
  const [periodDays, setPeriodDays] = useState(90);
  const [cohortMonths, setCohortMonths] = useState(6);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [growth, setGrowth] = useState(emptyGrowth);

  async function fetchGrowth() {
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest(`/dashboard/growth?period=${periodDays}&cohortMonths=${cohortMonths}`, {
        token
      });
      setGrowth(response || emptyGrowth);
    } catch (fetchError) {
      setError(fetchError.message);
      setGrowth(emptyGrowth);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchGrowth();
  }, [token, periodDays, cohortMonths]);

  const periodText = useMemo(() => {
    if (!growth.dateFrom || !growth.dateTo) {
      return '-';
    }

    return `${formatDate(growth.dateFrom)} - ${formatDate(growth.dateTo)}`;
  }, [growth.dateFrom, growth.dateTo]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gelisim Analizi"
        description="Donusum, kohort ve gelir trendlerini izleyin."
        actions={
          <button type="button" className="btn-secondary" onClick={fetchGrowth} disabled={loading}>
            {loading ? 'Yenileniyor...' : 'Durumu Yenile'}
          </button>
        }
      />

      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="chip bg-slate-100 text-slate-700">Filtreler</div>

          <select
            value={periodDays}
            onChange={(event) => setPeriodDays(Number(event.target.value))}
            className="max-w-[180px]"
          >
            {periodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={cohortMonths}
            onChange={(event) => setCohortMonths(Number(event.target.value))}
            className="max-w-[200px]"
          >
            {cohortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <p className="ml-auto text-xs text-slate-500">Donem: {periodText}</p>
        </div>
      </div>

      {error ? <div className="status-error">{error}</div> : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array.from({ length: 4 })].map((_, index) => (
            <div key={index} className="card animate-pulse">
              <div className="h-4 w-24 rounded bg-slate-200" />
              <div className="mt-3 h-7 w-20 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : null}

      {!loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="stat-card">
            <p className="text-sm text-slate-500">Teklif - Fatura Donusumu</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">%{growth.funnel.quoteToInvoiceRate}</p>
            <p className="mt-2 text-xs text-slate-500">
              {growth.funnel.quotes} tekliften {growth.funnel.invoices} fatura
            </p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-slate-500">Fatura - Tahsilat Donusumu</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">%{growth.funnel.invoiceToPaidRate}</p>
            <p className="mt-2 text-xs text-slate-500">
              {growth.funnel.invoices} faturadan {growth.funnel.paidInvoices} tahsilat
            </p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-slate-500">Kesilen Gelir</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{formatCurrency(growth.revenue.issued)}</p>
            <p className="mt-2 text-xs text-slate-500">%{growth.comparison.issuedGrowthRate} onceki doneme gore</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-slate-500">Tahsil Edilen Gelir</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{formatCurrency(growth.revenue.collected)}</p>
            <p className="mt-2 text-xs text-slate-500">%{growth.comparison.collectedGrowthRate} onceki doneme gore</p>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card">
            <h3 className="text-lg font-semibold text-slate-900">Donusum Hizi</h3>
            <p className="mt-1 text-sm text-slate-600">Satis dongusunun ortalama hizlari</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Tekliften Faturaya</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{growth.velocity.quoteToInvoiceAvgDays} gun</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Faturadan Tahsilata</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{growth.velocity.invoiceToPaidAvgDays} gun</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-slate-900">Is Akisi Sagligi</h3>
            <p className="mt-1 text-sm text-slate-600">{growth.health.insight}</p>
            <p className="mt-4 text-4xl font-bold text-slate-900">{growth.health.score}</p>
            <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">{growth.health.status}</p>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="card overflow-x-auto">
          <h3 className="text-lg font-semibold text-slate-900">Kohort Tutulma Orani</h3>
          <p className="mt-1 text-sm text-slate-600">Musteri kohortlarinin aylik devam oranlari</p>

          <table className="mt-4 min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4">Kohort</th>
                <th className="py-2 pr-4">Boyut</th>
                <th className="py-2 pr-4">M0</th>
                <th className="py-2 pr-4">M1</th>
                <th className="py-2 pr-4">M2+</th>
                <th className="py-2 pr-4">Toplam Gelir</th>
              </tr>
            </thead>
            <tbody>
              {(growth.retention || []).map((cohort) => {
                const m0 = cohort.points?.find((point) => point.monthOffset === 0)?.retentionRate ?? 0;
                const m1 = cohort.points?.find((point) => point.monthOffset === 1)?.retentionRate ?? 0;
                const laterPoints = (cohort.points || []).filter((point) => point.monthOffset >= 2);
                const avgLater =
                  laterPoints.length > 0
                    ? Number(
                        (
                          laterPoints.reduce((sum, point) => sum + (Number(point.retentionRate) || 0), 0) /
                          laterPoints.length
                        ).toFixed(1)
                      )
                    : 0;

                return (
                  <tr key={cohort.cohortMonth} className="border-b border-slate-100">
                    <td className="py-3 pr-4 font-medium text-slate-800">{cohort.cohortLabel}</td>
                    <td className="table-cell-muted py-3 pr-4">{cohort.cohortSize}</td>
                    <td className="table-cell-muted py-3 pr-4">%{m0}</td>
                    <td className="table-cell-muted py-3 pr-4">%{m1}</td>
                    <td className="table-cell-muted py-3 pr-4">%{avgLater}</td>
                    <td className="table-cell-muted py-3 pr-4">{formatCurrency(cohort.totalRevenue || 0)}</td>
                  </tr>
                );
              })}
              {!growth.retention?.length ? (
                <tr>
                  <td className="py-8 text-center text-slate-500" colSpan={6}>
                    Kohort verisi bulunamadi.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
