import { Router } from 'express';
import { abuseRateLimit } from '../middleware/abuseRateLimit.js';
import { authenticate } from '../middleware/auth.js';
import { createQuoteWorkflow, deleteQuoteWorkflow, updateQuoteWorkflow } from '../services/quoteWorkflowService.js';
import { notFound } from '../utils/httpErrors.js';
import { writeDocumentPdf } from '../utils/pdf.js';
import { countQuotes, getQuoteWithItems, listQuotes } from '../utils/quoteRepository.js';
import {
  normalizeListLimit,
  normalizeListPage,
  normalizeListQuery,
  normalizeQuoteId,
  normalizeWithMeta
} from '../utils/quoteValidation.js';

const router = Router();

router.use(authenticate);
router.use(abuseRateLimit);

router.get('/', async (req, res, next) => {
  try {
    const query = normalizeListQuery(req.query.q);
    const limit = normalizeListLimit(req.query.limit);
    const page = normalizeListPage(req.query.page);
    const withMeta = normalizeWithMeta(req.query.withMeta);
    const offset = (page - 1) * limit;
    const shouldUseWindow = Boolean(query) || req.query.limit !== undefined || req.query.page !== undefined || withMeta;

    const rows = await listQuotes(req.user.id, {
      query,
      limit,
      offset,
      useWindow: shouldUseWindow
    });

    if (!withMeta) {
      res.json(rows);
      return;
    }

    const total = await countQuotes(req.user.id, { query });
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
    const created = await createQuoteWorkflow({
      req,
      userId: req.user.id,
      body: req.body
    });

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/pdf', async (req, res, next) => {
  try {
    const id = normalizeQuoteId(req.params.id);

    const quote = await getQuoteWithItems(req.user.id, id);

    if (!quote) {
      next(notFound('Teklif bulunamadi.'));
      return;
    }

    writeDocumentPdf(res, {
      companyName: req.user.companyName || process.env.COMPANY_NAME || 'Teklifim',
      documentType: 'Teklif',
      documentNumber: quote.quote_number,
      date: quote.date,
      customer: {
        name: quote.customer_name,
        phone: quote.customer_phone,
        email: quote.customer_email,
        address: quote.customer_address
      },
      items: quote.items,
      total: quote.total,
      projectSummary: quote.items?.map((item) => item.name).filter(Boolean).slice(0, 3).join(', ') || '-',
      paymentTerms: 'Onaydan sonra faturalandirma ve tahsilat takvimi baslatilir.'
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = normalizeQuoteId(req.params.id);

    const quote = await getQuoteWithItems(req.user.id, id);

    if (!quote) {
      next(notFound('Teklif bulunamadi.'));
      return;
    }

    res.json(quote);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = normalizeQuoteId(req.params.id);
    const updated = await updateQuoteWorkflow({
      req,
      userId: req.user.id,
      quoteId: id,
      body: req.body
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = normalizeQuoteId(req.params.id);
    await deleteQuoteWorkflow({
      req,
      userId: req.user.id,
      quoteId: id
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
