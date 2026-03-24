import { useEffect, useState } from 'react';
import { apiRequest, formatCurrency, formatDate } from '../api';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';

const statsConfig = [
  { key: 'totalCustomers', label: 'Toplam Musteri', note: 'Kayitli aktif cari hesaplar' },
  { key: 'totalQuotes', label: 'Toplam Teklif', note: 'Olusturulan teklif kayitlari' },
  { key: 'totalInvoices', label: 'Toplam Fatura', note: 'Olusturulan fatura kayitlari' }
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
  CUSTOMER_CREATED: 'Musteri Olusturuldu',
  CUSTOMER_UPDATED: 'Musteri Guncellendi',
  CUSTOMER_DELETED: 'Musteri Silindi',
  QUOTE_CREATED: 'Teklif Olusturuldu',
  QUOTE_UPDATED: 'Teklif Guncellendi',
  QUOTE_DELETED: 'Teklif Silindi',
  INVOICE_CREATED: 'Fatura Olusturuldu',
  INVOICE_UPDATED: 'Fatura Guncellendi',
  INVOICE_DELETED: 'Fatura Silindi',
  INVOICE_PAYMENT_UPDATED: 'Fatura Odeme Durumu Guncellendi',
  INVOICE_BULK_PAYMENT_UPDATED: 'Toplu Odeme Durumu Guncellendi',
  INVOICE_REMINDER_CREATED: 'Tahsilat Hatirlatmasi Olusturuldu'
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

        const [statsResponse, activityResponse] = await Promise.all([
          apiRequest(`/dashboard/stats?period=${period}`, { token }),
          apiRequest(activityPath, { token })
        ]);

        setStats(statsResponse);
        setActivities(Array.isArray(activityResponse?.activities) ? activityResponse.activities : []);
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
        title="Genel Bakis"
        description="Musteri, teklif, fatura ve ciro metriklerini tek ekranda anlik takip edin"
      />

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="chip bg-slate-100 text-slate-700">Filtre</div>
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
          <span className="ml-auto text-xs text-slate-500">Aktif Donem: {stats.periodLabel || 'Tum Zamanlar'}</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">Donem Araligi: {periodRangeText}</p>
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
            <p className="text-sm text-brand-100">Toplam Ciro</p>
            <p className="mt-2 text-3xl font-bold">{formatCurrency(stats.totalRevenue)}</p>
            <p className="mt-3 text-xs text-brand-100">Son guncelleme: {updatedAt}</p>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="stat-card border-l-4 border-l-amber-500">
            <p className="text-sm text-slate-500">Bekleyen Tahsilat</p>
            <p className="mt-2 text-3xl font-bold text-amber-700">{formatCurrency(stats.pendingReceivable)}</p>
            <p className="mt-3 text-xs text-slate-500">
              Odeme bekleyen toplam {stats.pendingInvoiceCount} fatura
            </p>
          </div>
          <div className="stat-card border-l-4 border-l-rose-500">
            <p className="text-sm text-slate-500">Geciken Tahsilat</p>
            <p className="mt-2 text-3xl font-bold text-rose-700">{formatCurrency(stats.overdueReceivable)}</p>
            <p className="mt-3 text-xs text-slate-500">
              Vadesi gecmis toplam {stats.overdueInvoiceCount} fatura
            </p>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="card">
          <h3 className="text-lg font-semibold text-slate-900">Gecikme Yaslandirma</h3>
          <p className="mt-1 text-sm text-slate-600">Gecikme suresine gore tahsilat riski dagilimi</p>
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
            <h3 className="text-lg font-semibold text-slate-900">Son Islemler</h3>
            <p className="text-xs text-slate-500">Audit kayitlari (son 8)</p>
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
                    Bu donem icin audit kaydi bulunamadi.
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
