const test = require('node:test');
const assert = require('node:assert/strict');

const { DEFAULT_PREFS, DOCK_LAYOUTS, DOCK_SIZES, MAX_SUGGESTIONS, gridColumnsOf, moveSelection, readDockPrefs, suggestionsOf } = require('./dock.js');

test('three sizes and three layouts are offered', () => {
  const sizes = Object.keys(DOCK_SIZES);
  const layouts = Object.keys(DOCK_LAYOUTS);
  assert.deepEqual(sizes, ['small', 'medium', 'large']);
  assert.deepEqual(layouts, ['row', 'column', 'grid']);
});

test('heads grow with the dock size', () => {
  const small = DOCK_SIZES.small.head;
  const medium = DOCK_SIZES.medium.head;
  const large = DOCK_SIZES.large.head;
  assert.ok(small < medium && medium < large);
  assert.equal(medium, 56);
});

test('missing or broken preferences fall back to medium row', () => {
  const missing = readDockPrefs(null);
  const broken = readDockPrefs('{ broken');
  const notAnObject = readDockPrefs('"grid"');
  assert.deepEqual(DEFAULT_PREFS, { size: 'medium', layout: 'row' });
  assert.deepEqual(missing, DEFAULT_PREFS);
  assert.deepEqual(broken, DEFAULT_PREFS);
  assert.deepEqual(notAnObject, DEFAULT_PREFS);
});

test('unknown values are replaced one by one, valid ones are kept', () => {
  const mixed = readDockPrefs('{"size":"huge","layout":"grid"}');
  const valid = readDockPrefs('{"size":"large","layout":"column"}');
  assert.deepEqual(mixed, { size: 'medium', layout: 'grid' });
  assert.deepEqual(valid, { size: 'large', layout: 'column' });
});

test('the grid spreads heads over two rows', () => {
  const none = gridColumnsOf(0);
  const one = gridColumnsOf(1);
  const five = gridColumnsOf(5);
  const six = gridColumnsOf(6);
  assert.equal(none, 1);
  assert.equal(one, 1);
  assert.equal(five, 3);
  assert.equal(six, 3);
});

const WAITING = ['permission', 'done', 'external'];

const rowOf = (engineId, status, updatedAt) => ({ engineId, status, updatedAt, title: engineId });

test('suggestions put the conversations waiting for you first, then the most recent ones', () => {
  const rows = [
    rowOf('old-waiting', 'permission', 10),
    rowOf('fresh-working', 'thinking', 90),
    rowOf('new-waiting', 'done', 50),
    rowOf('idle', 'idle', 70),
  ];
  const suggestions = suggestionsOf(rows, WAITING);
  const ids = suggestions.map(row => row.engineId);
  assert.deepEqual(ids, ['new-waiting', 'old-waiting', 'fresh-working', 'idle']);
});

test('closed and archived conversations are never suggested', () => {
  const rows = [rowOf('closed', 'closed', 99), rowOf('archived', 'archived', 98), rowOf('kept', 'idle', 1)];
  const suggestions = suggestionsOf(rows, WAITING);
  const ids = suggestions.map(row => row.engineId);
  assert.deepEqual(ids, ['kept']);
});

test('suggestions stop at eight', () => {
  const rows = Array.from({ length: 12 }, (unused, index) => rowOf(`s${index}`, 'idle', index));
  const suggestions = suggestionsOf(rows, WAITING);
  assert.equal(MAX_SUGGESTIONS, 8);
  assert.equal(suggestions.length, 8);
  assert.equal(suggestions[0].engineId, 's11');
});

test('the arrows move the selection inside the list and never past its ends', () => {
  const down = moveSelection(0, 1, 3);
  const pastEnd = moveSelection(2, 1, 3);
  const up = moveSelection(1, -1, 3);
  const pastStart = moveSelection(0, -1, 3);
  const fromNothing = moveSelection(-1, 1, 3);
  const empty = moveSelection(0, 1, 0);
  assert.equal(down, 1);
  assert.equal(pastEnd, 2);
  assert.equal(up, 0);
  assert.equal(pastStart, 0);
  assert.equal(fromNothing, 0);
  assert.equal(empty, -1);
});
