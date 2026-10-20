import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Test fail-first: this test should fail because site/ directory doesn't exist yet on base commit
const siteDir = 'site';
const enFile = `${siteDir}/index.html`;
const frFile = `${siteDir}/fr/index.html`;

// Extract expected sections and attributes from the mockup
const mockupPath = 'docs/design/site/index.html';
const mockupContent = fs.readFileSync(mockupPath, 'utf-8');

// Parse sections from mockup (IDs starting with #)
const sectionRegex = /id="([^"]+)"/g;
const mockupSections = [];
let match;
while ((match = sectionRegex.exec(mockupContent)) !== null) {
  mockupSections.push(match[1]);
}

// Parse language and theme from mockup
const langMatch = mockupContent.match(/<html[^>]*lang="([^"]*)"/);
const expectedLang = langMatch ? langMatch[1] : 'en';

const themeMatch = mockupContent.match(/<html[^>]*data-theme="([^"]*)"/);
const expectedTheme = themeMatch ? themeMatch[1] : 'noir';

// Parse navigation links
const navLinksRegex = /<a[^>]*href="([^"]*)"[^>]*hreflang="([^"]*)"[^>]*lang="([^"]*)"/g;
const mockupNavLinks = [];
while ((match = navLinksRegex.exec(mockupContent)) !== null) {
  mockupNavLinks.push({
    href: match[1],
    hreflang: match[2],
    lang: match[3]
  });
}

test('site pages expose every section and theme derived from the mockup (EN and FR)', async () => {
  // EN page should exist and have correct structure
  await fs.promises.access(enFile, fs.constants.F_OK);
  
  const enContent = fs.readFileSync(enFile, 'utf-8');
  
  // Check HTML lang attribute
  const langRegex = /<html[^>]*lang="([^"]*)"/;
  const langMatch = enContent.match(langRegex);
  assert.strictEqual(langMatch?.[1], 'en', `EN page should have lang="en"`);
  
  // Check data-theme attribute
  const themeRegex = /<html[^>]*data-theme="([^"]*)"/;
  const themeMatch = enContent.match(themeRegex);
  assert.strictEqual(themeMatch?.[1], 'noir', `EN page should have data-theme="noir"`);
  
  // Check all sections from mockup exist in EN page
  const enSectionRegex = /id="([^"]+)"/g;
  const enSections = [];
  let enMatch;
  while ((enMatch = enSectionRegex.exec(enContent)) !== null) {
    enSections.push(enMatch[1]);
  }
  
  mockupSections.forEach(section => {
    assert.ok(enSections.includes(section), `EN page should have section #${section}`);
  });
  
  // FR page should exist and have correct structure
  await fs.promises.access(frFile, fs.constants.F_OK);
  
  const frContent = fs.readFileSync(frFile, 'utf-8');
  
  // Check HTML lang attribute for FR
  const frLangMatch = frContent.match(langRegex);
  assert.strictEqual(frLangMatch?.[1], 'fr', `FR page should have lang="fr"`);
  
  // Check same sections in FR page
  const frSectionRegex = /id="([^"]+)"/g;
  const frSections = [];
  let frMatch;
  while ((frMatch = frSectionRegex.exec(frContent)) !== null) {
    frSections.push(frMatch[1]);
  }
  
  mockupSections.forEach(section => {
    assert.ok(frSections.includes(section), `FR page should have section #${section}`);
  });
  
  // Check navigation links (basic structure)
  const navENRegex = /<a[^>]*href="fr\/"[^>]*hreflang="fr"[^>]*lang="fr"/;
  assert.ok(navENRegex.test(enContent), "EN page should have FR link");
});
// #68: everything under the hero sits in one glass block, the hero stays on the page background
test('the content block under the hero is a Liquid Paper glass block (mockup, EN and FR)', () => {
  for (const file of [mockupPath, enFile, frFile]) {
    const html = fs.readFileSync(file, 'utf-8');
    const sibling = html.match(/<section id="download"[\s\S]*?<\/section>\s*<div class="([^"]*)"/);
    assert.ok(sibling, `${file}: #download should be followed by a div`);
    const classes = sibling[1].split(/\s+/);
    assert.ok(classes.includes('ep-wrap'), `${file}: the block under the hero should keep ep-wrap`);
    assert.ok(classes.includes('ep-glass'), `${file}: the block under the hero should carry ep-glass`);
  }
});

// Release 0.4.2: the developers section no longer repeats the install section's row of plates
test('the developers section is not a row of plates like the install section (mockup, EN and FR)', () => {
  for (const file of [mockupPath, enFile, frFile]) {
    const html = fs.readFileSync(file, 'utf-8');
    const section = html.match(/<section id="developers"[\s\S]*?<\/section>/);
    assert.ok(section, `${file}: #developers should exist`);
    assert.ok(!/ep-plate/.test(section[0]), `${file}: #developers should not use ep-plate`);
  }
});
