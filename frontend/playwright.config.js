import { defineConfig, devices } from '@playwright/test';

const backendPort = process.env.E2E_BACKEND_PORT || '4010';
const frontendPort = process.env.E2E_FRONTEND_PORT || '5199';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    trace: 'on-first-retry'
  },
  webServer: [
    {
      command: `cd ../backend && rm -f e2e.sqlite e2e.sqlite-wal e2e.sqlite-shm e2e.sqlite-journal && JWT_SECRET=e2e_secret CORS_ORIGIN=http://127.0.0.1:${frontendPort} BILLING_INTERNAL_TOKEN=e2e_billing_token METRICS_INTERNAL_TOKEN=e2e_metrics_token DB_PATH=./e2e.sqlite DEMO_PASSWORD=123456 PORT=${backendPort} npm run seed && JWT_SECRET=e2e_secret CORS_ORIGIN=http://127.0.0.1:${frontendPort} BILLING_INTERNAL_TOKEN=e2e_billing_token METRICS_INTERNAL_TOKEN=e2e_metrics_token DB_PATH=./e2e.sqlite PORT=${backendPort} npm run dev`,
      url: `http://127.0.0.1:${backendPort}/health`,
      reuseExistingServer: false,
      timeout: 120_000
    },
    {
      command: `VITE_API_URL=http://127.0.0.1:${backendPort}/api npm run dev -- --host 127.0.0.1 --port ${frontendPort}`,
      url: `http://127.0.0.1:${frontendPort}`,
      reuseExistingServer: false,
      timeout: 120_000
    }
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome']
      }
    }
  ]
});
