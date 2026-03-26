import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { abuseRateLimit } from '../middleware/abuseRateLimit.js';
import {
  createCustomerWorkflow,
  deleteCustomerWorkflow,
  updateCustomerWorkflow
} from '../services/customerWorkflowService.js';
import { countCustomers, listCustomers } from '../utils/customerRepository.js';
import { normalizeCustomerId, parseCustomerInput, validateCustomerInput } from '../utils/customerValidation.js';
import { normalizeListLimit, normalizeListPage, normalizeListQuery, normalizeWithMeta } from '../utils/listValidation.js';

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

    const rows = await listCustomers(req.user.id, {
      query,
      limit,
      offset,
      useWindow: shouldUseWindow
    });

    if (!withMeta) {
      res.json(rows);
      return;
    }

    const total = await countCustomers(req.user.id, { query });
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
    const customer = parseCustomerInput(req.body);
    validateCustomerInput(customer);

    const created = await createCustomerWorkflow({
      req,
      userId: req.user.id,
      customer
    });

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const customerId = normalizeCustomerId(req.params.id);
    const customer = parseCustomerInput(req.body);
    validateCustomerInput(customer);

    const updated = await updateCustomerWorkflow({
      req,
      userId: req.user.id,
      customerId,
      customer
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const customerId = normalizeCustomerId(req.params.id);
    await deleteCustomerWorkflow({
      req,
      userId: req.user.id,
      customerId
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
