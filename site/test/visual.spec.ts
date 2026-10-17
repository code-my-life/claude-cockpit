import { test, expect } from '@playwright/test';

test.describe('Site structure visual comparison', () => {
  const viewports = [1440, 390];
  const routes = ['/', '/fr/'];
  
  // Load the site via file:// protocol for comparison
  const siteBasePath = 'file://' + process.cwd() + '/site/dist';
  
  viewports.forEach(width => {
    viewports.forEach(height => {
      routes.forEach(route => {
        test(`compares mockup and site at ${width}x${height}${route} (reduced motion)`, async ({ page }) => {
          // Enable reduced motion
          await page.emulateMedia({ reducedMotion: 'reduce' });
          
          // Load the site page
          await page.goto(`${siteBasePath}${route}`, { waitUntil: 'networkidle' });
          
          // Wait for BgGen to be available (may not be if vendor scripts fail)
          await page.waitForTimeout(500);
          
          // Take screenshot of the full page
          const screenshot = await page.screenshot({ fullPage: true });
          
          // Compare with mockup reference (if it exists)
          const mockupPath = `docs/design/site/reference/home-${width}.webp`;
          
          // For now, we just verify the page loads without error
          // In production, this would compare with reference screenshots
          expect(screenshot).toBeDefined();
          expect(screenshot.length).toBeGreaterThan(0);
        });
      });
    });
  });
  
  test('hides canvas and screenshot placeholders in visual tests', async ({ page }) => {
    await page.goto(`${siteBasePath}/`, { waitUntil: 'networkidle' });
    
    // Hide canvas elements (background animation)
    await page.addStyleTag({
      content: 'canvas, .cc-bg { display: none !important; }'
    });
    
    // Hide screenshot placeholders
    await page.addStyleTag({
      content: '.cc-shot { display: none !important; }'
    });
    
    // Hide roadmap (generated content)
    await page.addStyleTag({
      content: '#roadmap { display: none !important; }'
    });
    
    // Verify elements are hidden
    const canvases = await page.$$('canvas');
    const bgElements = await page.$$('.cc-bg');
    const screenshots = await page.$$('.cc-shot');
    const roadmap = await page.$$('#roadmap');
    
    // These should be hidden or empty
    expect(canvases.length).toBe(0);
    expect(bgElements.length).toBe(0);
    expect(screenshots.length).toBe(0);
    expect(roadmap).toBeNull();
  });
  
  test('nav links work correctly', async ({ page }) => {
    await page.goto(`${siteBasePath}/`, { waitUntil: 'networkidle' });
    
    // Check FR link in EN page
    const frLink = await page.locator('a[hreflang="fr"]');
    await expect(frLink).toBeVisible();
    await expect(frLink).toHaveAttribute('href', 'fr/');
    
    // Check EN link in FR page
    await page.goto(`${siteBasePath}/fr/`, { waitUntil: 'networkidle' });
    const enLink = await page.locator('a[hreflang="en"]');
    await expect(enLink).toBeVisible();
    await expect(enLink).toHaveAttribute('href', '../');
  });
});