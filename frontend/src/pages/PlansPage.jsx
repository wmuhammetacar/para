import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { apiRequest, formatDate } from '../api';
import { useAuth } from '../contexts/AuthContext';

const usageLabels = {
  customers: 'Musteri Limiti',
  quotesPerMonth: 'Aylik Teklif Limiti',
  invoicesPerMonth: 'Aylik Fatura Limiti',
  remindersPerMonth: 'Aylik Hatirlatma Limiti'
};

const emptyPlanState = {
  currentPlan: null,
  monthRange: null,
  usage: {},
  availablePlans: []
};

function formatPlanPrice(value) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function resolveUsageRows(usage) {
  return Object.entries(usageLabels).map(([key, label]) => {
    const metric = usage?.[key] || {};
    return {
      key,
      label,
      used: Number(metric.used) || 0,
      limit: Number.isFinite(metric.limit) ? Number(metric.limit) : null,
      remaining: Number.isFinite(metric.remaining) ? Number(metric.remaining) : null,
      utilizationPercent: Number(metric.utilizationPercent) || 0,
      reached: Boolean(metric.reached)
    };
  });
}

export default function PlansPage() {
  const { token, user, updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingPlanCode, setSavingPlanCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [planState, setPlanState] = useState(emptyPlanState);

  async function fetchPlanSnapshot() {
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest('/dashboard/plan', { token });
      setPlanState({
        currentPlan: response?.currentPlan || null,
        monthRange: response?.monthRange || null,
        usage: response?.usage || {},
        availablePlans: Array.isArray(response?.availablePlans) ? response.availablePlans : []
      });
    } catch (fetchError) {
      setError(fetchError.message);
      setPlanState(emptyPlanState);
    } finally {
      setLoading(false);
    }
  }

  async function handlePlanChange(planCode) {
    try {
      setSavingPlanCode(planCode);
      setError('');
      setSuccess('');
      const response = await apiRequest('/dashboard/plan', {
        method: 'PATCH',
        token,
        body: { planCode }
      });

      setPlanState({
        currentPlan: response?.currentPlan || null,
        monthRange: response?.monthRange || null,
        usage: response?.usage || {},
        availablePlans: Array.isArray(response?.availablePlans) ? response.availablePlans : []
      });

      updateUser({
        ...(user || {}),
        planCode: response?.currentPlan?.code || planCode
      });

      setSuccess(`Paketiniz "${response?.currentPlan?.name || planCode}" olarak guncellendi.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingPlanCode('');
    }
  }

  useEffect(() => {
    fetchPlanSnapshot();
  }, [token]);

  const usageRows = useMemo(() => resolveUsageRows(planState.usage), [planState.usage]);
  const periodText = planState.monthRange
    ? `${formatDate(planState.monthRange.from)} - ${formatDate(planState.monthRange.to)}`
    : '-';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paketler ve Kullanim"
        description="Paketinizi yonetin, limit kullanimini takip edin ve buyume asamasina gore gecis yapin."
        actions={
          <button type="button" className="btn-secondary" onClick={fetchPlanSnapshot} disabled={loading}>
            {loading ? 'Yenileniyor...' : 'Durumu Yenile'}
          </button>
        }
      />

      {error ? <div className="status-error">{error}</div> : null}
      {success ? <div className="status-success">{success}</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {(planState.availablePlans || []).map((plan) => {
          const isCurrent = planState.currentPlan?.code === plan.code;
          const isSaving = savingPlanCode === plan.code;

          return (
            <div
              key={plan.code}
              className={`rounded-2xl border p-5 ${
                isCurrent
                  ? 'border-brand-300 bg-gradient-to-b from-brand-50 to-white'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                {isCurrent ? <span className="chip bg-emerald-100 text-emerald-700">Aktif Paket</span> : null}
              </div>

              <p className="mt-2 text-sm text-slate-600">{plan.description}</p>
              <p className="mt-3 text-2xl font-bold text-slate-900">
                {formatPlanPrice(plan.monthlyPriceTry)} <span className="text-sm font-medium text-slate-500">/ ay</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">Yillik: {formatPlanPrice(plan.yearlyPriceTry)}</p>

              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p>Musteri limiti: {plan.limits?.customers}</p>
                <p>Aylik teklif limiti: {plan.limits?.quotesPerMonth}</p>
                <p>Aylik fatura limiti: {plan.limits?.invoicesPerMonth}</p>
                <p>Aylik hatirlatma limiti: {plan.limits?.remindersPerMonth}</p>
              </div>

              <button
                type="button"
                className={isCurrent ? 'btn-secondary mt-4 w-full' : 'btn-primary mt-4 w-full'}
                disabled={isCurrent || isSaving || Boolean(savingPlanCode)}
                onClick={() => handlePlanChange(plan.code)}
              >
                {isCurrent ? 'Mevcut Paket' : isSaving ? 'Gecis Yapiliyor...' : 'Bu Pakete Gec'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold text-slate-900">Kullanim Ozeti</h3>
        <p className="mt-1 text-sm text-slate-600">Fatura donemi: {periodText}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {usageRows.map((row) => (
            <div key={row.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">{row.label}</p>
                <p className={`text-xs font-semibold ${row.reached ? 'text-rose-700' : 'text-slate-500'}`}>
                  {row.reached ? 'Limit Doldu' : 'Aktif'}
                </p>
              </div>

              <p className="mt-2 text-sm text-slate-600">
                {row.used} / {row.limit ?? '-'}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    row.reached ? 'bg-rose-500' : 'bg-brand-600'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, row.utilizationPercent))}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Kalan: {row.remaining ?? '-'} | Kullanim: %{row.utilizationPercent}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
