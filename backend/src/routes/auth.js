import { Router } from 'express';
import { authRateLimit } from '../middleware/authRateLimit.js';
import { authenticate } from '../middleware/auth.js';
import {
  getAuthMeWorkflow,
  loginWorkflow,
  registerWorkflow
} from '../services/authWorkflowService.js';

const router = Router();

router.post('/register', authRateLimit, async (req, res, next) => {
  try {
    const payload = await registerWorkflow({
      req,
      body: req.body
    });

    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
});

router.post('/login', authRateLimit, async (req, res, next) => {
  try {
    const payload = await loginWorkflow({
      req,
      body: req.body
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const payload = await getAuthMeWorkflow(req.user.id);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

export default router;
