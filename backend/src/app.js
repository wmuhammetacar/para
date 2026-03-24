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
    if (!origin || allowedOrigins.size === 0 || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
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
