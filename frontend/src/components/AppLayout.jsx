import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { to: '/dashboard', label: 'Genel Bakis', hint: 'Performans ve ciro ozeti' },
  { to: '/onboarding', label: 'Onboarding', hint: 'Ilk 10 dakika aktivasyon' },
  { to: '/plans', label: 'Paketler', hint: 'Plan ve kullanim limitleri' },
  { to: '/customers', label: 'Musteriler', hint: 'Cari kayit yonetimi' },
  { to: '/quotes', label: 'Teklifler', hint: 'Teklif olusturma ve takip' },
  { to: '/invoices', label: 'Faturalar', hint: 'Fatura kayit yonetimi' }
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const currentDate = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="app-shell min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[1450px] flex-col lg:flex-row">
        <aside className="border-b border-slate-200 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 px-4 py-5 text-slate-100 lg:w-72 lg:border-b-0 lg:border-r lg:px-5">
          <div className="flex items-center justify-between lg:block">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Teklifim</h1>
              <p className="mt-1 text-xs text-slate-300">Teklif ve Fatura Yonetim Platformu</p>
            </div>
            <span className="chip bg-brand-100 text-brand-700 lg:mt-4">Surum 1.0</span>
          </div>

          <nav className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:mt-8 lg:grid-cols-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `nav-link rounded-xl px-3 py-2.5 ${
                    isActive
                      ? 'nav-link-active bg-brand-500 text-white shadow-md shadow-brand-900/30'
                      : 'nav-link-idle bg-slate-800/80 text-slate-100 hover:bg-slate-700'
                  }`
                }
              >
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="hidden text-xs text-slate-300/90 lg:block">{item.hint}</p>
              </NavLink>
            ))}
          </nav>

          <div className="mt-6 rounded-xl border border-slate-700/90 bg-slate-900/60 p-3 text-xs text-slate-300 lg:mt-10">
            <p className="font-semibold text-white">{user?.companyName || 'Teklifim'}</p>
            <p className="mt-1 break-all">{user?.email}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-brand-100">
              Paket: {(user?.planCode || 'starter').toUpperCase()}
            </p>
            <button
              type="button"
              onClick={logout}
              className="btn-secondary mt-3 w-full border-slate-600 bg-slate-700 text-slate-100 hover:bg-slate-600"
            >
              Oturumu Kapat
            </button>
          </div>
        </aside>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <header className="card mb-6 fade-in bg-white/85 backdrop-blur-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div>
                <p className="text-sm text-slate-500">Operasyon Merkezi</p>
                <p className="text-lg font-semibold text-slate-900">{user?.companyName || 'Teklifim'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip">Canli Panel</span>
                <div className="chip self-start sm:self-auto">{currentDate}</div>
              </div>
            </div>
          </header>

          <div className="fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
