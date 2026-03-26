import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { apiRequest, formatCurrency, formatDate } from '../api';
import { useAuth } from '../contexts/AuthContext';

const periodOptions = [
  { value: 14, label: '14 Gun' },
  { value: 30, label: '30 Gun' },
  { value: 60, label: '60 Gun' }
];

const emptyReadiness = {
  periodDays: 30,
  dateFrom: null,
  dateTo: null,
  generatedAt: null,
  score: 0,
  status: {
    code: 'watch',
    label: 'Izlemeye Acik'
  },
  summary: {
    passedChecks: 0,
    totalChecks: 0
  },
  financialRisk: {
    pendingTotal: 0,
    overdueTotal: 0,
    overdueRatio: 0
  },
  checks: [],
  nextActions: []
};

function resolveCheckClass(check) {
  if (check.passed) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (check.severity === 'high') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export default function PilotReadinessPage() {
  const { token } = useAuth();
  const [periodDays, setPeriodDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [readiness, setReadiness] = useState(emptyReadiness);

  async function fetchReadiness() {
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest(`/dashboard/pilot-readiness?period=${periodDays}`, { token });
      setReadiness(response || emptyReadiness);
    } catch (fetchError) {
      setError(fetchError.message);
      setReadiness(emptyReadiness);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchReadiness();
  }, [token, periodDays]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hazirlik Kontrolu"
        description="Kritik kontrolleri ve risk seviyesini takip edin."
        actions={
          <button type="button" className="btn-secondary" onClick={fetchReadiness} disabled={loading}>
            {loading ? 'Yenileniyor...' : 'Durumu Yenile'}
          </button>
        }
      />

      <div className="card-subtle rounded-2xl border px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="chip">Donem</div>
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
          <p className="ml-auto text-xs text-slate-500">
            Aralik: {readiness.dateFrom ? formatDate(readiness.dateFrom) : '-'} -{' '}
            {readiness.dateTo ? formatDate(readiness.dateTo) : '-'}
          </p>
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
            <p className="text-sm text-slate-500">Hazirlik Skoru</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{readiness.score}</p>
            <p className="mt-2 text-xs text-slate-500">{readiness.status.label}</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-slate-500">Gecilen Kontrol</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {readiness.summary.passedChecks}/{readiness.summary.totalChecks}
            </p>
            <p className="mt-2 text-xs text-slate-500">Toplam kalite maddesi</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-slate-500">Acik Alacak</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {formatCurrency(readiness.financialRisk.pendingTotal)}
            </p>
            <p className="mt-2 text-xs text-slate-500">Acil takip gerektiren acik alacak</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-slate-500">Gecikme Orani</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">%{readiness.financialRisk.overdueRatio}</p>
            <p className="mt-2 text-xs text-slate-500">Vadesi gecmis / acik alacak</p>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card">
            <h3 className="text-lg font-semibold text-slate-900">Kontrol Listesi</h3>
            <div className="mt-4 space-y-3">
              {(readiness.checks || []).map((check) => (
                <div key={check.key} className={`rounded-xl border p-3 ${resolveCheckClass(check)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{check.label}</p>
                    <span className="text-xs">{check.passed ? 'Gecti' : 'Adim gerekli'}</span>
                  </div>
                  <p className="mt-1 text-xs">
                    Deger: {check.value} | Hedef: {check.target}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-slate-900">Oncelikli adimlar</h3>
            <p className="mt-1 text-sm text-slate-600">Skoru artirmak icin adimlar</p>
            <div className="mt-4 space-y-3">
              {(readiness.nextActions || []).map((action) => (
                <div key={action.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">{action.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{action.reason}</p>
                  <Link to={action.ctaPath} className="btn-secondary mt-3 inline-flex">
                    Adima Git
                  </Link>
                </div>
              ))}
              {!readiness.nextActions?.length ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                  Tum kritik maddeler gecti.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
