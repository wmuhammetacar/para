import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AgencyPresetBar from '../components/AgencyPresetBar';
import ItemRows from '../components/ItemRows';
import PageHeader from '../components/PageHeader';
import { apiRequest, downloadPdf, formatCurrency, formatDate } from '../api';
import { mergePresetItems } from '../constants/agencyPresets';
import { ACTION_LABELS, EMPTY_STATE_LABELS } from '../constants/uiText';
import { useAuth } from '../contexts/AuthContext';

const emptyItem = { name: '', quantity: 1, unitPrice: 0 };

export default function QuotesPage() {
  const { token } = useAuth();
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
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
  const [form, setForm] = useState({
    customerId: '',
    date: new Date().toISOString().slice(0, 10),
    items: [{ ...emptyItem }]
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
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

      if (Array.isArray(quotesData)) {
        setQuotes(quotesData);
        setPagination({
          page,
          limit,
          total: quotesData.length,
          totalPages: quotesData.length ? 1 : 0,
          hasNextPage: false,
          hasPrevPage: page > 1
        });
      } else {
        setQuotes(Array.isArray(quotesData?.data) ? quotesData.data : []);
        setPagination({
          page: Number(quotesData?.pagination?.page) || page,
          limit: Number(quotesData?.pagination?.limit) || limit,
          total: Number(quotesData?.pagination?.total) || 0,
          totalPages: Number(quotesData?.pagination?.totalPages) || 0,
          hasNextPage: Boolean(quotesData?.pagination?.hasNextPage),
          hasPrevPage: Boolean(quotesData?.pagination?.hasPrevPage)
        });
      }
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
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    loadQuotes();
  }, [page, limit, debouncedSearch, token]);

  useEffect(() => {
    loadCustomers();
  }, [token]);

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

      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <div ref={formCardRef} className="card">
          <h3 className="panel-title">{editingId ? 'Teklifi Duzenle' : 'Yeni Teklif'}</h3>
          <p className="panel-description">Musteri, tarih ve kalemleri girin. Toplam otomatik hesaplanir.</p>
          {loadingEdit ? <p className="mt-2 text-sm text-slate-500">Teklif yukleniyor...</p> : null}

          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
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
                <button type="submit" className="btn-primary" disabled={saving || customers.length === 0}>
                  {saving ? 'Kaydediliyor...' : editingId ? 'Guncelle' : 'Teklifi Kaydet'}
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className="stat-card">
          <p className="text-sm text-slate-500">Toplam Teklif</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{totalQuotes}</p>
          <p className="mt-3 text-sm text-slate-600">Bu sayfadaki toplam tutar</p>
          <p className="mt-1 text-lg font-semibold text-brand-700">{formatCurrency(pageTotal)}</p>
          {customers.length === 0 ? (
            <p className="mt-4 text-xs text-amber-700">
              Teklif olusturmak icin once Musteriler ekranindan kayit ekleyin.
            </p>
          ) : null}
        </div>
      </div>

      {success ? <div className="status-success">{success}</div> : null}
      {error ? <div className="status-error">{error}</div> : null}

      <div className="card overflow-x-auto">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Teklifler ({totalQuotes}) - Sayfa {pagination.page}/{Math.max(1, pagination.totalPages || 1)} -
            Sayfa Toplami: {formatCurrency(pageTotal)}
          </p>
          <input
            type="text"
            placeholder="Teklif ara (no, musteri, tarih)"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="sm:max-w-xs"
          />
        </div>

        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2 pr-4">No</th>
              <th className="py-2 pr-4">Musteri</th>
              <th className="py-2 pr-4">Tarih</th>
              <th className="py-2 pr-4">Toplam</th>
              <th className="py-2">Islemler</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote) => (
              <tr key={quote.id} className="border-b border-slate-100">
                <td className="py-3 pr-4 font-semibold text-slate-800">{quote.quote_number}</td>
                <td className="table-cell-muted py-3 pr-4">{quote.customer_name}</td>
                <td className="table-cell-muted py-3 pr-4">{formatDate(quote.date)}</td>
                <td className="py-3 pr-4 font-medium text-slate-800">{formatCurrency(quote.total)}</td>
                <td className="py-3">
                  <div className="table-actions">
                    <Link to={`/quotes/${quote.id}`} className="btn-secondary">
                      {ACTION_LABELS.detail}
                    </Link>
                    <button type="button" className="btn-secondary" onClick={() => startEdit(quote.id)}>
                      {ACTION_LABELS.edit}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => exportQuotePdf(quote)}>
                      PDF
                    </button>
                    <button
                      type="button"
                      className="btn-secondary border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => removeQuote(quote)}
                    >
                      {ACTION_LABELS.delete}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {loading ? (
              <tr>
                <td className="py-8 text-center text-slate-500" colSpan={5}>
                  Teklifler yukleniyor...
                </td>
              </tr>
            ) : null}
            {!loading && quotes.length === 0 ? (
              <tr>
                <td className="py-8 text-center text-slate-500" colSpan={5}>
                  {EMPTY_STATE_LABELS.filteredQuotes}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">
            Toplam {totalQuotes} kayit, sayfa basi {pagination.limit} kayit
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
    </div>
  );
}
