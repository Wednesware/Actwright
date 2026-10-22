import { defineConfig } from '@playwright/test';

// Exercise the deployment artifact: no Vite dev proxy and no Python companion.
export default defineConfig({
  testDir: './tests/static',
  timeout: 180_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview -- --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env['CI'] },
});
