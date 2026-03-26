import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import QuoteEditorSection from '../components/quotes/QuoteEditorSection';
import QuoteListSection from '../components/quotes/QuoteListSection';
import { apiRequest, downloadPdf, formatCurrency, formatDate } from '../api';
import { mergePresetItems } from '../constants/agencyPresets';
import { useAuth } from '../contexts/AuthContext';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useTimedMessage } from '../hooks/useTimedMessage';
import { DEFAULT_PAGINATION, resolvePaginatedResponse } from '../utils/pagination';

const emptyItem = { name: '', quantity: 1, unitPrice: 0 };

export default function QuotesPage() {
  const { token } = useAuth();
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [pagination, setPagination] = useState({ ...DEFAULT_PAGINATION, limit: 10 });
  const [form, setForm] = useState({
    customerId: '',
    date: new Date().toISOString().slice(0, 10),
    items: [{ ...emptyItem }]
  });
  const [error, setError] = useState('');
  const { message: success, showMessage: showSuccess } = useTimedMessage();
  const [saving, setSaving] = useState(false);
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

  async function loadQuotes() {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({
        withMeta: '1',
        page: String(page),
        limit: String(limit)
      });

      if (debouncedSearch.trim()) {
        params.set('q', debouncedSearch.trim());
      }

      const quotesData = await apiRequest(`/quotes?${params.toString()}`, { token });

      const { rows, pagination: nextPagination } = resolvePaginatedResponse(quotesData, {
        page,
        limit
      });
      setQuotes(rows);
      setPagination(nextPagination);
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomers() {
    try {
      const customersData = await apiRequest('/customers', { token });
      setCustomers(Array.isArray(customersData) ? customersData : []);
    } catch (fetchError) {
      setError(fetchError.message);
    }
  }

  useEffect(() => {
    loadQuotes();
  }, [page, limit, debouncedSearch, token]);

  useEffect(() => {
    loadCustomers();
  }, [token]);

  useEffect(() => {
    const editParam = searchParams.get('edit');
    if (!editParam) {
      return;
    }

    const quoteId = Number(editParam);
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

    if (!Number.isInteger(quoteId) || quoteId <= 0) {
      clearEditQuery();
      return;
    }

    if (editingId === quoteId) {
      clearEditQuery();
      return;
    }

    startEdit(quoteId).finally(clearEditQuery);
  }, [searchParams, setSearchParams, editingId]);

  function resetForm() {
    setEditingId(null);
    setForm({
      customerId: '',
      date: new Date().toISOString().slice(0, 10),
      items: [{ ...emptyItem }]
    });
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
      items: mergePresetItems(prev.items, preset.items)
    }));
    showSuccess(`${preset.label} plani kalemlere eklendi.`);
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

  async function handleSubmit(event) {
    event.preventDefault();
    const isEditing = Boolean(editingId);
    const cleanItems = sanitizeFormItems(form.items);
    const validationError = validateItems(cleanItems);

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError('');
      await apiRequest(isEditing ? `/quotes/${editingId}` : '/quotes', {
        method: isEditing ? 'PUT' : 'POST',
        token,
        body: {
          customerId: Number(form.customerId),
          date: form.date,
          items: cleanItems
        }
      });
      resetForm();
      if (!isEditing && page !== 1) {
        setPage(1);
      } else {
        await loadQuotes();
      }
      showSuccess(isEditing ? 'Teklif guncellendi.' : 'Teklif kaydedildi.');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  async function startEdit(quoteId) {
    try {
      setLoadingEdit(true);
      setError('');
      const quote = await apiRequest(`/quotes/${quoteId}`, { token });
      setEditingId(quote.id);
      setForm({
        customerId: String(quote.customer_id),
        date: quote.date,
        items:
          quote.items?.map((item) => ({
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

  async function removeQuote(quote) {
    const shouldDelete = window.confirm(`${quote.quote_number} numarali teklifi silmek istediginize emin misiniz?`);
    if (!shouldDelete) {
      return;
    }

    try {
      setError('');
      await apiRequest(`/quotes/${quote.id}`, {
        method: 'DELETE',
        token
      });
      if (editingId === quote.id) {
        resetForm();
      }
      if (quotes.length === 1 && page > 1) {
        setPage((prev) => Math.max(1, prev - 1));
      } else {
        await loadQuotes();
      }
      showSuccess('Teklif silindi.');
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  async function exportQuotePdf(quote) {
    try {
      await downloadPdf(`/quotes/${quote.id}/pdf`, token, `${quote.quote_number}.pdf`);
      showSuccess(`PDF indirildi: ${quote.quote_number}.pdf`);
    } catch (pdfError) {
      setError(pdfError.message);
    }
  }

  const totalQuotes = useMemo(() => Number(pagination.total) || quotes.length, [pagination.total, quotes.length]);
  const pageTotal = useMemo(
    () => quotes.reduce((acc, quote) => acc + (Number(quote.total) || 0), 0),
    [quotes]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teklifler"
        description="Teklif olusturun ve takip edin."
      />

      <QuoteEditorSection
        formCardRef={formCardRef}
        editingId={editingId}
        loadingEdit={loadingEdit}
        form={form}
        customers={customers}
        total={total}
        totalQuotes={totalQuotes}
        pageTotal={pageTotal}
        saving={saving}
        onFormChange={setForm}
        onSubmit={handleSubmit}
        onResetForm={resetForm}
        onApplyServicePreset={applyServicePreset}
        onApplyPaymentPlanPreset={applyPaymentPlanPreset}
        onUpdateItem={updateItem}
        onAddItem={addItem}
        onRemoveItem={removeItem}
        formatCurrency={formatCurrency}
      />

      {success ? <div className="status-success">{success}</div> : null}
      {error ? <div className="status-error">{error}</div> : null}

      <QuoteListSection
        quotes={quotes}
        loading={loading}
        search={search}
        totalQuotes={totalQuotes}
        pageTotal={pageTotal}
        pagination={pagination}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onStartEdit={startEdit}
        onExportPdf={exportQuotePdf}
        onRemoveQuote={removeQuote}
        onPrevPage={() => setPage((prev) => Math.max(1, prev - 1))}
        onNextPage={() => setPage((prev) => prev + 1)}
        formatCurrency={formatCurrency}
        formatDate={formatDate}
      />
    </div>
  );
}
