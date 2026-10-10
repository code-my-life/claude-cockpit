const test = require('node:test');
const assert = require('node:assert/strict');

const { MAX_SUGGESTIONS, moveSelection, suggestionsOf } = require('./dock.js');

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
