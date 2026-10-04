import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  // Reduced motion: pulsing buttons never settle, and Playwright only clicks settled elements.
  use: { baseURL: 'http://localhost:4173', reducedMotion: 'reduce' },
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: 'iphone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'ipad-webkit', use: { ...devices['Desktop Safari'], viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
