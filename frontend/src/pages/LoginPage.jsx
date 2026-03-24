import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { login, loading, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('demo@teklifim.com');
  const [password, setPassword] = useState('123456');
  const [error, setError] = useState('');

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    try {
      await login(email, password);
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(59,91,253,0.16),transparent_45%),radial-gradient(circle_at_82%_85%,rgba(15,23,42,0.18),transparent_40%)]" />

      <div className="relative grid w-full max-w-5xl gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="card hidden bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100 lg:block">
          <p className="chip bg-brand-100 text-brand-700">Teklifim SaaS Platformu</p>
          <h1 className="mt-4 text-3xl font-bold text-white">Teklif ve fatura surecini tek merkezden yonetin</h1>
          <p className="mt-3 text-sm text-slate-300">
            Kucuk ve orta olcekli isletmeler icin teklif, fatura ve PDF akislarini tek panelde hizlandirin.
          </p>

          <div className="mt-6 grid gap-3 text-sm text-slate-200">
            <div className="rounded-xl border border-slate-700/80 bg-slate-800/50 px-3 py-2">Musteri kayit yonetimi</div>
            <div className="rounded-xl border border-slate-700/80 bg-slate-800/50 px-3 py-2">
              Hizli teklif olusturma ve PDF cikti
            </div>
            <div className="rounded-xl border border-slate-700/80 bg-slate-800/50 px-3 py-2">
              Fatura olusturma ve tekliften donusturme
            </div>
            <div className="rounded-xl border border-slate-700/80 bg-slate-800/50 px-3 py-2">
              Anlik ciro ve operasyon ozeti
            </div>
          </div>
        </div>

        <div className="card w-full max-w-xl justify-self-center bg-white/95 backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-slate-900">Teklifim'e Hos Geldiniz</h1>
          <p className="mt-1 text-sm text-slate-600">Devam etmek icin oturum acin</p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">E-posta</label>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Sifre</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            {error ? <p className="status-error">{error}</p> : null}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Oturum aciliyor...' : 'Oturum Ac'}
            </button>
          </form>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            Demo hesap: <span className="font-medium">demo@teklifim.com / 123456</span>
          </div>
        </div>
      </div>
    </div>
  );
}
