import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const primaryNavItems = [
  { to: '/dashboard', label: 'Panel', hint: 'Bugun takip edilmesi gerekenler' },
  { to: '/customers', label: 'Musteriler', hint: 'Musteri kayitlarini yonetin' },
  { to: '/quotes', label: 'Teklifler', hint: 'Teklif olusturun ve takip edin' },
  { to: '/invoices', label: 'Faturalar', hint: 'Tahsilat durumunu izleyin' }
];

const secondaryNavItems = [
  { to: '/onboarding', label: 'Kurulum', hint: 'Ilk adimlari tamamlayin' },
  { to: '/plans', label: 'Paket', hint: 'Paket ve kullanim limiti' }
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
        <aside className="border-b border-slate-200 bg-slate-950 px-4 py-5 text-slate-100 lg:w-72 lg:border-b-0 lg:border-r lg:px-5">
          <div className="flex items-center justify-between lg:block">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Teklifim</h1>
              <p className="mt-1 text-xs text-slate-300">Ajans is akisi</p>
            </div>
          </div>

          <nav className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:mt-8 lg:grid-cols-1">
            {primaryNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `nav-link rounded-xl px-3 py-2.5 ${
                    isActive
                      ? 'nav-link-active bg-brand-500 text-white shadow-md shadow-brand-900/30'
                      : 'nav-link-idle bg-slate-900 text-slate-100 hover:bg-slate-800'
                  }`
                }
              >
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="hidden text-xs text-slate-300/90 lg:block">{item.hint}</p>
              </NavLink>
            ))}
          </nav>

          <div className="mt-4 border-t border-slate-700/80 pt-4">
            <p className="px-1 text-[11px] uppercase tracking-wide text-slate-400">Yonetim</p>
            <nav className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-1">
              {secondaryNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `nav-link rounded-xl px-3 py-2.5 ${
                      isActive
                        ? 'nav-link-active bg-brand-500 text-white shadow-md shadow-brand-900/30'
                        : 'nav-link-idle bg-slate-900 text-slate-100 hover:bg-slate-800'
                    }`
                  }
                >
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="hidden text-xs text-slate-300/90 lg:block">{item.hint}</p>
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="mt-6 rounded-xl border border-slate-700/90 bg-slate-900 p-3 text-xs text-slate-300 lg:mt-10">
            <p className="font-semibold text-white">{user?.companyName || 'Teklifim'}</p>
            <p className="mt-1 break-all">{user?.email}</p>
            <button
              type="button"
              onClick={logout}
              className="btn-secondary mt-3 w-full border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700"
            >
              Oturumu Kapat
            </button>
          </div>
        </aside>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <header className="card-subtle mb-6 fade-in rounded-2xl border px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div>
                <p className="text-sm text-slate-500">Bugun</p>
                <p className="text-lg font-semibold text-slate-900">{user?.companyName || 'Teklifim'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip">Paket: {(user?.planCode || 'starter').toUpperCase()}</span>
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
