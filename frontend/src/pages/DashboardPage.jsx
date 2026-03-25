import { useEffect, useState } from 'react';
import { apiRequest, formatCurrency, formatDate } from '../api';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';

const statsConfig = [
  { key: 'totalCustomers', label: 'Toplam Client', note: 'Ajans portfoyundeki aktif client hesaplari' },
  { key: 'totalQuotes', label: 'Aktif Teklifler', note: 'Client onayi ve geri donus bekleyen teklifler' },
  { key: 'pendingInvoiceCount', label: 'Aktif Faturalar', note: 'Tahsilati tamamlanmamis fatura adedi' }
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
  CUSTOMER_CREATED: 'Client Eklendi',
  CUSTOMER_UPDATED: 'Client Guncellendi',
  CUSTOMER_DELETED: 'Client Arsivlendi',
  QUOTE_CREATED: 'Teklif Dosyasi Olusturuldu',
  QUOTE_UPDATED: 'Teklif Dosyasi Guncellendi',
  QUOTE_DELETED: 'Teklif Dosyasi Silindi',
  INVOICE_CREATED: 'Tahsilat Faturasi Olusturuldu',
  INVOICE_UPDATED: 'Tahsilat Faturasi Guncellendi',
  INVOICE_DELETED: 'Tahsilat Faturasi Silindi',
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
        title="Ajans Operasyon Paneli"
        description="Client, teklif, fatura ve tahsilat akisinda bugun aksiyon gerektiren alanlari tek ekranda izleyin"
      />

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="chip bg-slate-100 text-slate-700">Operasyon Donemi</div>
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
          <span className="ml-auto text-xs text-slate-500">Secili Donem: {stats.periodLabel || 'Tum Zamanlar'}</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">Tarih Araligi: {periodRangeText}</p>
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
            <p className="mt-3 text-xs text-brand-100">Acil faturalardan kalan tahsilat | Guncelleme: {updatedAt}</p>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="stat-card border-l-4 border-l-amber-500">
            <p className="text-sm text-slate-500">Takipteki Tahsilat</p>
            <p className="mt-2 text-3xl font-bold text-amber-700">{formatCurrency(stats.pendingReceivable)}</p>
            <p className="mt-3 text-xs text-slate-500">
              Odeme bekleyen toplam {stats.pendingInvoiceCount} aktif fatura
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
            <p className="mt-3 text-xs text-slate-500">Tum donem boyunca olusan fatura toplami</p>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card">
            <h3 className="text-lg font-semibold text-slate-900">Tekliften Tahsilata Donusum</h3>
            <p className="mt-1 text-sm text-slate-600">
              Son {growth.periodDays || 0} gunluk teklif-fatura-tahsilat akisi
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Teklif - Fatura Donusumu</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">%{growth.funnel?.quoteToInvoiceRate ?? 0}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {growth.funnel?.quotes ?? 0} tekliften {growth.funnel?.invoices ?? 0} fatura
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Fatura - Tahsilat Donusumu</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">%{growth.funnel?.invoiceToPaidRate ?? 0}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {growth.funnel?.invoices ?? 0} faturadan {growth.funnel?.paidInvoices ?? 0} tahsilat
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Operasyon Saglik Skoru</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{growth.health?.score ?? 0}</p>
              <p className="mt-2 text-xs text-slate-500">{growth.health?.insight || '-'}</p>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-slate-900">Gelir ve Tahsilat Kompozisyonu</h3>
            <p className="mt-1 text-sm text-slate-600">Ajans owner icin tahsilat baskisi gorunumu</p>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Kesilen Fatura Toplami</p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {formatCurrency(growth.revenue?.issued || 0)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-emerald-50 p-3">
                <p className="text-xs text-emerald-700">Tahsil Edilen Gelir</p>
                <p className="mt-1 text-xl font-bold text-emerald-700">
                  {formatCurrency(growth.revenue?.collected || 0)}
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-700">Acik Alacak</p>
                <p className="mt-1 text-xl font-bold text-amber-700">
                  {formatCurrency(growth.revenue?.openReceivable || 0)}
                </p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-xs text-rose-700">Vadesi Gecikmis</p>
                <p className="mt-1 text-xl font-bold text-rose-700">
                  {formatCurrency(growth.revenue?.overdueReceivable || 0)}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-900">6 Aylik Operasyon Trendi</h3>
            <p className="text-xs text-slate-500">Fatura olusumu ve tahsilat ritmi</p>
          </div>

          <table className="mt-4 min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4">Ay</th>
                <th className="py-2 pr-4">Fatura</th>
                <th className="py-2 pr-4">Tahsilat (Adet)</th>
                <th className="py-2 pr-4">Kesilen Tutar</th>
                <th className="py-2 pr-4">Tahsil Edilen</th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(growth.trend) ? growth.trend : []).map((row) => (
                <tr key={row.monthKey} className="border-b border-slate-100">
                  <td className="py-3 pr-4 font-medium text-slate-800">{row.label || row.monthKey}</td>
                  <td className="table-cell-muted py-3 pr-4">{row.createdInvoices ?? 0}</td>
                  <td className="table-cell-muted py-3 pr-4">{row.paidInvoices ?? 0}</td>
                  <td className="table-cell-muted py-3 pr-4">{formatCurrency(row.issuedRevenue || 0)}</td>
                  <td className="table-cell-muted py-3 pr-4">{formatCurrency(row.collectedRevenue || 0)}</td>
                </tr>
              ))}
              {!growth.trend?.length ? (
                <tr>
                  <td className="py-8 text-center text-slate-500" colSpan={5}>
                    Bu donem icin trend verisi olusmadi.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
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
            <h3 className="text-lg font-semibold text-slate-900">Son Operasyon Hareketleri</h3>
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
