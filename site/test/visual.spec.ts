import { test, expect, type Browser, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import type { AddressInfo } from 'node:net';

const DIST_DIR = join(process.cwd(), 'site/dist');
const MOCKUP_DIR = join(process.cwd(), 'docs/design/site');
const REFERENCE_DIR = join(MOCKUP_DIR, 'reference');

// Visual comparison thresholds (measured on the 8 combinations, plus a small margin)
const MAX_HEIGHT_DELTA = 0.05; // max relative difference between fullPage screenshot heights (measured max 0.0406)
const MAX_PIXEL_DIFF_EN = 0.005; // max share of differing pixels, EN site vs mockup (measured 0)
const MAX_PIXEL_DIFF_FR = 0.15; // max share of differing pixels, FR site vs EN mockup, text differs (measured max 0.1333)
// Coarse layout grid, aligned on section tops: text differences wash out, a moved section does not
const MAX_COARSE_DIFF_EN = 0.01; // measured 0
const MAX_COARSE_DIFF_FR = 0.12; // measured max 0.1097
const COARSE_COLS = 24;
const COARSE_ROWS = 120;
const COARSE_TOLERANCE = 12; // a coarse cell differs when any mean RGB channel differs by more than this
const CHANNEL_TOLERANCE = 32; // a pixel differs when any RGB channel differs by more than this

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

async function openPage(browser: Browser, width: number, height: number, colorScheme: 'light' | 'dark' = 'light') {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: 'reduce',
    colorScheme,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  await blockFonts(page);
  return { context, page };
}

const HIDE_CSS = '#cc-bg, .cc-bg, sg-card, .cc-shot, #roadmap, canvas { display: none !important; }';

// Page offsets of the top of every section[id], in document order
async function sectionTops(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('section[id]')).map(s => Math.round(s.getBoundingClientRect().top + window.scrollY))
  );
}

async function sectionIds(page: Page): Promise<string[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll('section[id]')).map(s => s.id));
}

