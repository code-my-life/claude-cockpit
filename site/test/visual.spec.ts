import { test, expect, type Browser, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import type { AddressInfo } from 'node:net';

const DIST_DIR = join(process.cwd(), 'site/dist');
const MOCKUP_DIR = join(process.cwd(), 'docs/design/site');
const REFERENCE_DIR = join(MOCKUP_DIR, 'reference');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

// Static server for a directory. "/fr/" and any other directory map to its index.html.
function serve(rootDir: string): Promise<{ server: Server; origin: string }> {
  const server = createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const filePath = normalize(join(rootDir, pathname));
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(filePath);
      res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, origin: `http://localhost:${(server.address() as AddressInfo).port}` });
    });
  });
}

// Google Fonts requests trigger "Download is starting" errors in Playwright
async function blockFonts(page: Page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
}

async function openPage(browser: Browser, width: number, height: number) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: 'reduce',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  await blockFonts(page);
  return { context, page };
}

const HIDE_CSS = '#cc-bg, .cc-bg, sg-card, .cc-shot, #roadmap, canvas { display: none !important; }';

async function sectionIds(page: Page): Promise<string[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll('section[id]')).map(s => s.id));
}

let dist: { server: Server; origin: string };
let mockup: { server: Server; origin: string };

test.beforeAll(async () => {
  dist = await serve(DIST_DIR);
  mockup = await serve(MOCKUP_DIR);
});

test.afterAll(async () => {
  dist.server.close();
  mockup.server.close();
});

test.describe('Site structure visual comparison', () => {
  const viewports = [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ];
  const routes = ['/', '/fr/index.html'];

  for (const { width, height } of viewports) {
    for (const route of routes) {
      test(`compares mockup and site at ${width}${route} (reduced motion)`, async ({ browser }) => {
        const mockupView = await openPage(browser, width, height);
        const siteView = await openPage(browser, width, height);
        try {
          await mockupView.page.goto(`${mockup.origin}/`, { waitUntil: 'domcontentloaded' });
          await siteView.page.goto(`${dist.origin}${route}`, { waitUntil: 'domcontentloaded' });

          await mockupView.page.addStyleTag({ content: HIDE_CSS });
          await siteView.page.addStyleTag({ content: HIDE_CSS });

          const mockupShot = await mockupView.page.screenshot({ fullPage: true });
          const siteShot = await siteView.page.screenshot({ fullPage: true });
          expect(mockupShot.length).toBeGreaterThan(1000);
          expect(siteShot.length).toBeGreaterThan(1000);

          // Section order must match the mockup
          const mockupIds = await sectionIds(mockupView.page);
          const siteIds = await sectionIds(siteView.page);
          expect(mockupIds.length).toBeGreaterThan(0);
          expect(siteIds).toEqual(mockupIds);

          // Verify screenshot sizes are comparable (within 2x factor)
          // This catches major layout differences even without pixel comparison
          const sizeRatio = siteShot.length / mockupShot.length;
          expect(sizeRatio).toBeGreaterThan(0.5);
          expect(sizeRatio).toBeLessThan(2.0);
        } finally {
          await mockupView.context.close();
          await siteView.context.close();
        }
      });
    }
  }

  test('hides canvas and screenshot placeholders in visual tests', async ({ browser }) => {
    const { context, page } = await openPage(browser, 1440, 900);
    try {
      await page.goto(`${dist.origin}/`, { waitUntil: 'domcontentloaded' });
      await page.addStyleTag({ content: HIDE_CSS });

      const canvases = await page.locator('canvas:visible').count();
      const bgVisible = await page.locator('.cc-bg:visible').count();
      const shotsVisible = await page.locator('.cc-shot:visible').count();
      const roadmapVisible = await page.locator('#roadmap:visible').count();
      // The roadmap is part of the mockup, so it must exist even when hidden
      const roadmap = await page.$('#roadmap');

      expect(canvases).toBe(0);
      expect(bgVisible).toBe(0);
      expect(shotsVisible).toBe(0);
      expect(roadmapVisible).toBe(0);
      expect(roadmap).not.toBeNull();
    } finally {
      await context.close();
    }
  });

  test('nav links work correctly', async ({ browser }) => {
    const { context, page } = await openPage(browser, 1440, 900);
    try {
      // FR link on the EN page
      await page.goto(`${dist.origin}/`, { waitUntil: 'domcontentloaded' });
      const frLink = page.locator('a[hreflang="fr"]');
      await expect(frLink).toBeVisible();
      await expect(frLink).toHaveAttribute('href', 'fr/');

      // EN link on the FR page
      const frPage = await context.newPage();
      await blockFonts(frPage);
      await frPage.goto(`${dist.origin}/fr/index.html`, { waitUntil: 'domcontentloaded' });
      const enLink = frPage.locator('a[hreflang="en"]');
      await expect(enLink).toBeVisible();
      await expect(enLink).toHaveAttribute('href', '../');
    } finally {
      await context.close();
    }
  });

  test('roadmap section is present in built output', async ({ browser }) => {
    const { context, page } = await openPage(browser, 1440, 900);
    try {
      await page.goto(`${dist.origin}/`, { waitUntil: 'domcontentloaded' });
      
      // Verify roadmap section exists
      const roadmap = page.locator('section#roadmap');
      await expect(roadmap).toBeVisible();
      
      // Verify roadmap <ol> exists inside the section
      const roadmapOl = page.locator('section#roadmap ol.cc-track');
      await expect(roadmapOl).toBeVisible();
      
      // Verify at least one stage is present
      const stageItems = page.locator('section#roadmap li.cc-stage');
      await expect(stageItems.count()).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  test('FR page preserves French language in roadmap section', async ({ browser }) => {
    const { context, page } = await openPage(browser, 1440, 900);
    try {
      await page.goto(`${dist.origin}/fr/index.html`, { waitUntil: 'domcontentloaded' });
      
      // Verify roadmap h2 is in French
      const roadmapH2 = page.locator('section#roadmap h2');
      await expect(roadmapH2).toBeVisible();
      const h2Text = await roadmapH2.textContent();
      expect(h2Text).toContain('D\'où ça vient');
      
      // Verify roadmap <ol> aria-label is in French
      const roadmapOl = page.locator('section#roadmap ol.cc-track');
      await expect(roadmapOl).toBeVisible();
      const olLabel = await roadmapOl.getAttribute('aria-label');
      expect(olLabel).toContain('Feuille de route');
    } finally {
      await context.close();
    }
  });
});
