import { useEffect, useState } from 'react';
import { apiRequest, formatCurrency, formatDate } from '../api';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';

const statsConfig = [
  { key: 'totalCustomers', label: 'Toplam Musteri', note: 'Kayitli musteri sayisi' },
  { key: 'totalQuotes', label: 'Aktif Teklif', note: 'Onay bekleyen veya acik teklifler' },
  { key: 'pendingInvoiceCount', label: 'Aktif Fatura', note: 'Tahsilati tamamlanmamis fatura adedi' }
];

const periodOptions = [
  { value: 'all', label: 'Tum Zamanlar' },
  { value: 'today', label: 'Bugun' },
  { value: '7', label: '7 Gun' },
  { value: '30', label: '30 Gun' }
];

const activityEventLabelMap = {
  AUTH_REGISTER_SUCCESS: 'Kayit Basarili',
  AUTH_LOGIN_SUCCESS: 'Giris Basarili',
  AUTH_LOGIN_FAILED: 'Giris Basarisiz',
  CUSTOMER_CREATED: 'Musteri Eklendi',
  CUSTOMER_UPDATED: 'Musteri Guncellendi',
  CUSTOMER_DELETED: 'Musteri Silindi',
  QUOTE_CREATED: 'Teklif Olusturuldu',
  QUOTE_UPDATED: 'Teklif Guncellendi',
  QUOTE_DELETED: 'Teklif Silindi',
  INVOICE_CREATED: 'Fatura Olusturuldu',
  INVOICE_UPDATED: 'Fatura Guncellendi',
  INVOICE_DELETED: 'Fatura Silindi',
  INVOICE_PAYMENT_UPDATED: 'Tahsilat Durumu Guncellendi',
  INVOICE_BULK_PAYMENT_UPDATED: 'Toplu Tahsilat Durumu Guncellendi',
  INVOICE_REMINDER_CREATED: 'Tahsilat Hatirlatmasi Gonderildi'
};

function isoDateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function resolveActivityDateFrom(period) {
  switch (period) {
    case 'today':
      return isoDateOffset(0);
    case '7':
      return isoDateOffset(-6);
    case '30':
      return isoDateOffset(-29);
    default:
      return null;
  }
}

