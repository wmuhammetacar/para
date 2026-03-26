import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { apiRequest, downloadPdf, formatCurrency, formatDate } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useTimedMessage } from '../hooks/useTimedMessage';

function isOverdue(invoice) {
  if (!invoice) {
    return false;
  }

  if ((invoice.payment_status || 'pending') !== 'pending') {
    return false;
  }

  if (invoice.is_overdue !== undefined && invoice.is_overdue !== null) {
    return Number(invoice.is_overdue) === 1;
  }

  const dueDate = invoice.due_date || invoice.date;
  if (!dueDate) {
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}

function paymentStatusLabel(invoice) {
  if ((invoice?.payment_status || 'pending') === 'paid') {
    return 'Tahsil Edildi';
  }

  if (isOverdue(invoice)) {
    return 'Gecikmede';
  }

  return 'Takipte';
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

function reminderStatusLabel(status) {
  if (status === 'sent') {
    return 'Gonderildi';
  }

  if (status === 'failed') {
    return 'Hata';
  }

  return 'Kuyrukta';
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const normalizedValue = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalizedValue);

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

export default function InvoiceDetailPage() {
  const { token } = useAuth();
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingReminders, setLoadingReminders] = useState(false);
  const [sendingReminder, setSendingReminder] = useState('');
  const [error, setError] = useState('');
  const { message: success, showMessage: showSuccess } = useTimedMessage();

  useEffect(() => {
    async function fetchInvoice() {
      const invoiceId = Number(id);
      if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
        setError('Gecersiz fatura id.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const [invoiceData, reminderData] = await Promise.all([
          apiRequest(`/invoices/${invoiceId}`, { token }),
          apiRequest(`/invoices/${invoiceId}/reminders`, { token })
        ]);
        setInvoice(invoiceData);
        setReminders(Array.isArray(reminderData) ? reminderData : []);
      } catch (fetchError) {
        setError(fetchError.message);
      } finally {
        setLoading(false);
      }
    }

    fetchInvoice();
  }, [id, token]);

  async function handlePdfExport() {
    if (!invoice) {
      return;
    }

    try {
      setError('');
      await downloadPdf(`/invoices/${invoice.id}/pdf`, token, `${invoice.invoice_number}.pdf`);
      showSuccess(`PDF indirildi: ${invoice.invoice_number}.pdf`);
    } catch (pdfError) {
      setError(pdfError.message);
    }
  }

  async function handlePaymentStatus(status) {
    if (!invoice) {
      return;
    }

    try {
      setError('');
      const updated = await apiRequest(`/invoices/${invoice.id}/payment`, {
        method: 'PATCH',
        token,
        body: {
          status
        }
      });
      setInvoice(updated);
      showSuccess(status === 'paid' ? 'Fatura tahsil edildi olarak isaretlendi.' : 'Fatura takibe geri alindi.');
    } catch (updateError) {
      setError(updateError.message);
    }
  }

  async function refreshReminders(invoiceId) {
    setLoadingReminders(true);

    try {
      const reminderData = await apiRequest(`/invoices/${invoiceId}/reminders`, { token });
      setReminders(Array.isArray(reminderData) ? reminderData : []);
    } finally {
      setLoadingReminders(false);
    }
  }

  async function handleReminder(channel) {
    if (!invoice) {
      return;
    }

    try {
      setSendingReminder(channel);
      setError('');
      const response = await apiRequest(`/invoices/${invoice.id}/reminders`, {
        method: 'POST',
        token,
        body: {
          channel
        }
      });

      await refreshReminders(invoice.id);

      if (channel === 'whatsapp' && response?.delivery_url) {
        window.open(response.delivery_url, '_blank', 'noopener,noreferrer');
        showSuccess('WhatsApp hatirlatmasi hazirlandi.');
      } else {
        showSuccess('Hatirlatma kuyruga alindi.');
      }
    } catch (reminderError) {
      setError(reminderError.message);
    } finally {
      setSendingReminder('');
    }
  }

  const itemCount = useMemo(() => invoice?.items?.length || 0, [invoice]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fatura Detayi"
        description="Tahsilat durumu ve fatura kalemleri"
        actions={
          <>
            <Link to="/invoices" className="btn-secondary">
              Listeye Don
            </Link>
            {invoice ? (
              <Link to={`/invoices?edit=${invoice.id}`} className="btn-secondary">
                Duzenlemeye Git
              </Link>
            ) : null}
            {invoice ? (
              <button
                type="button"
                className="btn-secondary"
                disabled={(invoice.payment_status || 'pending') === 'paid' || sendingReminder === 'whatsapp'}
                onClick={() => handleReminder('whatsapp')}
              >
                {sendingReminder === 'whatsapp' ? 'Hazirlaniyor...' : 'WhatsApp Hatirlat'}
              </button>
            ) : null}
            {invoice ? (
              <button
                type="button"
                className="btn-secondary"
                disabled={(invoice.payment_status || 'pending') === 'paid' || sendingReminder === 'email'}
                onClick={() => handleReminder('email')}
              >
                {sendingReminder === 'email' ? 'Hazirlaniyor...' : 'E-posta Hatirlat'}
              </button>
            ) : null}
            {invoice ? (
              <button
                type="button"
                className={
                  (invoice.payment_status || 'pending') === 'paid'
                    ? 'btn-secondary'
                    : 'btn-secondary border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                }
                onClick={() =>
                  handlePaymentStatus((invoice.payment_status || 'pending') === 'paid' ? 'pending' : 'paid')
                }
              >
                {(invoice.payment_status || 'pending') === 'paid' ? 'Takibe Al' : 'Tahsil Edildi'}
              </button>
            ) : null}
            <button type="button" className="btn-primary" onClick={handlePdfExport} disabled={!invoice}>
              PDF Indir
            </button>
          </>
        }
      />

      {success ? <div className="status-success">{success}</div> : null}
      {error ? <div className="status-error">{error}</div> : null}

      {loading ? (
        <div className="card animate-pulse">
          <div className="h-4 w-40 rounded bg-slate-200" />
          <div className="mt-4 h-3 w-72 rounded bg-slate-100" />
          <div className="mt-2 h-3 w-64 rounded bg-slate-100" />
        </div>
      ) : null}

      {!loading && invoice ? (
        <>
          <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <div className="card">
              <h3 className="panel-title">Fatura Ozeti</h3>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-slate-500">Fatura No:</span>{' '}
                  <span className="font-semibold text-slate-900">{invoice.invoice_number}</span>
                </p>
                <p>
                  <span className="text-slate-500">Tarih:</span>{' '}
                  <span className="font-medium text-slate-800">{formatDate(invoice.date)}</span>
                </p>
                <p>
                  <span className="text-slate-500">Vade:</span>{' '}
                  <span className="font-medium text-slate-800">{formatDate(invoice.due_date || invoice.date)}</span>
                </p>
                <p>
                  <span className="text-slate-500">Musteri:</span>{' '}
                  <span className="font-medium text-slate-800">{invoice.customer_name || '-'}</span>
                </p>
                <p>
                  <span className="text-slate-500">Telefon:</span>{' '}
                  <span className="font-medium text-slate-800">{invoice.customer_phone || '-'}</span>
                </p>
                <p className="sm:col-span-2">
                  <span className="text-slate-500">E-posta:</span>{' '}
                  <span className="font-medium text-slate-800">{invoice.customer_email || '-'}</span>
                </p>
                <p className="sm:col-span-2">
                  <span className="text-slate-500">Adres:</span>{' '}
                  <span className="font-medium text-slate-800">{invoice.customer_address || '-'}</span>
                </p>
                <p className="sm:col-span-2">
                  <span className="text-slate-500">Odeme Durumu:</span>{' '}
                  <span className="font-medium text-slate-800">{paymentStatusLabel(invoice)}</span>
                </p>
                <p className="sm:col-span-2">
                  <span className="text-slate-500">Tahsil Tarihi:</span>{' '}
                  <span className="font-medium text-slate-800">{formatDate(invoice.paid_at)}</span>
                </p>
                <p className="sm:col-span-2">
                  <span className="text-slate-500">Kaynak Teklif:</span>{' '}
                  {invoice.quote_id ? (
                    <Link to={`/quotes/${invoice.quote_id}`} className="font-medium text-brand-700 hover:underline">
                      #{invoice.quote_id}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-800">-</span>
                  )}
                </p>
              </div>
            </div>

            <div className="stat-card">
              <p className="text-sm text-slate-500">Hizmet Kalemi</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{itemCount}</p>
              <p className="mt-4 text-sm text-slate-500">Fatura Toplami</p>
              <p className="mt-1 text-lg font-semibold text-brand-700">{formatCurrency(invoice.total)}</p>
              <p className="mt-4 text-sm text-slate-500">Tahsilat Durumu</p>
              <p
                className={`mt-1 text-sm font-semibold ${
                  (invoice.payment_status || 'pending') === 'paid'
                    ? 'text-emerald-700'
                    : isOverdue(invoice)
                      ? 'text-rose-700'
                      : 'text-amber-700'
                }`}
              >
                {paymentStatusLabel(invoice)}
              </p>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <h3 className="text-lg font-semibold text-slate-900">Hizmet Kalemleri</h3>
            <table className="mt-4 min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Kalem</th>
                  <th className="py-2 pr-4">Miktar</th>
                  <th className="py-2 pr-4">Birim Fiyat</th>
                  <th className="py-2 pr-4">Toplam</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items?.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4 font-medium text-slate-800">{item.name}</td>
                    <td className="table-cell-muted py-3 pr-4">{item.quantity}</td>
                    <td className="table-cell-muted py-3 pr-4">{formatCurrency(item.unit_price)}</td>
                    <td className="py-3 pr-4 font-semibold text-slate-900">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
                {!invoice.items?.length ? (
                  <tr>
                    <td className="py-8 text-center text-slate-500" colSpan={4}>
                      Hizmet kalemi bulunamadi.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="card overflow-x-auto">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900">Tahsilat Hatirlatma Gecmisi</h3>
              {loadingReminders ? <p className="text-xs text-slate-500">Guncelleniyor...</p> : null}
            </div>
            <table className="mt-4 min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Kanal</th>
                  <th className="py-2 pr-4">Alici</th>
                  <th className="py-2 pr-4">Durum</th>
                  <th className="py-2 pr-4">Olusturma</th>
                  <th className="py-2 pr-4">Islenme</th>
                </tr>
              </thead>
              <tbody>
                {reminders.map((reminder) => (
                  <tr key={reminder.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4 font-medium text-slate-800">
                      {reminderChannelLabel(reminder.channel)}
                    </td>
                    <td className="table-cell-muted py-3 pr-4">{reminder.recipient || '-'}</td>
                    <td className="table-cell-muted py-3 pr-4">{reminderStatusLabel(reminder.status)}</td>
                    <td className="table-cell-muted py-3 pr-4">{formatDateTime(reminder.created_at)}</td>
                    <td className="table-cell-muted py-3 pr-4">{formatDateTime(reminder.processed_at)}</td>
                  </tr>
                ))}
                {!reminders.length ? (
                  <tr>
                    <td className="py-8 text-center text-slate-500" colSpan={5}>
                      Hatirlatma kaydi bulunamadi.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
