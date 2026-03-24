import cors from 'cors';
import express from 'express';
import { getMetricsSnapshot, metricsMiddleware } from './middleware/metrics.js';
import { requestContext } from './middleware/requestContext.js';
import { requestLogger } from './middleware/requestLogger.js';
import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customers.js';
import dashboardRoutes from './routes/dashboard.js';
import invoiceRoutes from './routes/invoices.js';
import quoteRoutes from './routes/quotes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './utils/httpErrors.js';

const app = express();

function resolveTrustProxySetting() {
  const value = String(process.env.TRUST_PROXY || '').trim().toLowerCase();
  return ['1', 'true', 'yes'].includes(value);
}

app.set('trust proxy', resolveTrustProxySetting());

function parseAllowedOrigins() {
  const raw = process.env.CORS_ORIGIN || '';
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set(origins);
}

const allowedOrigins = parseAllowedOrigins();
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('CORS blocked for origin'));
  }
};

app.use(cors(corsOptions));
app.use(requestContext);
app.use(requestLogger);
app.use(metricsMiddleware);
app.use(express.json({ limit: '200kb' }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Number(process.uptime().toFixed(2))
  });
});

app.get('/health/metrics', (req, res) => {
  if (process.env.NODE_ENV !== 'test') {
    const internalToken = typeof process.env.METRICS_INTERNAL_TOKEN === 'string'
      ? process.env.METRICS_INTERNAL_TOKEN.trim()
      : '';
    const requestToken = typeof req.headers['x-metrics-token'] === 'string'
      ? req.headers['x-metrics-token'].trim()
      : '';

    if (!internalToken || !requestToken || requestToken !== internalToken) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Metrics endpointine erisim yetkiniz yok.'
        }
      });
      return;
    }
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    metrics: getMetricsSnapshot()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use((req, res, next) => {
  next(notFound('Endpoint bulunamadi.'));
});

app.use(errorHandler);

export default app;