// Decode both PNGs in a browser page and compare them pixel by pixel on their common area
async function comparePngs(browser: Browser, a: Buffer, b: Buffer, anchorsA: number[], anchorsB: number[]) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    return await page.evaluate(
      async ({ urlA, urlB, anchorsA, anchorsB, tolerance, coarseTolerance, cols, rows }) => {
        const load = (src: string) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('PNG decode failed'));
            img.src = src;
          });
        const [imgA, imgB] = await Promise.all([load(urlA), load(urlB)]);
        const width = Math.min(imgA.width, imgB.width);
        const height = Math.min(imgA.height, imgB.height);
        const read = (img: HTMLImageElement) => {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, 0, width, height).data;
        };
        const dataA = read(imgA);
        const dataB = read(imgB);
        let diff = 0;
        for (let i = 0; i < dataA.length; i += 4) {
          if (
            Math.abs(dataA[i] - dataB[i]) > tolerance ||
            Math.abs(dataA[i + 1] - dataB[i + 1]) > tolerance ||
            Math.abs(dataA[i + 2] - dataB[i + 2]) > tolerance
          ) {
            diff++;
          }
        }
        const maxHeight = Math.max(imgA.height, imgB.height);

        // Coarse layout comparison: each full image is averaged on the same COLS x ROWS grid
        // (heights normalized), so text differences wash out but a moved section does not.
        // Each page is cut into bands at its own section tops, so a text-induced height drift in one
        // section does not shift the following ones; every band gets the same number of grid rows.
        const bounds = (anchors: number[], imgHeight: number) => [...anchors.filter(y => y > 0 && y < imgHeight), imgHeight];
        const boundsA = bounds(anchorsA, imgA.height);
        const boundsB = bounds(anchorsB, imgB.height);
        const bands = Math.min(boundsA.length, boundsB.length);
        const rowsPerBand = Math.max(1, Math.floor(rows / bands));
        const grid = (img: HTMLImageElement, ends: number[]) => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, img.width, img.height).data;
          const cells = new Float64Array(bands * rowsPerBand * cols * 3);
          for (let band = 0; band < bands; band++) {
            const top = band === 0 ? 0 : ends[band - 1];
            const bandHeight = ends[band] - top;
            for (let r = 0; r < rowsPerBand; r++) {
              const y0 = top + Math.floor((r * bandHeight) / rowsPerBand);
              const y1 = Math.max(y0 + 1, top + Math.floor(((r + 1) * bandHeight) / rowsPerBand));
              for (let c = 0; c < cols; c++) {
                const x0 = Math.floor((c * img.width) / cols);
                const x1 = Math.max(x0 + 1, Math.floor(((c + 1) * img.width) / cols));
                let sr = 0, sg = 0, sb = 0, n = 0;
                for (let y = y0; y < y1; y++) {
                  for (let x = x0; x < x1; x++) {
                    const i = (y * img.width + x) * 4;
                    sr += data[i];
                    sg += data[i + 1];
                    sb += data[i + 2];
                    n++;
                  }
                }
                const o = ((band * rowsPerBand + r) * cols + c) * 3;
                cells[o] = sr / n;
                cells[o + 1] = sg / n;
                cells[o + 2] = sb / n;
              }
            }
          }
          return cells;
        };
        const gridA = grid(imgA, boundsA);
        const gridB = grid(imgB, boundsB);
        let coarse = 0;
        for (let i = 0; i < gridA.length; i += 3) {
          if (
            Math.abs(gridA[i] - gridB[i]) > coarseTolerance ||
            Math.abs(gridA[i + 1] - gridB[i + 1]) > coarseTolerance ||
            Math.abs(gridA[i + 2] - gridB[i + 2]) > coarseTolerance
          ) {
            coarse++;
          }
        }
        return {
          heightDelta: Math.abs(imgA.height - imgB.height) / maxHeight,
          pixelDiff: diff / (width * height),
          coarseDiff: coarse / (gridA.length / 3),
        };
      },
      {
        urlA: `data:image/png;base64,${a.toString('base64')}`,
        urlB: `data:image/png;base64,${b.toString('base64')}`,
        anchorsA,
        anchorsB,
        tolerance: CHANNEL_TOLERANCE,
        coarseTolerance: COARSE_TOLERANCE,
        cols: COARSE_COLS,
        rows: COARSE_ROWS,
      }
    );
  } finally {
    await context.close();
  }
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
      for (const scheme of ['light', 'dark'] as const) {
        test(`compares mockup and site at ${width}${route} ${scheme} (reduced motion)`, async ({ browser }) => {
          const mockupView = await openPage(browser, width, height, scheme);
          const siteView = await openPage(browser, width, height, scheme);
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

            // Real pixel comparison of the two full-page screenshots
            const { heightDelta, pixelDiff, coarseDiff } = await comparePngs(
              browser,
              mockupShot,
              siteShot,
              await sectionTops(mockupView.page),
              await sectionTops(siteView.page)
            );
            console.log(`MEASURE ${width}${route} ${scheme} heightDelta=${heightDelta.toFixed(4)} pixelDiff=${pixelDiff.toFixed(4)} coarse=${coarseDiff.toFixed(4)}`);
            expect(coarseDiff).toBeLessThanOrEqual(route === '/' ? MAX_COARSE_DIFF_EN : MAX_COARSE_DIFF_FR);
            expect(heightDelta).toBeLessThanOrEqual(MAX_HEIGHT_DELTA);
            expect(pixelDiff).toBeLessThanOrEqual(route === '/' ? MAX_PIXEL_DIFF_EN : MAX_PIXEL_DIFF_FR);
          } finally {
            await mockupView.context.close();
            await siteView.context.close();
          }
        });
      }
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
      expect(await stageItems.count()).toBeGreaterThan(0);
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