function resolveGrowthPeriodDays(period) {
  switch (period) {
    case 'today':
      return 7;
    case '7':
      return 30;
    case '30':
      return 90;
    default:
      return 180;
  }
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function activityEventLabel(eventType) {
  return activityEventLabelMap[eventType] || eventType || '-';
}

function activityResourceLabel(activity) {
  if (!activity?.resourceType) {
    return '-';
  }

  if (activity.resourceId) {
    return `${activity.resourceType} #${activity.resourceId}`;
  }

  return activity.resourceType;
}

function activityDetail(activity) {
  const metadata = activity?.metadata || {};
  if (metadata.invoiceNumber) {
    return metadata.invoiceNumber;
  }

  if (metadata.quoteNumber) {
    return metadata.quoteNumber;
  }

  if (metadata.name) {
    return metadata.name;
  }

  if (metadata.status) {
    return `Durum: ${metadata.status}`;
  }

  return '-';
}

export default function DashboardPage() {
  const { token } = useAuth();
  const [period, setPeriod] = useState('all');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    period: 'all',
    periodLabel: 'Tum Zamanlar',
    dateFrom: null,
    totalCustomers: 0,
    totalQuotes: 0,
    totalInvoices: 0,
    totalRevenue: 0,
    pendingReceivable: 0,
    overdueReceivable: 0,
    pendingInvoiceCount: 0,
    overdueInvoiceCount: 0,
    overdueBuckets: {
      days0to7: 0,
      days8to30: 0,
      days31plus: 0
    }
  });
  const [growth, setGrowth] = useState({
    periodDays: 90,
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
    health: {
      score: 0,
      status: 'not_started',
      insight: 'Veri olustukca donusum sagligi gorunur hale gelir.'
    },
    trend: []
  });
  const [error, setError] = useState('');
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        setError('');
        const activityDateFrom = resolveActivityDateFrom(period);
        const activityPath = activityDateFrom
          ? `/dashboard/activity?limit=8&dateFrom=${activityDateFrom}`
          : '/dashboard/activity?limit=8';
        const growthPeriodDays = resolveGrowthPeriodDays(period);
        const growthPath = `/dashboard/growth?period=${growthPeriodDays}`;

        const [statsResponse, activityResponse, growthResponse] = await Promise.all([
          apiRequest(`/dashboard/stats?period=${period}`, { token }),
          apiRequest(activityPath, { token }),
          apiRequest(growthPath, { token })
        ]);

        setStats(statsResponse);
        setActivities(Array.isArray(activityResponse?.activities) ? activityResponse.activities : []);
        setGrowth(growthResponse || {});
      } catch (fetchError) {
        setError(fetchError.message);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [token, period]);

  const updatedAt = new Date().toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit'
  });
  const periodRangeText = stats.dateFrom
    ? `${formatDate(stats.dateFrom)} - ${formatDate(new Date().toISOString().slice(0, 10))}`
    : 'Tum tarih araligi';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Panel"
        description="Bugun oncelik gerektiren teklif, fatura ve tahsilat durumlarini izleyin."
      />

        <div className="card">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="chip bg-slate-100 text-slate-700">Donem</div>
          {periodOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              className={
                option.value === period
                  ? 'btn-primary px-3 py-2 text-xs'
                  : 'btn-secondary px-3 py-2 text-xs'
              }
            >
              {option.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500">Secili donem: {stats.periodLabel || 'Tum Zamanlar'}</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">Tarih araligi: {periodRangeText}</p>
      </div>

      {error ? <div className="status-error">{error}</div> : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array.from({ length: 4 })].map((_, index) => (
            <div key={index} className="card animate-pulse">
              <div className="h-3 w-24 rounded bg-slate-200" />
              <div className="mt-4 h-8 w-20 rounded bg-slate-200" />
              <div className="mt-3 h-3 w-28 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : null}

      {!loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statsConfig.map((item) => (
            <div key={item.key} className="stat-card">
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{stats[item.key]}</p>
              <p className="mt-3 text-xs text-slate-500">{item.note}</p>
            </div>
          ))}

          <div className="card bg-gradient-to-br from-brand-600 via-brand-600 to-brand-700 text-white">
            <p className="text-sm text-brand-100">Beklenen Gelir</p>
            <p className="mt-2 text-3xl font-bold">{formatCurrency(stats.pendingReceivable)}</p>
            <p className="mt-3 text-xs text-brand-100">Acik faturalardan kalan tahsilat | Guncelleme: {updatedAt}</p>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="stat-card border-l-4 border-l-amber-500">
            <p className="text-sm text-slate-500">Takipteki Tahsilat</p>
            <p className="mt-2 text-3xl font-bold text-amber-700">{formatCurrency(stats.pendingReceivable)}</p>
            <p className="mt-3 text-xs text-slate-500">
              Odeme bekleyen toplam {stats.pendingInvoiceCount} fatura
            </p>
          </div>
          <div className="stat-card border-l-4 border-l-rose-500">
            <p className="text-sm text-slate-500">Gecikmeye Dusen Tahsilat</p>
            <p className="mt-2 text-3xl font-bold text-rose-700">{formatCurrency(stats.overdueReceivable)}</p>
            <p className="mt-3 text-xs text-slate-500">
              Vadesi gecmis toplam {stats.overdueInvoiceCount} fatura
            </p>
          </div>
          <div className="stat-card border-l-4 border-l-sky-500">
            <p className="text-sm text-slate-500">Toplam Kesilen Ciro</p>
            <p className="mt-2 text-3xl font-bold text-sky-700">{formatCurrency(stats.totalRevenue)}</p>
            <p className="mt-3 text-xs text-slate-500">Tum donemde kesilen fatura toplami</p>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Donusum Ozeti</h3>
              <p className="mt-1 text-sm text-slate-600">
                Son {growth.periodDays || 0} gunun teklif-fatura-tahsilat gorunumu
              </p>
            </div>
            <p className="text-xs text-slate-500">Saglik skoru: {growth.health?.score ?? 0}</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Tekliften Faturaya</p>
              <p className="mt-1 text-xl font-bold text-slate-900">%{growth.funnel?.quoteToInvoiceRate ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Faturadan Tahsilata</p>
              <p className="mt-1 text-xl font-bold text-slate-900">%{growth.funnel?.invoiceToPaidRate ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Kesilen Tutar</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(growth.revenue?.issued || 0)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Tahsil Edilen</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">
                {formatCurrency(growth.revenue?.collected || 0)}
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-500">{growth.health?.insight || '-'}</p>
        </div>
      ) : null}

      {!loading ? (
        <div className="card">
          <h3 className="text-lg font-semibold text-slate-900">Gecikme Yaslandirmasi</h3>
          <p className="mt-1 text-sm text-slate-600">Hangi alacaklar bugun daha fazla aksiyon istiyor?</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-700">0-7 Gun</p>
              <p className="mt-1 text-lg font-bold text-amber-700">
                {formatCurrency(stats.overdueBuckets?.days0to7)}
              </p>
            </div>
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
              <p className="text-xs font-semibold text-orange-700">8-30 Gun</p>
              <p className="mt-1 text-lg font-bold text-orange-700">
                {formatCurrency(stats.overdueBuckets?.days8to30)}
              </p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs font-semibold text-rose-700">31+ Gun</p>
              <p className="mt-1 text-lg font-bold text-rose-700">
                {formatCurrency(stats.overdueBuckets?.days31plus)}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-900">Son Hareketler</h3>
            <p className="text-xs text-slate-500">Aksiyon kayitlari (son 8)</p>
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
                    Bu donem icin operasyon kaydi bulunamadi.
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
