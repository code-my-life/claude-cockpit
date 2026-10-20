const test = require('node:test');
const assert = require('node:assert/strict');

const words = require('./status-words.js');

const row = (status, kind) => ({ engineId: status, status, updatedAt: 1000, summary: kind ? { kind } : undefined });

test('the waiting statuses are the ones of the mod: a delivered mission waits for orders too', () => {
  assert.deepEqual(words.WAITING_STATUSES, ['permission', 'done', 'external']);
  assert.equal(words.waitingCountOf([row('permission'), row('done', 'delivered'), row('external'), row('tool'), row('later')]), 3);
});

test('a waiting row has one precise word, and the permission comes first', () => {
  assert.equal(words.WAIT_KINDS[words.waitKindOf(row('permission'))].label, 'Permission');
  assert.equal(words.WAIT_KINDS[words.waitKindOf(row('done', 'question'))].label, 'Question');
  assert.equal(words.WAIT_KINDS[words.waitKindOf(row('done', 'delivered'))].label, 'Mission livrée');
  assert.equal(words.WAIT_KINDS[words.waitKindOf(row('done'))].label, 'A fini');
  const ranks = ['permission', 'question', 'unknown', 'delivered', 'external'].map(kind => words.WAIT_KINDS[kind].rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  assert.equal(words.waitRankOf(row('permission')), 0);
});

test('the waiting phrase agrees with its count', () => {
  assert.equal(words.waitingPhraseOf(1), '1 conversation t\'attend');
  assert.equal(words.waitingPhraseOf(3), '3 conversations t\'attendent');
  assert.equal(words.waitingPhraseOf(2, false), '2 t\'attendent');
});

test('a question with numbered options answers with them; without options, no quick reply', () => {
  const asked = row('done', 'question');
  asked.summary.text = 'Deux pistes :\n1. Garder **le cache**\n2. Tout recalculer\n\n**Laquelle choisis-tu ?**';
  assert.deepEqual(words.quickRepliesOf(asked), [{ label: '1. Garder le cache', text: '1' }, { label: '2. Tout recalculer', text: '2' }]);
  const open = row('done', 'question');
  open.summary.text = 'Quel nom veux-tu pour la branche ?';
  assert.deepEqual(words.quickRepliesOf(open), []);
  assert.deepEqual(words.quickRepliesOf(row('permission')).map(reply => reply.text), ['OK', 'GO', 'Non']);
  assert.deepEqual(words.quickRepliesOf(row('done', 'delivered')).map(reply => reply.text), ['OK', 'GO', 'Non']);
});

test('options must be numbered from 1 without a gap, and long ones are cut', () => {
  assert.deepEqual(words.optionsOf('2. B\n3. C'), []);
  assert.deepEqual(words.optionsOf('1. A'), []);
  const long = words.optionsOf(`1. ${'a'.repeat(60)}\n2) court`);
  assert.equal(long[0].label.length, 40);
  assert.ok(long[0].label.endsWith('…'));
  assert.deepEqual(long[1], { label: 'court', text: '2' });
});
