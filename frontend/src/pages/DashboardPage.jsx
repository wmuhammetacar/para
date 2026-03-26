import { useEffect, useState } from 'react';
import { apiRequest, formatCurrency, formatDate } from '../api';
import AgingBucketsCard from '../components/dashboard/AgingBucketsCard';
import ConversionSummaryCard from '../components/dashboard/ConversionSummaryCard';
import PeriodFilterCard from '../components/dashboard/PeriodFilterCard';
import PrimaryStatsGrid from '../components/dashboard/PrimaryStatsGrid';
import RecentActivitiesCard from '../components/dashboard/RecentActivitiesCard';
import {
  activityDetail,
  activityEventLabel,
  activityResourceLabel,
  formatDateTime,
  periodOptions,
  resolveActivityDateFrom,
  resolveGrowthPeriodDays
} from '../components/dashboard/dashboardHelpers';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';

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
      <PageHeader title="Panel" description="Bugun odaklanmaniz gereken tahsilatlari gorun." />

      <PeriodFilterCard
        period={period}
        periodOptions={periodOptions}
        periodLabel={stats.periodLabel}
        periodRangeText={periodRangeText}
        onPeriodChange={setPeriod}
      />

      {error ? <div className="status-error">{error}</div> : null}

      <PrimaryStatsGrid
        loading={loading}
        stats={stats}
        updatedAt={updatedAt}
        formatCurrency={formatCurrency}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ConversionSummaryCard loading={loading} growth={growth} formatCurrency={formatCurrency} />
        <AgingBucketsCard loading={loading} stats={stats} formatCurrency={formatCurrency} />
      </div>

      <RecentActivitiesCard
        loading={loading}
        activities={activities}
        formatDateTime={formatDateTime}
        activityEventLabel={activityEventLabel}
        activityResourceLabel={activityResourceLabel}
        activityDetail={activityDetail}
      />
    </div>
  );
}
