import { Link } from 'react-router-dom';
import { ACTION_LABELS, EMPTY_STATE_LABELS } from '../../constants/uiText';

export default function QuoteListSection({
  quotes,
  loading,
  search,
  totalQuotes,
  pageTotal,
  pagination,
  onSearchChange,
  onStartEdit,
  onExportPdf,
  onRemoveQuote,
  onPrevPage,
  onNextPage,
  formatCurrency,
  formatDate
}) {
  return (
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
          onChange={(event) => onSearchChange(event.target.value)}
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
                  <button type="button" className="btn-secondary" onClick={() => onStartEdit(quote.id)}>
                    {ACTION_LABELS.edit}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => onExportPdf(quote)}>
                    PDF
                  </button>
                  <button
                    type="button"
                    className="btn-secondary border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => onRemoveQuote(quote)}
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
            onClick={onPrevPage}
          >
            {ACTION_LABELS.previous}
          </button>
          <button
            type="button"
            className="btn-secondary px-3 py-2 text-xs"
            disabled={!pagination.hasNextPage}
            onClick={onNextPage}
          >
            {ACTION_LABELS.next}
          </button>
        </div>
      </div>
    </div>
  );
}
