import { defineConfig } from '@playwright/test';

const port = Number(process.env['ACTWRIGHT_PORT'] ?? 5173);
const runtimePort = Number(process.env['ACTWRIGHT_RUNTIME_PORT'] ?? 8765);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list'], ['json', { outputFile: 'test-results/browser-results.json' }]],
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env['ACTWRIGHT_CHROMIUM'] ? { executablePath: process.env['ACTWRIGHT_CHROMIUM'] } : {},
  },
  webServer: [{
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
  }, {
    command: 'npm run runtime',
    url: `http://127.0.0.1:${runtimePort}/api/runtime`,
    reuseExistingServer: !process.env['CI'],
  }],
});
