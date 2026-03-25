import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiRequest, downloadPdf, formatCurrency, formatDate } from '../api';
import InvoiceCreateSection from '../components/invoices/InvoiceCreateSection';
import InvoiceListSection from '../components/invoices/InvoiceListSection';
import ReminderOpsSection from '../components/invoices/ReminderOpsSection';
import {
  addDays,
  emptyItem,
  emptyReminderOps,
  formatDateTime,
  isInvoiceOverdue,
  normalizeReminderOpsResponse,
  paymentStatusClasses,
  paymentStatusLabel,
  reminderChannelLabel,
  reminderJobStatusLabel,
  reminderStatusClasses,
  reminderStatusFilters,
  resolveDueDate,
  sanitizeFormItems,
  validateItems
} from '../components/invoices/invoiceUi';
import PageHeader from '../components/PageHeader';
import { mergePresetItems } from '../constants/agencyPresets';
import { useAuth } from '../contexts/AuthContext';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useTimedMessage } from '../hooks/useTimedMessage';
import { DEFAULT_PAGINATION, resolvePaginatedResponse } from '../utils/pagination';

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
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [pagination, setPagination] = useState({ ...DEFAULT_PAGINATION, limit: 10 });
  const [fromQuoteId, setFromQuoteId] = useState('');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const [form, setForm] = useState({
    customerId: '',
    date: today,
    dueDate: addDays(today, 14),
    items: [{ ...emptyItem }]
  });
  const [error, setError] = useState('');
  const { message: success, showMessage: showSuccess } = useTimedMessage();
  const [savingManual, setSavingManual] = useState(false);
  const [savingFromQuote, setSavingFromQuote] = useState(false);
  const [savingBulkStatus, setSavingBulkStatus] = useState(false);
  const [sendingReminderKey, setSendingReminderKey] = useState('');
  const [loadingReminderOps, setLoadingReminderOps] = useState(true);
  const [reminderOpsStatusFilter, setReminderOpsStatusFilter] = useState('failed');
  const [reminderOps, setReminderOps] = useState(emptyReminderOps);
  const [retryingReminderId, setRetryingReminderId] = useState(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
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

      const { rows, pagination: nextPagination } = resolvePaginatedResponse(invoiceData, {
        page,
        limit
      });
      setInvoices(rows);
      setPagination(nextPagination);
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
      setReminderOps(normalizeReminderOpsResponse(data));
    } catch (fetchError) {
      setReminderOps(emptyReminderOps);
      setError(fetchError.message);
    } finally {
      setLoadingReminderOps(false);
    }
  }

  useEffect(() => {
    loadInvoices();
  }, [statusFilter, page, limit, debouncedSearch, token]);

  useEffect(() => {
    loadReferenceData();
  }, [token]);

  useEffect(() => {
    loadReminderOps();
  }, [reminderOpsStatusFilter, token]);

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
      <PageHeader title="Faturalar" description="Oncelik gerektiren faturalari ve tahsilati takip edin." />

      {success ? <div className="status-success">{success}</div> : null}
      {error ? <div className="status-error">{error}</div> : null}

      <InvoiceListSection
        invoices={invoices}
        loading={loading}
        pagination={pagination}
        totalInvoices={totalInvoices}
        invoicesTotal={invoicesTotal}
        pendingReceivable={pendingReceivable}
        overdueReceivable={overdueReceivable}
        statusFilter={statusFilter}
        selectedCount={selectedCount}
        search={search}
        allVisibleSelected={allVisibleSelected}
        selectedInvoiceIds={selectedInvoiceIds}
        savingBulkStatus={savingBulkStatus}
        sendingReminderKey={sendingReminderKey}
        onStatusFilterChange={(nextFilter) => {
          setStatusFilter(nextFilter);
          setPage(1);
        }}
        onBulkUpdatePaymentStatus={bulkUpdatePaymentStatus}
        onClearSelection={() => setSelectedInvoiceIds([])}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onToggleSelectAllVisible={toggleSelectAllVisible}
        onToggleInvoiceSelection={toggleInvoiceSelection}
        onStartEdit={startEdit}
        onExportPdf={exportInvoicePdf}
        onSendReminder={sendReminder}
        onUpdatePaymentStatus={updatePaymentStatus}
        onRemoveInvoice={removeInvoice}
        onPrevPage={() => setPage((prev) => Math.max(1, prev - 1))}
        onNextPage={() => setPage((prev) => prev + 1)}
        paymentStatusLabel={paymentStatusLabel}
        paymentStatusClasses={paymentStatusClasses}
        resolveDueDate={resolveDueDate}
        formatCurrency={formatCurrency}
        formatDate={formatDate}
      />

      <InvoiceCreateSection
        editingId={editingId}
        loadingEdit={loadingEdit}
        fromQuoteId={fromQuoteId}
        quotes={quotes}
        form={form}
        customers={customers}
        total={total}
        savingFromQuote={savingFromQuote}
        savingManual={savingManual}
        formCardRef={formCardRef}
        onFromQuoteChange={setFromQuoteId}
        onCreateFromQuote={createFromQuote}
        onFormChange={setForm}
        onApplyServicePreset={applyServicePreset}
        onApplyPaymentPlanPreset={applyPaymentPlanPreset}
        onUpdateItem={updateItem}
        onAddItem={addItem}
        onRemoveItem={removeItem}
        onResetForm={resetForm}
        onSubmit={handleManualSubmit}
        formatCurrency={formatCurrency}
      />

      <ReminderOpsSection
        loadingReminderOps={loadingReminderOps}
        reminderOps={reminderOps}
        reminderSummary={reminderSummary}
        reminderPolicy={reminderPolicy}
        reminderStatusFilters={reminderStatusFilters}
        reminderOpsStatusFilter={reminderOpsStatusFilter}
        reminderErrorBreakdown={reminderErrorBreakdown}
        reminderJobs={reminderJobs}
        retryingReminderId={retryingReminderId}
        onReminderOpsStatusFilterChange={setReminderOpsStatusFilter}
        onRetryReminderJob={retryReminderJob}
        formatDateTime={formatDateTime}
        reminderChannelLabel={reminderChannelLabel}
        reminderStatusClasses={reminderStatusClasses}
        reminderJobStatusLabel={reminderJobStatusLabel}
      />
    </div>
  );
}
