import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AgencyPresetBar from '../components/AgencyPresetBar';
import ItemRows from '../components/ItemRows';
import PageHeader from '../components/PageHeader';
import { apiRequest, downloadPdf, formatCurrency, formatDate } from '../api';
import { mergePresetItems } from '../constants/agencyPresets';
import { ACTION_LABELS, EMPTY_STATE_LABELS, STATUS_FILTER_LABELS } from '../constants/uiText';
import { useAuth } from '../contexts/AuthContext';

const emptyItem = { name: '', quantity: 1, unitPrice: 0 };

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function resolveDueDate(invoice) {
  return invoice?.due_date || invoice?.date || null;
}

function isInvoiceOverdue(invoice) {
  if (!invoice) {
    return false;
  }

  if ((invoice.payment_status || 'pending') !== 'pending') {
    return false;
  }

  if (invoice.is_overdue !== undefined && invoice.is_overdue !== null) {
    return Number(invoice.is_overdue) === 1;
  }

  const dueDate = resolveDueDate(invoice);
  if (!dueDate) {
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}

function paymentStatusLabel(invoice) {
  if ((invoice.payment_status || 'pending') === 'paid') {
    return 'Tahsil Edildi';
  }

  if (isInvoiceOverdue(invoice)) {
    return 'Gecikmede';
  }

  return 'Takipte';
}

function paymentStatusClasses(invoice) {
  if ((invoice.payment_status || 'pending') === 'paid') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (isInvoiceOverdue(invoice)) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  return 'border-amber-200 bg-amber-50 text-amber-700';
}

const reminderStatusFilters = [
  { key: 'all', label: 'Tum Durumlar' },
  { key: 'failed', label: 'Hata' },
  { key: 'queued', label: 'Kuyrukta' },
  { key: 'sent', label: 'Gonderildi' }
];

const emptyReminderOps = {
  policy: {
    maxRetryCount: 3
  },
  summary: {
    total: 0,
    queued: 0,
    sent: 0,
    failed: 0,
    failedLast24h: 0,
    scheduledRetries: 0,
    oldestQueuedMinutes: null,
    whatsapp: 0,
    email: 0,
    failedRate: 0
  },
  filteredCount: 0,
  errorBreakdown: [],
  jobs: []
};

function reminderStatusLabel(status) {
  if (status === 'sent') {
    return 'Gonderildi';
  }

  if (status === 'failed') {
    return 'Hata';
  }

  return 'Kuyrukta';
}

function reminderJobStatusLabel(job) {
  if (!job) {
    return '-';
  }

  if (job.status === 'queued' && (Number(job.retry_count) || 0) > 0) {
    return 'Yeniden Denenecek';
  }

  return reminderStatusLabel(job.status);
}

function reminderStatusClasses(status) {
  if (status === 'sent') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (status === 'failed') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function reminderChannelLabel(channel) {
  if (channel === 'whatsapp') {
    return 'WhatsApp';
  }

  if (channel === 'email') {
    return 'E-posta';
  }

  return channel || '-';
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

export default function InvoicesPage() {
  const { token } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false
  });
  const [fromQuoteId, setFromQuoteId] = useState('');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const [form, setForm] = useState({
    customerId: '',
    date: today,
    dueDate: addDays(today, 14),
    items: [{ ...emptyItem }]
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingManual, setSavingManual] = useState(false);
  const [savingFromQuote, setSavingFromQuote] = useState(false);
  const [savingBulkStatus, setSavingBulkStatus] = useState(false);
  const [sendingReminderKey, setSendingReminderKey] = useState('');
  const [loadingReminderOps, setLoadingReminderOps] = useState(true);
  const [reminderOpsStatusFilter, setReminderOpsStatusFilter] = useState('failed');
  const [reminderOps, setReminderOps] = useState(emptyReminderOps);
  const [retryingReminderId, setRetryingReminderId] = useState(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const successTimerRef = useRef(null);
  const formCardRef = useRef(null);

  const total = useMemo(
    () =>
      form.items.reduce(
        (acc, item) => acc + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
        0
      ),
    [form.items]
  );

  async function loadInvoices() {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({
        status: statusFilter,
        withMeta: '1',
        page: String(page),
        limit: String(limit)
      });

      if (debouncedSearch.trim()) {
        params.set('q', debouncedSearch.trim());
      }

      const invoiceData = await apiRequest(`/invoices?${params.toString()}`, { token });

      if (Array.isArray(invoiceData)) {
        setInvoices(invoiceData);
        setPagination({
          page,
          limit,
          total: invoiceData.length,
          totalPages: invoiceData.length ? 1 : 0,
          hasNextPage: false,
          hasPrevPage: page > 1
        });
      } else {
        setInvoices(Array.isArray(invoiceData?.data) ? invoiceData.data : []);
        setPagination({
          page: Number(invoiceData?.pagination?.page) || page,
          limit: Number(invoiceData?.pagination?.limit) || limit,
          total: Number(invoiceData?.pagination?.total) || 0,
          totalPages: Number(invoiceData?.pagination?.totalPages) || 0,
          hasNextPage: Boolean(invoiceData?.pagination?.hasNextPage),
          hasPrevPage: Boolean(invoiceData?.pagination?.hasPrevPage)
        });
      }

    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
    setSelectedInvoiceIds([]);
  }

  async function loadReferenceData() {
    try {
      const [quoteData, customerData] = await Promise.all([
        apiRequest('/quotes', { token }),
        apiRequest('/customers', { token })
      ]);

      setQuotes(Array.isArray(quoteData) ? quoteData : []);
      setCustomers(Array.isArray(customerData) ? customerData : []);
    } catch (fetchError) {
      setError(fetchError.message);
    }
  }

  async function loadReminderOps() {
    try {
      setLoadingReminderOps(true);
      const params = new URLSearchParams({
        status: reminderOpsStatusFilter,
        limit: '8'
      });
      const data = await apiRequest(`/invoices/reminders/ops?${params.toString()}`, { token });

      setReminderOps({
        policy: {
          maxRetryCount: Number(data?.policy?.maxRetryCount) || 3
        },
        summary: {
          total: Number(data?.summary?.total) || 0,
          queued: Number(data?.summary?.queued) || 0,
          sent: Number(data?.summary?.sent) || 0,
          failed: Number(data?.summary?.failed) || 0,
          failedLast24h: Number(data?.summary?.failedLast24h) || 0,
          scheduledRetries: Number(data?.summary?.scheduledRetries) || 0,
          oldestQueuedMinutes:
            data?.summary?.oldestQueuedMinutes === null || data?.summary?.oldestQueuedMinutes === undefined
              ? null
              : Number(data.summary.oldestQueuedMinutes) || 0,
          whatsapp: Number(data?.summary?.whatsapp) || 0,
          email: Number(data?.summary?.email) || 0,
          failedRate: Number(data?.summary?.failedRate) || 0
        },
        filteredCount: Number(data?.filteredCount) || 0,
        errorBreakdown: Array.isArray(data?.errorBreakdown) ? data.errorBreakdown : [],
        jobs: Array.isArray(data?.jobs) ? data.jobs : []
      });
    } catch (fetchError) {
      setReminderOps(emptyReminderOps);
      setError(fetchError.message);
    } finally {
      setLoadingReminderOps(false);
    }
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    loadInvoices();
  }, [statusFilter, page, limit, debouncedSearch, token]);

  useEffect(() => {
    loadReferenceData();
  }, [token]);

  useEffect(() => {
    loadReminderOps();
  }, [reminderOpsStatusFilter]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const editParam = searchParams.get('edit');
    if (!editParam) {
      return;
    }

    const invoiceId = Number(editParam);
    const clearEditQuery = () => {
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params);
          next.delete('edit');
          return next;
        },
        { replace: true }
      );
    };

    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      clearEditQuery();
      return;
    }

    if (editingId === invoiceId) {
      clearEditQuery();
      return;
    }

    startEdit(invoiceId).finally(clearEditQuery);
  }, [searchParams, setSearchParams, editingId]);

  function showSuccess(message) {
    setSuccess(message);
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }
    successTimerRef.current = setTimeout(() => {
      setSuccess('');
    }, 2500);
  }

  function resetForm() {
    const baseDate = new Date().toISOString().slice(0, 10);
    setEditingId(null);
    setForm({
      customerId: '',
      date: baseDate,
      dueDate: addDays(baseDate, 14),
      items: [{ ...emptyItem }]
    });
  }

  function toggleInvoiceSelection(invoiceId) {
    setSelectedInvoiceIds((prev) =>
      prev.includes(invoiceId) ? prev.filter((id) => id !== invoiceId) : [...prev, invoiceId]
    );
  }

  function toggleSelectAllVisible() {
    const visibleIds = invoices.map((invoice) => invoice.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedInvoiceIds.includes(id));

    if (allSelected) {
      setSelectedInvoiceIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
      return;
    }

    setSelectedInvoiceIds((prev) => [...new Set([...prev, ...visibleIds])]);
  }

  function sanitizeFormItems(items) {
    return items.map((item) => ({
      name: String(item.name || '').trim(),
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0
    }));
  }

  function validateItems(items) {
    if (!items.length) {
      return 'En az bir hizmet kalemi eklemelisiniz.';
    }

    for (const item of items) {
      if (!item.name) {
        return 'Tum kalemlerde hizmet kalemi adi zorunludur.';
      }

      if (item.quantity <= 0) {
        return 'Miktar 0 dan buyuk olmalidir.';
      }

      if (item.unitPrice < 0) {
        return 'Birim fiyat negatif olamaz.';
      }
    }

    return '';
  }

  function updateItem(index, field, value) {
    setForm((prev) => {
      const nextItems = [...prev.items];
      nextItems[index] = {
        ...nextItems[index],
        [field]: field === 'name' ? value : Number(value)
      };
      return { ...prev, items: nextItems };
    });
  }

  function addItem() {
    setForm((prev) => ({ ...prev, items: [...prev.items, { ...emptyItem }] }));
  }

  function applyServicePreset(preset) {
    if (!preset?.item) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      items: mergePresetItems(prev.items, [preset.item])
    }));
    showSuccess(`${preset.label} kalemi eklendi.`);
  }

  function applyPaymentPlanPreset(preset) {
    if (!preset?.items?.length) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      dueDate: preset.dueInDays ? addDays(prev.date || today, preset.dueInDays) : prev.dueDate,
      items: mergePresetItems(prev.items, preset.items)
    }));
    showSuccess(`${preset.label} plani uygulandi.`);
  }

  function removeItem(index) {
    setForm((prev) => {
      if (prev.items.length === 1) {
        return prev;
      }

      return {
        ...prev,
        items: prev.items.filter((_, itemIndex) => itemIndex !== index)
      };
    });
  }

  async function handleManualSubmit(event) {
    event.preventDefault();
    const isEditing = Boolean(editingId);
    const cleanItems = sanitizeFormItems(form.items);
    const validationError = validateItems(cleanItems);

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSavingManual(true);
      setError('');
      await apiRequest(isEditing ? `/invoices/${editingId}` : '/invoices', {
        method: isEditing ? 'PUT' : 'POST',
        token,
        body: {
          customerId: Number(form.customerId),
          date: form.date,
          dueDate: form.dueDate || form.date,
          items: cleanItems
        }
      });
      resetForm();
      if (!isEditing && page !== 1) {
        setPage(1);
      } else {
        await loadInvoices();
      }
      showSuccess(isEditing ? 'Fatura guncellendi.' : 'Fatura kaydedildi.');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSavingManual(false);
    }
  }

  async function startEdit(invoiceId) {
    try {
      setLoadingEdit(true);
      setError('');
      const invoice = await apiRequest(`/invoices/${invoiceId}`, { token });
      setEditingId(invoice.id);
      setForm({
        customerId: String(invoice.customer_id),
        date: invoice.date,
        dueDate: invoice.due_date || invoice.date,
        items:
          invoice.items?.map((item) => ({
            name: item.name || '',
            quantity: Number(item.quantity) || 1,
            unitPrice: Number(item.unit_price) || 0
          })) || [{ ...emptyItem }]
      });

      formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (editError) {
      setError(editError.message);
    } finally {
      setLoadingEdit(false);
    }
  }

  async function removeInvoice(invoice) {
    const shouldDelete = window.confirm(`${invoice.invoice_number} numarali faturayi silmek istediginize emin misiniz?`);
    if (!shouldDelete) {
      return;
    }

    try {
      setError('');
      await apiRequest(`/invoices/${invoice.id}`, {
        method: 'DELETE',
        token
      });
      if (editingId === invoice.id) {
        resetForm();
      }
      if (invoices.length === 1 && page > 1) {
        setPage((prev) => Math.max(1, prev - 1));
      } else {
        await loadInvoices();
      }
      showSuccess('Fatura silindi.');
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  async function createFromQuote() {
    if (!fromQuoteId) {
      setError('Faturaya cevrilecek teklifi secmelisiniz.');
      return;
    }

    try {
      setSavingFromQuote(true);
      setError('');
      await apiRequest('/invoices', {
        method: 'POST',
        token,
        body: {
          quoteId: Number(fromQuoteId),
          date: today,
          dueDate: addDays(today, 14)
        }
      });
      setFromQuoteId('');
      if (page !== 1) {
        setPage(1);
      } else {
        await loadInvoices();
      }
      showSuccess('Teklif faturaya donusturuldu.');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSavingFromQuote(false);
    }
  }

  async function exportInvoicePdf(invoice) {
    try {
      await downloadPdf(`/invoices/${invoice.id}/pdf`, token, `${invoice.invoice_number}.pdf`);
      showSuccess(`PDF indirildi: ${invoice.invoice_number}.pdf`);
    } catch (pdfError) {
      setError(pdfError.message);
    }
  }

  async function updatePaymentStatus(invoice, status) {
    try {
      setError('');
      await apiRequest(`/invoices/${invoice.id}/payment`, {
        method: 'PATCH',
        token,
        body: {
          status
        }
      });
      await loadInvoices();
      showSuccess(status === 'paid' ? 'Fatura tahsil edildi olarak isaretlendi.' : 'Fatura takibe geri alindi.');
    } catch (updateError) {
      setError(updateError.message);
    }
  }

  async function bulkUpdatePaymentStatus(status) {
    if (!selectedInvoiceIds.length) {
      setError('Toplu islem icin en az bir fatura secin.');
      return;
    }

    try {
      setSavingBulkStatus(true);
      setError('');
      await apiRequest('/invoices/payment/bulk', {
        method: 'PATCH',
        token,
        body: {
          invoiceIds: selectedInvoiceIds,
          status
        }
      });
      await loadInvoices();
      showSuccess(
        status === 'paid'
          ? `${selectedInvoiceIds.length} fatura tahsil edildi olarak isaretlendi.`
          : `${selectedInvoiceIds.length} fatura takibe geri alindi.`
      );
    } catch (bulkError) {
      setError(bulkError.message);
    } finally {
      setSavingBulkStatus(false);
    }
  }

  async function sendReminder(invoice, channel) {
    const actionKey = `${invoice.id}:${channel}`;

    try {
      setSendingReminderKey(actionKey);
      setError('');

      const response = await apiRequest(`/invoices/${invoice.id}/reminders`, {
        method: 'POST',
        token,
        body: {
          channel
        }
      });

      if (channel === 'whatsapp' && response?.delivery_url) {
        window.open(response.delivery_url, '_blank', 'noopener,noreferrer');
        showSuccess('WhatsApp hatirlatmasi hazirlandi.');
      } else {
        showSuccess('Hatirlatma kuyruga alindi.');
      }

      await loadReminderOps();
    } catch (reminderError) {
      setError(reminderError.message);
    } finally {
      setSendingReminderKey('');
    }
  }

  async function retryReminderJob(reminderId) {
    try {
      setRetryingReminderId(reminderId);
      setError('');
      const retried = await apiRequest(`/invoices/reminders/${reminderId}/retry`, {
        method: 'POST',
        token
      });

      await loadReminderOps();
      showSuccess(retried?.status === 'sent' ? 'Hatirlatma tekrar gonderildi.' : 'Hatirlatma yeniden kuyruga alindi.');
    } catch (retryError) {
      setError(retryError.message);
    } finally {
      setRetryingReminderId(null);
    }
  }

  const invoicesTotal = useMemo(
    () => invoices.reduce((acc, invoice) => acc + (Number(invoice.total) || 0), 0),
    [invoices]
  );
  const pendingReceivable = useMemo(
    () =>
      invoices.reduce((acc, invoice) => {
        if ((invoice.payment_status || 'pending') === 'paid') {
          return acc;
        }

        return acc + (Number(invoice.total) || 0);
      }, 0),
    [invoices]
  );
  const overdueReceivable = useMemo(
    () =>
      invoices.reduce((acc, invoice) => {
        if (!isInvoiceOverdue(invoice)) {
          return acc;
        }

        return acc + (Number(invoice.total) || 0);
      }, 0),
    [invoices]
  );
  const totalInvoices = useMemo(
    () => Number(pagination.total) || invoices.length,
    [pagination.total, invoices.length]
  );
  const allVisibleSelected = useMemo(() => {
    if (!invoices.length) {
      return false;
    }

    return invoices.every((invoice) => selectedInvoiceIds.includes(invoice.id));
  }, [invoices, selectedInvoiceIds]);
  const selectedCount = selectedInvoiceIds.length;
  const reminderPolicy = reminderOps.policy || emptyReminderOps.policy;
  const reminderSummary = reminderOps.summary || emptyReminderOps.summary;
  const reminderErrorBreakdown = reminderOps.errorBreakdown || [];
  const reminderJobs = reminderOps.jobs || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Faturalar"
        description="Oncelik gerektiren faturalari ve tahsilati takip edin."
      />

      {success ? <div className="status-success">{success}</div> : null}
      {error ? <div className="status-error">{error}</div> : null}

      <div className="card overflow-x-auto">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Fatura Listesi</h3>
            <p className="text-xs text-slate-500">Oncelik: bekleyen ve geciken faturalar</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="chip border-amber-200 bg-amber-50 text-amber-700">
              Acik: {formatCurrency(pendingReceivable)}
            </span>
            <span className="chip border-rose-200 bg-rose-50 text-rose-700">
              Geciken: {formatCurrency(overdueReceivable)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Durum:</span>
          {[
            { key: 'all', label: STATUS_FILTER_LABELS.allInvoices },
            { key: 'pending', label: STATUS_FILTER_LABELS.pending },
            { key: 'overdue', label: STATUS_FILTER_LABELS.overdue },
            { key: 'paid', label: STATUS_FILTER_LABELS.paid }
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              className={statusFilter === option.key ? 'btn-primary px-3 py-2 text-xs' : 'btn-secondary px-3 py-2 text-xs'}
              onClick={() => {
                setStatusFilter(option.key);
                setPage(1);
              }}
            >
              {option.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500">Secili kayit: {selectedCount}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            onClick={() => bulkUpdatePaymentStatus('paid')}
            disabled={savingBulkStatus || selectedCount === 0}
          >
            {savingBulkStatus ? 'Isleniyor...' : 'Secilenleri Tahsil Et'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => bulkUpdatePaymentStatus('pending')}
            disabled={savingBulkStatus || selectedCount === 0}
          >
            Secilenleri Takibe Al
          </button>
          {selectedCount > 0 ? (
            <button type="button" className="btn-secondary" onClick={() => setSelectedInvoiceIds([])}>
              {ACTION_LABELS.clearSelection}
            </button>
          ) : null}
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Faturalar ({totalInvoices}) - Sayfa {pagination.page}/{Math.max(1, pagination.totalPages || 1)} - Sayfa
            toplami: {formatCurrency(invoicesTotal)}
          </p>
          <input
            type="text"
            placeholder="Fatura ara (no, musteri, tarih)"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="sm:max-w-xs"
          />
        </div>

        <table className="mt-3 min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2 pr-3">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
              </th>
              <th className="py-2 pr-4">No</th>
              <th className="py-2 pr-4">Musteri</th>
              <th className="py-2 pr-4">Tarih</th>
              <th className="py-2 pr-4">Vade</th>
              <th className="py-2 pr-4">Durum</th>
              <th className="py-2 pr-4">Toplam</th>
              <th className="py-2">Islem</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-b border-slate-100">
                <td className="py-3 pr-3">
                  <input
                    type="checkbox"
                    checked={selectedInvoiceIds.includes(invoice.id)}
                    onChange={() => toggleInvoiceSelection(invoice.id)}
                  />
                </td>
                <td className="py-3 pr-4 font-semibold text-slate-800">{invoice.invoice_number}</td>
                <td className="table-cell-muted py-3 pr-4">{invoice.customer_name}</td>
                <td className="table-cell-muted py-3 pr-4">{formatDate(invoice.date)}</td>
                <td className="table-cell-muted py-3 pr-4">{formatDate(resolveDueDate(invoice))}</td>
                <td className="py-3 pr-4">
                  <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${paymentStatusClasses(invoice)}`}>
                    {paymentStatusLabel(invoice)}
                  </span>
                </td>
                <td className="py-3 pr-4 font-medium text-slate-800">{formatCurrency(invoice.total)}</td>
                <td className="py-3">
                  <div className="table-actions">
                    <Link to={`/invoices/${invoice.id}`} className="btn-secondary">
                      {ACTION_LABELS.detail}
                    </Link>
                    <button type="button" className="btn-secondary" onClick={() => startEdit(invoice.id)}>
                      {ACTION_LABELS.edit}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => exportInvoicePdf(invoice)}>
                      PDF
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => sendReminder(invoice, 'whatsapp')}
                      disabled={
                        sendingReminderKey === `${invoice.id}:whatsapp` ||
                        (invoice.payment_status || 'pending') === 'paid'
                      }
                    >
                      {sendingReminderKey === `${invoice.id}:whatsapp` ? 'Hazirlaniyor...' : 'WhatsApp Hatirlat'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => sendReminder(invoice, 'email')}
                      disabled={
                        sendingReminderKey === `${invoice.id}:email` ||
                        (invoice.payment_status || 'pending') === 'paid'
                      }
                    >
                      {sendingReminderKey === `${invoice.id}:email` ? 'Hazirlaniyor...' : 'E-posta Hatirlat'}
                    </button>
                    <button
                      type="button"
                      className={
                        (invoice.payment_status || 'pending') === 'paid'
                          ? 'btn-secondary'
                          : 'btn-secondary border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                      }
                      onClick={() =>
                        updatePaymentStatus(
                          invoice,
                          (invoice.payment_status || 'pending') === 'paid' ? 'pending' : 'paid'
                        )
                      }
                    >
                      {(invoice.payment_status || 'pending') === 'paid' ? 'Takibe Al' : 'Tahsil Edildi'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => removeInvoice(invoice)}
                    >
                      {ACTION_LABELS.delete}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {loading ? (
              <tr>
                <td className="py-8 text-center text-slate-500" colSpan={8}>
                  Faturalar yukleniyor...
                </td>
              </tr>
            ) : null}
            {!loading && invoices.length === 0 ? (
              <tr>
                <td className="py-8 text-center text-slate-500" colSpan={8}>
                  {EMPTY_STATE_LABELS.filteredInvoices}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">
            Toplam {totalInvoices} kayit, sayfa basi {pagination.limit} kayit
          </p>
          <div className="table-actions">
            <button
              type="button"
              className="btn-secondary px-3 py-2 text-xs"
              disabled={!pagination.hasPrevPage}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              {ACTION_LABELS.previous}
            </button>
            <button
              type="button"
              className="btn-secondary px-3 py-2 text-xs"
              disabled={!pagination.hasNextPage}
              onClick={() => setPage((prev) => prev + 1)}
            >
              {ACTION_LABELS.next}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="panel-title">Tekliften Olustur</h3>
          <div className="mt-3 flex flex-col gap-2 md:flex-row">
            <select value={fromQuoteId} onChange={(event) => setFromQuoteId(event.target.value)}>
              <option value="">Teklif secin</option>
              {quotes.map((quote) => (
                <option key={quote.id} value={quote.id}>
                  {quote.quote_number} - {quote.customer_name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-primary md:w-auto"
              onClick={createFromQuote}
              disabled={savingFromQuote}
            >
              {savingFromQuote ? 'Olusturuluyor...' : 'Olustur'}
            </button>
          </div>
        </div>

        <div ref={formCardRef} className="card">
          <h3 className="panel-title">{editingId ? 'Faturayi Duzenle' : 'Manuel Fatura'}</h3>

          <form className="mt-4 space-y-4" onSubmit={handleManualSubmit}>
            {loadingEdit ? <p className="text-sm text-slate-500">Fatura bilgisi yukleniyor...</p> : null}

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm text-slate-600">Musteri</label>
                <select
                  value={form.customerId}
                  onChange={(event) => setForm((prev) => ({ ...prev, customerId: event.target.value }))}
                  required
                >
                  <option value="">Musteri secin</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm text-slate-600">Tarih</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-slate-600">Vade</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                  required
                />
              </div>
            </div>

            <AgencyPresetBar
              onApplyServicePreset={applyServicePreset}
              onApplyPaymentPlanPreset={applyPaymentPlanPreset}
            />

            <ItemRows items={form.items} onChange={updateItem} onAdd={addItem} onRemove={removeItem} />

            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-700">
                Toplam: <span className="font-semibold">{formatCurrency(total)}</span>
              </p>
              <div className="table-actions">
                {editingId ? (
                  <button type="button" className="btn-secondary" onClick={resetForm}>
                    {ACTION_LABELS.cancel}
                  </button>
                ) : null}
                <button type="submit" className="btn-primary" disabled={savingManual}>
                  {savingManual ? 'Kaydediliyor...' : editingId ? ACTION_LABELS.update : 'Faturayi Kaydet'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="card bg-slate-50/70">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="panel-title">Hatirlatmalar</h3>
            <p className="text-xs text-slate-500">Ikincil izleme alani</p>
          </div>
          <span className="chip">Kayit: {reminderOps.filteredCount}</span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-2">
            <p className="text-[11px] text-amber-700">Kuyrukta</p>
            <p className="text-sm font-semibold text-amber-800">{reminderSummary.queued}</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-2">
            <p className="text-[11px] text-rose-700">Hata</p>
            <p className="text-sm font-semibold text-rose-800">{reminderSummary.failed}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2">
            <p className="text-[11px] text-slate-500">24s Hata</p>
            <p className="text-sm font-semibold text-slate-800">{reminderSummary.failedLast24h}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2">
            <p className="text-[11px] text-slate-500">Hata Orani</p>
            <p className="text-sm font-semibold text-slate-800">%{reminderSummary.failedRate}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2">
            <p className="text-[11px] text-slate-500">Deneme Limiti</p>
            <p className="text-sm font-semibold text-slate-800">{reminderPolicy.maxRetryCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2">
            <p className="text-[11px] text-slate-500">Kanal (WA/E-posta)</p>
            <p className="text-sm font-semibold text-slate-800">
              {reminderSummary.whatsapp}/{reminderSummary.email}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Durum:</span>
          {reminderStatusFilters.map((option) => (
            <button
              key={option.key}
              type="button"
              className={
                reminderOpsStatusFilter === option.key
                  ? 'btn-primary px-3 py-2 text-xs'
                  : 'btn-secondary px-3 py-2 text-xs'
              }
              onClick={() => setReminderOpsStatusFilter(option.key)}
            >
              {option.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500">En sik hata: {reminderErrorBreakdown[0]?.message || '-'}</span>
        </div>

        {reminderErrorBreakdown.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {reminderErrorBreakdown.map((errorRow) => (
              <span key={`${errorRow.message}:${errorRow.total}`} className="chip">
                {errorRow.message} ({errorRow.total})
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4">Zaman</th>
                <th className="py-2 pr-4">Fatura</th>
                <th className="py-2 pr-4">Kanal</th>
                <th className="py-2 pr-4">Durum</th>
                <th className="py-2 pr-4">Deneme</th>
                <th className="py-2 pr-4">Sonraki Deneme</th>
                <th className="py-2 pr-4">Hata</th>
                <th className="py-2">Islem</th>
              </tr>
            </thead>
            <tbody>
              {loadingReminderOps ? (
                <tr>
                  <td className="py-6 text-center text-slate-500" colSpan={8}>
                    Hatirlatma kayitlari yukleniyor...
                  </td>
                </tr>
              ) : null}
              {!loadingReminderOps &&
                reminderJobs.map((job) => (
                  <tr key={job.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4 text-slate-600">
                      {formatDateTime(job.processed_at || job.created_at)}
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-slate-800">{job.invoice_number}</p>
                      <p className="text-xs text-slate-500">{job.customer_name || '-'}</p>
                    </td>
                    <td className="table-cell-muted py-3 pr-4">{reminderChannelLabel(job.channel)}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full border px-2 py-1 text-xs font-semibold ${reminderStatusClasses(job.status)}`}
                      >
                        {reminderJobStatusLabel(job)}
                      </span>
                    </td>
                    <td className="table-cell-muted py-3 pr-4">
                      {Number(job.retry_count) || 0} / {reminderPolicy.maxRetryCount}
                    </td>
                    <td className="table-cell-muted py-3 pr-4">{formatDateTime(job.next_attempt_at)}</td>
                    <td className="table-cell-muted py-3 pr-4">{job.error_message || '-'}</td>
                    <td className="py-3">
                      {job.status === 'failed' ? (
                        <button
                          type="button"
                          className="btn-secondary border-rose-200 text-rose-700 hover:bg-rose-50"
                          onClick={() => retryReminderJob(job.id)}
                          disabled={
                            retryingReminderId === job.id ||
                            (Number(job.retry_count) || 0) >= reminderPolicy.maxRetryCount
                          }
                        >
                          {(Number(job.retry_count) || 0) >= reminderPolicy.maxRetryCount
                            ? 'Limit Doldu'
                            : retryingReminderId === job.id
                              ? 'Deneniyor...'
                              : 'Yeniden Dene'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              {!loadingReminderOps && reminderJobs.length === 0 ? (
                <tr>
                  <td className="py-6 text-center text-slate-500" colSpan={8}>
                    {EMPTY_STATE_LABELS.noReminderRecords}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
