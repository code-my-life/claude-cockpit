import { defineConfig } from '@playwright/test'

// One Electron app at a time: the island is always on top and the tests move the focus between windows.
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: './results',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { outputFolder: './report', open: 'never' }]] : 'list',
})
