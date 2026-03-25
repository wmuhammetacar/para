import { Router } from 'express';
import { abuseRateLimit } from '../middleware/abuseRateLimit.js';
import { authenticate } from '../middleware/auth.js';
import {
  PLAN_CHANGE_REQUEST_TTL_MINUTES,
  assertBillingAuthorized,
  isRequestExpired,
  normalizePaymentReference,
  normalizePlanChangeRequestId,
  normalizePlanPatch
} from '../utils/dashboardValidation.js';
import {
  getDashboardActivation,
  getDashboardActivity,
  getDashboardGrowth,
  getDashboardPilotReadiness,
  getDashboardStats
} from '../services/dashboardService.js';
import {
  applyPlanChangeWorkflow,
  confirmPlanChangeRequestWorkflow,
  createPlanChangeRequestWorkflow,
  getPlanSnapshotWorkflow
} from '../services/planWorkflowService.js';

const router = Router();

router.use(authenticate);
router.use(abuseRateLimit);

router.get('/stats', async (req, res, next) => {
  try {
    const payload = await getDashboardStats({
      userId: req.user.id,
      query: req.query
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get('/activity', async (req, res, next) => {
  try {
    const payload = await getDashboardActivity({
      userId: req.user.id,
      query: req.query
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get('/growth', async (req, res, next) => {
  try {
    const payload = await getDashboardGrowth({
      userId: req.user.id,
      query: req.query
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get('/pilot-readiness', async (req, res, next) => {
  try {
    const payload = await getDashboardPilotReadiness({
      userId: req.user.id,
      query: req.query
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get('/plan', async (req, res, next) => {
  try {
    const payload = await getPlanSnapshotWorkflow(req.user.id);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.post('/plan/change-request', async (req, res, next) => {
  try {
    const planCode = normalizePlanPatch(req.body.planCode);
    const payload = await createPlanChangeRequestWorkflow({
      req,
      userId: req.user.id,
      planCode,
      ttlMinutes: PLAN_CHANGE_REQUEST_TTL_MINUTES
    });

    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
});

router.post('/plan/change-request/:id/confirm', async (req, res, next) => {
  try {
    assertBillingAuthorized(req);
    const requestId = normalizePlanChangeRequestId(req.params.id);
    const paymentReference = normalizePaymentReference(req.body.paymentReference);

    const payload = await confirmPlanChangeRequestWorkflow({
      req,
      requestId,
      paymentReference,
      isExpired: isRequestExpired
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.patch('/plan', async (req, res, next) => {
  try {
    const planCode = normalizePlanPatch(req.body.planCode);
    const planChangeRequestId = normalizePlanChangeRequestId(req.body.planChangeRequestId);

    const payload = await applyPlanChangeWorkflow({
      req,
      userId: req.user.id,
      planCode,
      planChangeRequestId,
      isExpired: isRequestExpired
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get('/activation', async (req, res, next) => {
  try {
    const payload = await getDashboardActivation({
      userId: req.user.id
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

export default router;
