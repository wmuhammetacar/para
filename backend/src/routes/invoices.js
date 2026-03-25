import { Router } from 'express';
import { abuseRateLimit } from '../middleware/abuseRateLimit.js';
import { authenticate } from '../middleware/auth.js';
import {
  countInvoices,
  getInvoiceWithItems,
  listInvoices
} from '../utils/invoiceRepository.js';
import {
  getReminderPolicyFromEnv,
  normalizeEntityId,
  normalizeListLimit,
  normalizeListPage,
  normalizeListQuery,
  normalizeListStatusFilter,
  normalizeWithMeta
} from '../utils/invoiceValidation.js';
import { notFound } from '../utils/httpErrors.js';
import { writeDocumentPdf } from '../utils/pdf.js';
import {
  createInvoiceWorkflow,
  deleteInvoiceWorkflow,
  updateBulkInvoicePaymentWorkflow,
  updateInvoicePaymentWorkflow,
  updateInvoiceWorkflow
} from '../services/invoiceWorkflowService.js';
import {
  createInvoiceReminderWorkflow,
  getReminderOpsOverview,
  listInvoiceRemindersWorkflow,
  normalizeReminderOpsFilters,
  retryInvoiceReminderWorkflow
} from '../services/invoiceReminderService.js';

const router = Router();
const reminderPolicy = getReminderPolicyFromEnv();

router.use(authenticate);
router.use(abuseRateLimit);

router.get('/', async (req, res, next) => {
  try {
    const statusFilter = normalizeListStatusFilter(req.query.status);
    const query = normalizeListQuery(req.query.q);
    const limit = normalizeListLimit(req.query.limit);
    const page = normalizeListPage(req.query.page);
    const withMeta = normalizeWithMeta(req.query.withMeta);
    const offset = (page - 1) * limit;
    const shouldUseWindow = Boolean(query) || req.query.limit !== undefined || req.query.page !== undefined || withMeta;

    const rows = await listInvoices(req.user.id, {
      status: statusFilter,
      query,
      limit,
      offset,
      useWindow: shouldUseWindow
    });

    if (!withMeta) {
      res.json(rows);
      return;
    }

    const total = await countInvoices(req.user.id, {
      status: statusFilter,
      query
    });
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const created = await createInvoiceWorkflow({
      req,
      userId: req.user.id,
      body: req.body
    });

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.patch('/payment/bulk', async (req, res, next) => {
  try {
    const result = await updateBulkInvoicePaymentWorkflow({
      req,
      userId: req.user.id,
      body: req.body
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/reminders/ops', async (req, res, next) => {
  try {
    const filters = normalizeReminderOpsFilters(req.query);
    const result = await getReminderOpsOverview({
      userId: req.user.id,
      filters,
      reminderPolicy
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/reminders/:reminderId/retry', async (req, res, next) => {
  try {
    const reminderId = normalizeEntityId(req.params.reminderId, 'reminderId', 'Gecersiz hatirlatma id.');
    const updatedReminder = await retryInvoiceReminderWorkflow({
      req,
      userId: req.user.id,
      reminderId,
      reminderPolicy
    });

    res.json(updatedReminder);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/reminders', async (req, res, next) => {
  try {
    const id = normalizeEntityId(req.params.id, 'id', 'Gecersiz fatura id.');
    const reminders = await listInvoiceRemindersWorkflow({
      userId: req.user.id,
      invoiceId: id
    });

    res.json(reminders);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/reminders', async (req, res, next) => {
  try {
    const id = normalizeEntityId(req.params.id, 'id', 'Gecersiz fatura id.');

    const reminder = await createInvoiceReminderWorkflow({
      req,
      userId: req.user.id,
      invoiceId: id,
      body: req.body,
      companyName: req.user.companyName
    });

    res.status(201).json(reminder);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/pdf', async (req, res, next) => {
  try {
    const id = normalizeEntityId(req.params.id, 'id', 'Gecersiz fatura id.');

    const invoice = await getInvoiceWithItems(req.user.id, id);

    if (!invoice) {
      next(notFound('Fatura bulunamadi.'));
      return;
    }

    writeDocumentPdf(res, {
      companyName: req.user.companyName || process.env.COMPANY_NAME || 'Teklifim',
      documentType: 'Fatura',
      documentNumber: invoice.invoice_number,
      date: invoice.date,
      dueDate: invoice.due_date,
      paymentStatus: invoice.payment_status,
      paidAt: invoice.paid_at,
      customer: {
        name: invoice.customer_name,
        phone: invoice.customer_phone,
        email: invoice.customer_email,
        address: invoice.customer_address
      },
      items: invoice.items,
      total: invoice.total,
      projectSummary: invoice.items?.map((item) => item.name).filter(Boolean).slice(0, 3).join(', ') || '-',
      paymentTerms: `Odeme vadesi ${invoice.due_date || invoice.date}. Odeme referansinda ${invoice.invoice_number} belirtin.`
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = normalizeEntityId(req.params.id, 'id', 'Gecersiz fatura id.');

    const invoice = await getInvoiceWithItems(req.user.id, id);

    if (!invoice) {
      next(notFound('Fatura bulunamadi.'));
      return;
    }

    res.json(invoice);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = normalizeEntityId(req.params.id, 'id', 'Gecersiz fatura id.');
    const updated = await updateInvoiceWorkflow({
      req,
      userId: req.user.id,
      invoiceId: id,
      body: req.body
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/payment', async (req, res, next) => {
  try {
    const id = normalizeEntityId(req.params.id, 'id', 'Gecersiz fatura id.');
    const updated = await updateInvoicePaymentWorkflow({
      req,
      userId: req.user.id,
      invoiceId: id,
      body: req.body
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = normalizeEntityId(req.params.id, 'id', 'Gecersiz fatura id.');
    await deleteInvoiceWorkflow({
      req,
      userId: req.user.id,
      invoiceId: id
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
