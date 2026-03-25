import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { apiRequest, downloadPdf, formatCurrency, formatDate } from '../api';
import { useAuth } from '../contexts/AuthContext';

export default function QuoteDetailPage() {
  const { token } = useAuth();
  const { id } = useParams();
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const successTimerRef = useRef(null);

  useEffect(() => {
    async function fetchQuote() {
      const quoteId = Number(id);
      if (!Number.isInteger(quoteId) || quoteId <= 0) {
        setError('Gecersiz teklif id.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const data = await apiRequest(`/quotes/${quoteId}`, { token });
        setQuote(data);
      } catch (fetchError) {
        setError(fetchError.message);
      } finally {
        setLoading(false);
      }
    }

    fetchQuote();
  }, [id, token]);

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

  async function handlePdfExport() {
    if (!quote) {
      return;
    }

    try {
      setError('');
      await downloadPdf(`/quotes/${quote.id}/pdf`, token, `${quote.quote_number}.pdf`);
      showSuccess(`PDF indirildi: ${quote.quote_number}.pdf`);
    } catch (pdfError) {
      setError(pdfError.message);
    }
  }

  const itemCount = useMemo(() => quote?.items?.length || 0, [quote]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teklif Detayi"
        description="Musteri bilgileri ve teklif kalemleri"
        actions={
          <>
            <Link to="/quotes" className="btn-secondary">
              Listeye Don
            </Link>
            {quote ? (
              <Link to={`/quotes?edit=${quote.id}`} className="btn-secondary">
                Duzenlemeye Git
              </Link>
            ) : null}
            <button type="button" className="btn-primary" onClick={handlePdfExport} disabled={!quote}>
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

      {!loading && quote ? (
        <>
          <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <div className="card">
              <h3 className="panel-title">Teklif Ozeti</h3>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-slate-500">Teklif No:</span>{' '}
                  <span className="font-semibold text-slate-900">{quote.quote_number}</span>
                </p>
                <p>
                  <span className="text-slate-500">Tarih:</span>{' '}
                  <span className="font-medium text-slate-800">{formatDate(quote.date)}</span>
                </p>
                <p>
                  <span className="text-slate-500">Musteri:</span>{' '}
                  <span className="font-medium text-slate-800">{quote.customer_name || '-'}</span>
                </p>
                <p>
                  <span className="text-slate-500">Telefon:</span>{' '}
                  <span className="font-medium text-slate-800">{quote.customer_phone || '-'}</span>
                </p>
                <p className="sm:col-span-2">
                  <span className="text-slate-500">E-posta:</span>{' '}
                  <span className="font-medium text-slate-800">{quote.customer_email || '-'}</span>
                </p>
                <p className="sm:col-span-2">
                  <span className="text-slate-500">Adres:</span>{' '}
                  <span className="font-medium text-slate-800">{quote.customer_address || '-'}</span>
                </p>
              </div>
            </div>

            <div className="stat-card">
              <p className="text-sm text-slate-500">Hizmet Kalemi</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{itemCount}</p>
              <p className="mt-4 text-sm text-slate-500">Teklif Toplami</p>
              <p className="mt-1 text-lg font-semibold text-brand-700">{formatCurrency(quote.total)}</p>
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
                {quote.items?.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4 font-medium text-slate-800">{item.name}</td>
                    <td className="table-cell-muted py-3 pr-4">{item.quantity}</td>
                    <td className="table-cell-muted py-3 pr-4">{formatCurrency(item.unit_price)}</td>
                    <td className="py-3 pr-4 font-semibold text-slate-900">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
                {!quote.items?.length ? (
                  <tr>
                    <td className="py-8 text-center text-slate-500" colSpan={4}>
                      Hizmet kalemi bulunamadi.
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
