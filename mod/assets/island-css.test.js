const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cssPath = path.join(__dirname, 'island.css');
const css = fs.readFileSync(cssPath, 'utf8');

test('en cartes, les vues ordre et mise de côté prennent toute la largeur', () => {
  const pattern = /\.island\.cards\s+\.simple\s*\{[^}]*grid-template-columns\s*:\s*minmax\(0,\s*1fr\)\s*;/;
  assert.match(css, pattern);
});

test('.send rule has no disc background and uses currentColor', () => {
  // The .send button should have no background (no disc), color: currentColor, and no fill
  const sendRule = css.match(/\.send\s*\{[^}]+\}/);
  assert.ok(sendRule, '.send rule should exist');
  const rule = sendRule[0];
  assert.match(rule, /background:\s*none|background\s*:\s*0|background:\s*transparent/, 'background should be none/transparent');
  assert.match(rule, /color:\s*currentColor/, 'color should be currentColor');
});
