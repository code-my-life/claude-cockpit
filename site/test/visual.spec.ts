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
async function comparePngs(browser: Browser, a: Buffer, b: Buffer, anchorsA: number[], anchorsB: number[], tolerance = CHANNEL_TOLERANCE) {
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
        tolerance,
        coarseTolerance: COARSE_TOLERANCE,
        cols: COARSE_COLS,
        rows: COARSE_ROWS,
      }
    );
  } finally {
    await context.close();
  }
}

// Decode a PNG in a browser page and return the RGB of its top-left pixel
async function firstPixel(browser: Browser, png: Buffer): Promise<[number, number, number]> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    return await page.evaluate(async url => {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('PNG decode failed'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b] as [number, number, number];
    }, `data:image/png;base64,${png.toString('base64')}`);
  } finally {
    await context.close();
  }
}

// Scroll a page point to the middle of the viewport, then return its pixel and the element under it
async function probe(browser: Browser, page: Page, x: number, y: number) {
  const { innerHeight } = await page.evaluate(() => ({ innerHeight: window.innerHeight }));
  await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), Math.max(0, y - innerHeight / 2));
  const scrollY = await page.evaluate(() => window.scrollY);
  const vy = y - scrollY;
  const target = await page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    if (!el) return 'none';
    return el.matches('main, section, .ep-wrap') ? 'background' : `${el.tagName.toLowerCase()}.${el.className}`;
  }, [x, vy]);
  const shot = await page.screenshot({ clip: { x, y: vy, width: 1, height: 1 } });
  return { rgb: await firstPixel(browser, shot), target };
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

  // #65: when the state toggle wraps, a pill radius cuts into the buttons at the ends of each row
  for (const { width, height } of viewports) {
    for (const [name, origin, route] of [
      ['mockup', () => mockup.origin, '/'],
      ['site EN', () => dist.origin, '/'],
      ['site FR', () => dist.origin, '/fr/index.html'],
    ] as const) {
      test(`state toggle buttons stay inside its rounded outline at ${width} (${name})`, async ({ browser }) => {
        const { context, page } = await openPage(browser, width, height);
        try {
          await page.goto(`${origin()}${route}`, { waitUntil: 'domcontentloaded' });
          const outside = await page.evaluate(() => {
            const toggle = document.querySelector('.cc-state .ep-toggle')!;
            const t = toggle.getBoundingClientRect();
            const border = parseFloat(getComputedStyle(toggle).borderTopWidth) || 0;
            // Inner outline of the toggle: its box minus the border, with the used corner radius
            const box = { left: t.left + border, right: t.right - border, top: t.top + border, bottom: t.bottom - border };
            const radius = Math.max(0, Math.min(parseFloat(getComputedStyle(toggle).borderTopLeftRadius), t.height / 2, t.width / 2) - border);
            const inside = (x: number, y: number) => {
              if (x < box.left - 0.5 || x > box.right + 0.5 || y < box.top - 0.5 || y > box.bottom + 0.5) return false;
              const cx = Math.min(Math.max(x, box.left + radius), box.right - radius);
              const cy = Math.min(Math.max(y, box.top + radius), box.bottom - radius);
              return Math.hypot(x - cx, y - cy) <= radius + 0.5;
            };
            // Sample the outline of each pill button: its ends and the start of its straight edges
            return Array.from(toggle.querySelectorAll('button')).flatMap(button => {
              const b = button.getBoundingClientRect();
              const r = Math.min(parseFloat(getComputedStyle(button).borderTopLeftRadius), b.height / 2);
              const midY = b.top + b.height / 2;
              const points = [[b.left, midY], [b.right, midY], [b.left + r, b.top], [b.left + r, b.bottom], [b.right - r, b.top], [b.right - r, b.bottom]];
              return points.some(([x, y]) => !inside(x, y)) ? [button.textContent!.trim()] : [];
            });
          });
          expect(outside).toEqual([]);
        } finally {
          await context.close();
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

  // #68: the page background layer (#cc-bg) must show behind the hero, in the side margins,
  // and blurred through the glass content block. The layer is painted magenta and its canvas
  // hidden, so the test depends neither on the generator nor on reduced motion.
  const BG_CSS = '#cc-bg{background:#ff00ff!important} #cc-bg canvas{visibility:hidden!important}';
  const magenta = ([r, g, b]: number[]) => r > 200 && b > 200 && g < 40;
  const throughGlass = ([r, g]: number[]) => r > 120 && r < 245 && g < 60;
  for (const { width, height } of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    for (const [name, origin, route] of [
      ['mockup', () => mockup.origin, '/'],
      ['site EN', () => dist.origin, '/'],
      ['site FR', () => dist.origin, '/fr/index.html'],
    ] as const) {
      test(`page background shows behind the hero and around the content block at ${width} (${name})`, async ({ browser }) => {
        const { context, page } = await openPage(browser, width, height);
        try {
          await page.goto(`${origin()}${route}`, { waitUntil: 'domcontentloaded' });
          await page.addStyleTag({ content: BG_CSS });
          const geo = await page.evaluate(() => {
            const pageRect = (el: Element) => {
              const r = el.getBoundingClientRect();
              return { top: r.top + window.scrollY, left: r.left + window.scrollX };
            };
            const block = document.querySelector('main > div.ep-wrap')!;
            return { hero: pageRect(document.getElementById('download')!), block: pageRect(block) };
          });
          const hero = await probe(browser, page, 8, geo.hero.top + 32);
          const margin = await probe(browser, page, 3, geo.block.top + 200);
          const inside = await probe(browser, page, geo.block.left + 8, geo.block.top + 40);
          console.log(`MEASURE bg ${width} ${name} hero=${hero.rgb} margin=${margin.rgb} inside=${inside.rgb}`);
          expect([hero.target, margin.target, inside.target]).toEqual(['background', 'background', 'background']);
          expect(magenta(hero.rgb), `hero pixel ${hero.rgb}`).toBe(true);
          expect(magenta(margin.rgb), `side margin pixel ${margin.rgb}`).toBe(true);
          expect(throughGlass(inside.rgb), `glass block pixel ${inside.rgb}`).toBe(true);
        } finally {
          await context.close();
        }
      });
    }
  }
  // Release 0.4.2: the review of the site with design-taste-frontend
  const PAGES = [
    ['mockup', () => mockup.origin, '/'],
    ['site EN', () => dist.origin, '/'],
    ['site FR', () => dist.origin, '/fr/index.html'],
  ] as const;
  const SITE_PAGES = PAGES.filter(([name]) => name !== 'mockup');

  for (const { width, height } of viewports) {
    for (const [name, origin, route] of PAGES) {
      // Every heading, the hero title included, holds on two lines or fewer
      test(`headings hold on two lines at ${width} (${name})`, async ({ browser }) => {
        // Line breaks depend on the real faces: this test loads the Google Fonts the page asks for
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
        const page = await context.newPage();
        try {
          await page.goto(`${origin()}${route}`, { waitUntil: 'load' });
          await page.evaluate(() => document.fonts.ready);
          expect(await page.evaluate(() => document.fonts.check('40px "Instrument Serif"')), 'Instrument Serif loaded').toBe(true);
          const tooLong = await page.evaluate(() =>
            Array.from(document.querySelectorAll('h1, h2, h3, h4')).flatMap(h => {
              if (h.closest('sg-flip [data-front]')) return [];
              const range = document.createRange();
              range.selectNodeContents(h);
              // Group the text fragments into lines: a fragment starts a new line when its middle is
              // more than half a line below the previous one (an <em> box does not count as a line)
              const lineHeight = parseFloat(getComputedStyle(h).lineHeight) || parseFloat(getComputedStyle(h).fontSize);
              const middles = Array.from(range.getClientRects()).filter(r => r.width > 1).map(r => (r.top + r.bottom) / 2).sort((a, b) => a - b);
              let lines = 0;
              let last = -Infinity;
              for (const m of middles) {
                if (m - last > lineHeight / 2) lines++;
                last = m;
              }
              return lines > 2 ? [`${h.textContent!.trim()} (${lines} lines)`] : [];
            })
          );
          expect(tooLong).toEqual([]);
        } finally {
          await context.close();
        }
      });
    }
  }

  for (const { width, height } of viewports) {
    for (const [name, origin, route] of PAGES) {
      // A card front holds its whole content: no scrollbar, no clipped buttons
      test(`every card front holds its content without scrolling at ${width} (${name})`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
        const page = await context.newPage();
        try {
          await page.goto(`${origin()}${route}`, { waitUntil: 'load' });
          await page.evaluate(() => document.fonts.ready);
          const overflowing = await page.evaluate(() =>
            Array.from(document.querySelectorAll('sg-flip .cc-front')).flatMap(front =>
              front.scrollHeight > front.clientHeight + 1 ? [front.querySelector('p')?.textContent?.trim().slice(0, 40) ?? '?'] : []
            )
          );
          expect(overflowing).toEqual([]);
        } finally {
          await context.close();
        }
      });
    }
  }

  for (const width of [768, 390]) {
    for (const [name, origin, route] of PAGES) {
      // The engravings band wraps instead of running past the screen edge
      test(`the engravings band stays inside the screen at ${width} (${name})`, async ({ browser }) => {
        const { context, page } = await openPage(browser, width, 900);
        try {
          await page.goto(`${origin()}${route}`, { waitUntil: 'domcontentloaded' });
          const cut = await page.evaluate(() => {
            const band = document.querySelector('.cc-band')!;
            const box = band.getBoundingClientRect();
            return Array.from(band.children).flatMap(item => {
              const r = item.getBoundingClientRect();
              return r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.right > window.innerWidth ? [item.textContent!.trim()] : [];
            });
          });
          expect(cut).toEqual([]);
        } finally {
          await context.close();
        }
      });
    }
  }

  for (const [name, origin, route] of PAGES) {
    // Running notes are read: 16px or more, outside the small card fronts
    test(`running notes are set at 16px or more (${name})`, async ({ browser }) => {
      const { context, page } = await openPage(browser, 1440, 900);
      try {
        await page.goto(`${origin()}${route}`, { waitUntil: 'domcontentloaded' });
        const small = await page.evaluate(() =>
          Array.from(document.querySelectorAll('main .ep-note'))
            .filter(n => !n.closest('sg-flip [data-front]') && parseFloat(getComputedStyle(n).fontSize) < 16)
            .map(n => n.textContent!.trim().slice(0, 40))
        );
        expect(small).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }

  for (const [name, origin, route] of SITE_PAGES) {
    // The state toggle speaks the language of its page
    test(`the state toggle names the state in the page language (${name})`, async ({ browser }) => {
      const { context, page } = await openPage(browser, 1440, 900);
      try {
        await page.goto(`${origin()}${route}`, { waitUntil: 'domcontentloaded' });
        await page.locator('.cc-state .ep-toggle button[data-state="working"]').click();
        const label = await page.locator('.cc-state .ep-toggle button[data-state="working"]').textContent();
        await expect(page.locator('.cc-state p.h4')).toHaveText(label!.trim());
        await expect(page.locator('.cc-state sg-card')).toHaveAttribute('state', 'working');
      } finally {
        await context.close();
      }
    });

    // Sections enter in staggered parts when motion is allowed, and nothing is hidden when it is not
    test(`sections enter in parts, and the reduced page shows everything (${name})`, async ({ browser }) => {
      const moving = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
      const still = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      try {
        const page = await moving.newPage();
        await blockFonts(page);
        await page.goto(`${origin()}${route}`, { waitUntil: 'domcontentloaded' });
        const parts = await page.locator('.cc-reveal').count();
        expect(parts).toBeGreaterThanOrEqual(16);
        // Scroll the whole page, then every part has entered and is fully shown
        const total = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y <= total; y += 450) {
          await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), y);
          await page.waitForTimeout(120);
        }
        await page.waitForTimeout(1200);
        const hidden = await page.evaluate(() =>
          Array.from(document.querySelectorAll('.cc-reveal'))
            .filter(el => !el.classList.contains('is-in') || parseFloat(getComputedStyle(el).opacity) < 0.99)
            .map(el => `${el.tagName.toLowerCase()}.${el.className}: ${el.textContent!.trim().slice(0, 30)}`)
        );
        expect(hidden).toEqual([]);

        const reduced = await still.newPage();
        await blockFonts(reduced);
        await reduced.goto(`${origin()}${route}`, { waitUntil: 'domcontentloaded' });
        await reduced.waitForTimeout(300);
        const reducedHidden = await reduced.evaluate(() =>
          Array.from(document.querySelectorAll('main h2, main .ep-lede, main .ep-plate, main figure')).filter(el => parseFloat(getComputedStyle(el).opacity) < 0.99).length
        );
        expect(reducedHidden).toBe(0);
      } finally {
        await moving.close();
        await still.close();
      }
    });
  }
});
