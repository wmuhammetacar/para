import { Link } from 'react-router-dom';
import { ACTION_LABELS, EMPTY_STATE_LABELS, STATUS_FILTER_LABELS } from '../../constants/uiText';

const statusOptions = [
  { key: 'all', label: STATUS_FILTER_LABELS.allInvoices },
  { key: 'pending', label: STATUS_FILTER_LABELS.pending },
  { key: 'overdue', label: STATUS_FILTER_LABELS.overdue },
  { key: 'paid', label: STATUS_FILTER_LABELS.paid }
];

export default function InvoiceListSection({
  invoices,
  loading,
  pagination,
  totalInvoices,
  invoicesTotal,
  pendingReceivable,
  overdueReceivable,
  statusFilter,
  selectedCount,
  search,
  allVisibleSelected,
  selectedInvoiceIds,
  savingBulkStatus,
  sendingReminderKey,
  onStatusFilterChange,
  onBulkUpdatePaymentStatus,
  onClearSelection,
  onSearchChange,
  onToggleSelectAllVisible,
  onToggleInvoiceSelection,
  onStartEdit,
  onExportPdf,
  onSendReminder,
  onUpdatePaymentStatus,
  onRemoveInvoice,
  onPrevPage,
  onNextPage,
  paymentStatusLabel,
  paymentStatusClasses,
  resolveDueDate,
  formatCurrency,
  formatDate
}) {
  return (
    <div className="card overflow-x-auto">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Fatura listesi</h3>
          <p className="text-xs text-slate-500">Bekleyen ve geciken faturalara odaklanin.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="chip">Acik: {formatCurrency(pendingReceivable)}</span>
          <span className="chip">Geciken: {formatCurrency(overdueReceivable)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-600">Durum:</span>
        {statusOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            className={statusFilter === option.key ? 'btn-primary px-3 py-2 text-xs' : 'btn-secondary px-3 py-2 text-xs'}
            onClick={() => onStatusFilterChange(option.key)}
          >
            {option.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">Secili kayit: {selectedCount}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onBulkUpdatePaymentStatus('paid')}
          disabled={savingBulkStatus || selectedCount === 0}
        >
          {savingBulkStatus ? 'Isleniyor...' : 'Secilenleri tahsil et'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onBulkUpdatePaymentStatus('pending')}
          disabled={savingBulkStatus || selectedCount === 0}
        >
          Secilenleri takibe al
        </button>
        {selectedCount > 0 ? (
          <button type="button" className="btn-secondary" onClick={onClearSelection}>
            {ACTION_LABELS.clearSelection}
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          Faturalar ({totalInvoices}) - Sayfa {pagination.page}/{Math.max(1, pagination.totalPages || 1)} - Bu sayfa:{' '}
          {formatCurrency(invoicesTotal)}
        </p>
        <input
          type="text"
          placeholder="Fatura ara (no, musteri, tarih)"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="sm:max-w-xs"
        />
      </div>

      <table className="mt-3 min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-2 pr-3">
              <input type="checkbox" checked={allVisibleSelected} onChange={onToggleSelectAllVisible} />
            </th>
            <th className="py-2 pr-4">No</th>
            <th className="py-2 pr-4">Musteri</th>
            <th className="py-2 pr-4">Tarih</th>
            <th className="py-2 pr-4">Vade</th>
            <th className="py-2 pr-4">Durum</th>
            <th className="py-2 pr-4">Toplam</th>
            <th className="py-2">Islemler</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="border-b border-slate-100">
              <td className="py-3 pr-3">
                <input
                  type="checkbox"
                  checked={selectedInvoiceIds.includes(invoice.id)}
                  onChange={() => onToggleInvoiceSelection(invoice.id)}
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
                <div className="row-actions">
                  <Link to={`/invoices/${invoice.id}`} className="btn-secondary">
                    {ACTION_LABELS.detail}
                  </Link>
                  <button type="button" className="btn-secondary" onClick={() => onStartEdit(invoice.id)}>
                    {ACTION_LABELS.edit}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => onExportPdf(invoice)}>
                    PDF
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => onSendReminder(invoice, 'whatsapp')}
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
                    onClick={() => onSendReminder(invoice, 'email')}
                    disabled={sendingReminderKey === `${invoice.id}:email` || (invoice.payment_status || 'pending') === 'paid'}
                  >
                    {sendingReminderKey === `${invoice.id}:email` ? 'Hazirlaniyor...' : 'E-posta Hatirlat'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => onUpdatePaymentStatus(invoice, (invoice.payment_status || 'pending') === 'paid' ? 'pending' : 'paid')}
                  >
                    {(invoice.payment_status || 'pending') === 'paid' ? 'Takibe Al' : 'Tahsil Edildi'}
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => onRemoveInvoice(invoice)}
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
        <p className="text-xs text-slate-500">Toplam {totalInvoices} kayit, sayfa basi {pagination.limit} kayit</p>
        <div className="row-actions">
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
