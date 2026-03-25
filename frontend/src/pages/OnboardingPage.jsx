import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { apiRequest } from '../api';
import { useAuth } from '../contexts/AuthContext';

const emptyActivation = {
  completedSteps: 0,
  totalSteps: 4,
  remainingSteps: 4,
  completionPercent: 0,
  isCompleted: false,
  estimatedMinutesLeft: 0,
  momentumStatus: 'not_started',
  nextStep: null,
  quickWins: [],
  steps: []
};

function stepStatusClasses(completed) {
  if (completed) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  return 'border-amber-200 bg-amber-50 text-amber-700';
}

const momentumConfig = {
  completed: {
    label: 'Tamamlandi',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700'
  },
  on_track: {
    label: 'Yolda',
    className: 'border-sky-200 bg-sky-50 text-sky-700'
  },
  warming_up: {
    label: 'Hiz Kazaniyor',
    className: 'border-amber-200 bg-amber-50 text-amber-700'
  },
  not_started: {
    label: 'Baslamadi',
    className: 'border-slate-200 bg-slate-50 text-slate-700'
  }
};

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
        remainingSteps: Number(response?.remainingSteps) || 0,
        completionPercent: Number(response?.completionPercent) || 0,
        isCompleted: Boolean(response?.isCompleted),
        estimatedMinutesLeft: Number(response?.estimatedMinutesLeft) || 0,
        momentumStatus: response?.momentumStatus || 'not_started',
        nextStep: response?.nextStep || null,
        quickWins: Array.isArray(response?.quickWins) ? response.quickWins : [],
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

  const momentum = momentumConfig[activation.momentumStatus] || momentumConfig.not_started;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ajans Kurulum Akisi"
        description="Client, teklif ve fatura adimlarini hizla tamamlayin; operasyonu dogru kurup tahsilata hizli gecin."
        actions={
          <button type="button" className="btn-secondary" onClick={fetchActivation} disabled={loading}>
            {loading ? 'Yenileniyor...' : 'Durumu Yenile'}
          </button>
        }
      />

      {error ? <div className="status-error">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
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

        <div className="grid gap-4">
          <div className="card">
            <p className="text-xs text-slate-500">Kalan Adim</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{activation.remainingSteps}</p>
            <p className="mt-2 text-xs text-slate-500">Hedef: bugun tum operasyon adimlarini tamamlamak</p>
          </div>
          <div className="card">
            <p className="text-xs text-slate-500">Tahmini Sure</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{activation.estimatedMinutesLeft} dk</p>
            <p className="mt-2 text-xs text-slate-500">Kalan kurulum eforu</p>
          </div>
          <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${momentum.className}`}>
            Momentum: {momentum.label}
          </div>
        </div>
      </div>

      {activation.isCompleted ? (
        <div className="status-success">
          Kurulum tamamlandi. Artik tekliften tahsilata tum operasyon panellerini aktif sekilde kullanabilirsiniz.
        </div>
      ) : null}

      {!loading && activation.quickWins.length > 0 ? (
        <div className="card">
          <h3 className="text-lg font-semibold text-slate-900">Hizli Etki Alanlari</h3>
          <p className="mt-1 text-sm text-slate-600">Ajans akisinda ilk geri donusu verecek adimlari once tamamlayin.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {activation.quickWins.map((quickWin) => (
              <div key={quickWin.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">{quickWin.label}</p>
                <p className="mt-1 text-xs text-slate-500">Tahmini: {quickWin.estimatedMinutes} dk</p>
                <Link to={quickWin.ctaPath} className="btn-secondary mt-3 inline-flex">
                  Aksiyona Gec
                </Link>
              </div>
            ))}
          </div>
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

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    step.completed ? 'bg-emerald-500' : 'bg-brand-600'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, Number(step.progressPercent) || 0))}%` }}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  Ilerleme: {step.current} / {step.target} | Kalan: {Number(step.remaining) || 0} | Tahmini:{' '}
                  {Number(step.estimatedMinutes) || 0} dk
                </p>
                <Link to={step.ctaPath} className="btn-secondary">
                  {step.actionLabel || 'Sayfaya Git'}
                </Link>
              </div>
            </div>
          ))}

        {!loading && activation.steps.length === 0 ? (
          <div className="card">
            <p className="text-sm text-slate-600">Kurulum adimlari yuklenemedi.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
