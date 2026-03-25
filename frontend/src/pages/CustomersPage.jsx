import { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, formatDate } from '../api';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  address: ''
};

export default function CustomersPage() {
  const { token } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(emptyForm);
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const successTimerRef = useRef(null);

  async function loadCustomers() {
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

      const response = await apiRequest(`/customers?${params.toString()}`, { token });

      if (Array.isArray(response)) {
        setCustomers(response);
        setPagination({
          page,
          limit,
          total: response.length,
          totalPages: response.length ? 1 : 0,
          hasNextPage: false,
          hasPrevPage: page > 1
        });
      } else {
        setCustomers(Array.isArray(response?.data) ? response.data : []);
        setPagination({
          page: Number(response?.pagination?.page) || page,
          limit: Number(response?.pagination?.limit) || limit,
          total: Number(response?.pagination?.total) || 0,
          totalPages: Number(response?.pagination?.totalPages) || 0,
          hasNextPage: Boolean(response?.pagination?.hasNextPage),
          hasPrevPage: Boolean(response?.pagination?.hasPrevPage)
        });
      }
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    loadCustomers();
  }, [page, limit, debouncedSearch]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

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
    setForm(emptyForm);
    setEditingId(null);
  }

  function validateForm() {
    const name = form.name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();
    const address = form.address.trim();

    if (!name) {
      return 'Client / brand adi zorunludur.';
    }

    if (name.length > 120) {
      return 'Client / brand adi en fazla 120 karakter olabilir.';
    }

    if (phone.length > 30) {
      return 'Telefon en fazla 30 karakter olabilir.';
    }

    if (phone && !/^[0-9+().\-\s]*$/.test(phone)) {
      return 'Telefon formati gecersiz.';
    }

    if (email.length > 120) {
      return 'E-posta en fazla 120 karakter olabilir.';
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return 'E-posta formati gecersiz.';
    }

    if (address.length > 255) {
      return 'Adres en fazla 255 karakter olabilir.';
    }

    return '';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const isEditing = Boolean(editingId);
    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError('');

      if (isEditing) {
        await apiRequest(`/customers/${editingId}`, {
          method: 'PUT',
          token,
          body: form
        });
      } else {
        await apiRequest('/customers', {
          method: 'POST',
          token,
          body: form
        });
      }

      resetForm();
      await loadCustomers();
      showSuccess(isEditing ? 'Client kaydi guncellendi.' : 'Yeni client kaydi eklendi.');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(customer) {
    setEditingId(customer.id);
    setForm({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || ''
    });
  }

  async function removeCustomer(id) {
    const shouldDelete = window.confirm('Bu client kaydini silmek istediginize emin misiniz?');

    if (!shouldDelete) {
      return;
    }

    try {
      setError('');
      await apiRequest(`/customers/${id}`, {
        method: 'DELETE',
        token
      });
      await loadCustomers();
      showSuccess('Client kaydi silindi.');
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  const totalCustomers = useMemo(() => Number(pagination.total) || customers.length, [pagination.total, customers.length]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clientlar"
        description="Client / brand kayitlarini guncel tutarak tekliften tahsilata kadar tum ajans akislarini hizlandirin"
      />

      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <div className="card">
          <h3 className="panel-title">
            {editingId ? 'Client Kaydini Duzenle' : 'Yeni Client Kaydi'}
          </h3>
          <p className="panel-description">Client iletisim ve marka bilgilerini tek merkezde yonetin.</p>

          <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-sm text-slate-600">Client / Brand Adi</label>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                maxLength={120}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-slate-600">Telefon</label>
              <input
                type="text"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                maxLength={30}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-slate-600">E-posta</label>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                maxLength={120}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-slate-600">Adres</label>
              <input
                type="text"
                value={form.address}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                maxLength={255}
              />
            </div>

            <div className="table-actions md:col-span-2">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Kaydediliyor...' : editingId ? 'Degisiklikleri Kaydet' : 'Client Ekle'}
              </button>
              {editingId ? (
                <button type="button" className="btn-secondary" onClick={resetForm}>
                  Iptal
                </button>
              ) : null}
            </div>
          </form>
        </div>

        <div className="stat-card">
          <p className="text-sm text-slate-500">Toplam Client</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{totalCustomers}</p>
          <p className="mt-3 text-xs text-slate-500">
            Duzenli client kartlari, teklif-fatura-donusturme surecini ciddi sekilde hizlandirir.
          </p>
          <div className="mt-4 chip">Agency CRM Core</div>
        </div>
      </div>

      {success ? <div className="status-success">{success}</div> : null}
      {error ? <div className="status-error">{error}</div> : null}

      <div className="card overflow-x-auto">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Kayitli client listesi ({totalCustomers}) - Sayfa {pagination.page}/{Math.max(1, pagination.totalPages || 1)}
          </p>
          <input
            type="text"
            placeholder="Client ara (brand, telefon, e-posta)"
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
              <th className="py-2 pr-4">Client / Brand</th>
              <th className="py-2 pr-4">Telefon</th>
              <th className="py-2 pr-4">E-posta</th>
              <th className="py-2 pr-4">Adres</th>
              <th className="py-2 pr-4">Kayit</th>
              <th className="py-2">Islemler</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-b border-slate-100">
                <td className="py-3 pr-4 font-medium text-slate-800">{customer.name}</td>
                <td className="table-cell-muted py-3 pr-4">{customer.phone || '-'}</td>
                <td className="table-cell-muted py-3 pr-4">{customer.email || '-'}</td>
                <td className="table-cell-muted py-3 pr-4">{customer.address || '-'}</td>
                <td className="table-cell-muted py-3 pr-4">
                  {customer.created_at ? formatDate(String(customer.created_at).slice(0, 10)) : '-'}
                </td>
                <td className="py-3">
                  <div className="table-actions">
                    <button type="button" className="btn-secondary" onClick={() => startEdit(customer)}>
                      Duzenle
                    </button>
                    <button
                      type="button"
                      className="btn-secondary border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => removeCustomer(customer.id)}
                    >
                      Sil
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {loading ? (
              <tr>
                <td className="py-8 text-center text-slate-500" colSpan={6}>
                  Client kayitlari yukleniyor...
                </td>
              </tr>
            ) : null}
            {!loading && customers.length === 0 ? (
              <tr>
                <td className="py-8 text-center text-slate-500" colSpan={6}>
                  Bu filtrede client bulunamadi.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">
            Toplam {totalCustomers} kayit, sayfa basi {pagination.limit} kayit
          </p>
          <div className="table-actions">
            <button
              type="button"
              className="btn-secondary px-3 py-2 text-xs"
              disabled={!pagination.hasPrevPage}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Onceki
            </button>
            <button
              type="button"
              className="btn-secondary px-3 py-2 text-xs"
              disabled={!pagination.hasNextPage}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Sonraki
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
