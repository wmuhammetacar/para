import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { apiRequest } from '../api';
import { useAuth } from '../contexts/AuthContext';

const emptyActivation = {
  completedSteps: 0,
  totalSteps: 4,
  completionPercent: 0,
  isCompleted: false,
  nextStep: null,
  steps: []
};

function stepStatusClasses(completed) {
  if (completed) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export default function OnboardingPage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activation, setActivation] = useState(emptyActivation);

  async function fetchActivation() {
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest('/dashboard/activation', { token });
      setActivation({
        completedSteps: Number(response?.completedSteps) || 0,
        totalSteps: Number(response?.totalSteps) || 4,
        completionPercent: Number(response?.completionPercent) || 0,
        isCompleted: Boolean(response?.isCompleted),
        nextStep: response?.nextStep || null,
        steps: Array.isArray(response?.steps) ? response.steps : []
      });
    } catch (fetchError) {
      setError(fetchError.message);
      setActivation(emptyActivation);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchActivation();
  }, [token]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding Aktivasyon"
        description="Ilk 10 dakikalik kurulum adimlarini tamamlayin, platformayi tam verimle kullanin."
        actions={
          <button type="button" className="btn-secondary" onClick={fetchActivation} disabled={loading}>
            {loading ? 'Yenileniyor...' : 'Durumu Yenile'}
          </button>
        }
      />

      {error ? <div className="status-error">{error}</div> : null}

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Aktivasyon Ilerlemesi</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">%{activation.completionPercent}</p>
            <p className="mt-2 text-xs text-slate-500">
              Tamamlanan Adim: {activation.completedSteps} / {activation.totalSteps}
            </p>
          </div>
          {activation.nextStep ? (
            <Link to={activation.nextStep.ctaPath} className="btn-primary">
              Siradaki Adima Git
            </Link>
          ) : (
            <Link to="/dashboard" className="btn-primary">
              Panele Don
            </Link>
          )}
        </div>

        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700 transition-all duration-300"
            style={{ width: `${Math.max(0, Math.min(100, activation.completionPercent))}%` }}
          />
        </div>
      </div>

      {activation.isCompleted ? (
        <div className="status-success">
          Onboarding tamamlandi. Artik operasyon panellerini aktif sekilde kullanabilirsiniz.
        </div>
      ) : null}

      <div className="grid gap-4">
        {loading ? (
          <div className="card animate-pulse">
            <div className="h-4 w-52 rounded bg-slate-200" />
            <div className="mt-3 h-3 w-80 rounded bg-slate-100" />
          </div>
        ) : null}

        {!loading &&
          activation.steps.map((step) => (
            <div key={step.key} className="card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{step.label}</h3>
                  <p className="mt-1 text-sm text-slate-600">{step.description}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${stepStatusClasses(step.completed)}`}>
                  {step.completed ? 'Tamamlandi' : 'Bekliyor'}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  Ilerleme: {step.current} / {step.target}
                </p>
                <Link to={step.ctaPath} className="btn-secondary">
                  Sayfaya Git
                </Link>
              </div>
            </div>
          ))}

        {!loading && activation.steps.length === 0 ? (
          <div className="card">
            <p className="text-sm text-slate-600">Onboarding adimlari yuklenemedi.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
