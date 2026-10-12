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
