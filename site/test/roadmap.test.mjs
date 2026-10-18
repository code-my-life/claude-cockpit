import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderRoadmapItems, injectRoadmap, escapeHtml } from '../build.mjs';

const SITE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

const milestones = [
  { number: 1, title: 'Foundations', description: 'Core work', state: 'closed' },
  { number: 2, title: 'Upcoming work', description: 'Coming soon', state: 'open' },
];
const issuesByMilestone = new Map([
  [2, [{ number: 10, title: 'First issue' }, { number: 11, title: 'Second issue' }]],
]);

function roadmapSection(html) {
  const start = html.indexOf('<section id="roadmap"');
  assert.notEqual(start, -1, 'roadmap section exists');
  return html.slice(start, html.indexOf('</section>', start));
}

function countOl(html) {
  return (html.match(/<ol class="cc-track"/g) || []).length;
}

test('FR page: single ol, aria-label kept, French labels, h2 kept', () => {
  const source = readFileSync(join(SITE_DIR, 'fr', 'index.html'), 'utf8');
  const out = injectRoadmap(source, renderRoadmapItems(milestones, issuesByMilestone, 'fr'));
  const section = roadmapSection(out);

  assert.equal(countOl(out), 1);
  assert.ok(section.includes('aria-label="Feuille de route"'));
  assert.ok(section.includes('Livrée'));
  assert.ok(section.includes('Prochain'));
  assert.ok(!section.includes('Shipped'));
  assert.ok(!section.includes('Next'));
  assert.ok(section.includes("D'où ça vient, où ça va"));
  assert.ok(section.includes('issues/10'));
  assert.ok(section.includes('issues/11'));
});

test('EN page: single ol, English labels', () => {
  const source = readFileSync(join(SITE_DIR, 'index.html'), 'utf8');
  const out = injectRoadmap(source, renderRoadmapItems(milestones, issuesByMilestone, 'en'));
  const section = roadmapSection(out);

  assert.equal(countOl(out), 1);
  assert.ok(section.includes('Shipped'));
  assert.ok(section.includes('Next'));
  assert.ok(!section.includes('Livrée'));
  assert.ok(!section.includes('Prochain'));
});

test('escapeHtml escapes titles and tolerates null description', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  const html = renderRoadmapItems(
    [{ number: 3, title: '<script>alert(1)</script>', description: null, state: 'open' }],
    new Map(),
    'en'
  );
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<p class="ep-note"></p>'));
});

test('html without ol.cc-track is returned unchanged', () => {
  const html = '<main><ol class="other"><li>x</li></ol></main>';
  assert.equal(injectRoadmap(html, '<li class="cc-stage"></li>'), html);
});
