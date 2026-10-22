const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('./island-model.js');

const row = (engineId, status, extra = {}) => ({ engineId, title: `Titre ${engineId}`, status, updatedAt: 1000, ...extra });

test('a permission or an outside wait is a wait, a finished turn with a question too, a delivered one is done', () => {
  assert.equal(model.kindOf(row('a', 'permission')), 'wait');
  assert.equal(model.kindOf(row('a', 'external')), 'wait');
  assert.equal(model.kindOf(row('a', 'done', { summary: { kind: 'question' } })), 'wait');
  assert.equal(model.kindOf(row('a', 'done', { summary: { kind: 'delivered' } })), 'done');
  assert.equal(model.kindOf(row('a', 'done')), 'done');
});

test('working, blocked and failed rows have their own kinds, resting rows are not shown', () => {
  for (const status of ['thinking', 'writing', 'tool', 'working']) assert.equal(model.kindOf(row('a', status)), 'work');
  assert.equal(model.kindOf(row('a', 'blocked')), 'stuck');
  assert.equal(model.kindOf(row('a', 'error')), 'stuck');
  for (const status of ['later', 'seen', 'opened', 'idle', 'closed', 'archived', 'aborted']) assert.equal(model.kindOf(row('a', status)), null);
});

test('rows are ordered by urgency, the permission first, then the longest wait, the freshest work first', () => {
  const rows = [
    row('work-old', 'thinking', { updatedAt: 100 }),
    row('work-new', 'tool', { updatedAt: 900 }),
    row('done', 'done', { updatedAt: 500 }),
    row('wait-late', 'permission', { updatedAt: 800 }),
    row('wait-early', 'external', { updatedAt: 200 }),
    row('stuck', 'blocked', { updatedAt: 300 }),
    row('rest', 'closed', { updatedAt: 999 }),
  ];
  assert.deepEqual(model.byUrgency(rows).map(r => r.engineId), ['wait-late', 'wait-early', 'stuck', 'done', 'work-new', 'work-old']);
  const questions = [row('q-late', 'done', { updatedAt: 800, summary: { kind: 'question' } }), row('q-early', 'done', { updatedAt: 200, summary: { kind: 'question' } })];
  assert.deepEqual(model.byUrgency(questions).map(r => r.engineId), ['q-early', 'q-late']);
});

test('the signal of a row is an icon and a word', () => {
  assert.deepEqual(model.signalOf(row('a', 'thinking')), { kind: 'work', word: 'Travaille', icon: 'play', tone: '' });
  assert.deepEqual(model.signalOf(row('a', 'permission')), { kind: 'wait', word: 'Permission', icon: 'alert', tone: 'warning' });
  assert.deepEqual(model.signalOf(row('a', 'done', { summary: { kind: 'question' } })), { kind: 'wait', word: 'Question', icon: 'info', tone: 'warning' });
  assert.deepEqual(model.signalOf(row('a', 'external')), { kind: 'wait', word: 'Attend autre chose', icon: 'later', tone: 'warning' });
  assert.deepEqual(model.signalOf(row('a', 'done', { summary: { kind: 'delivered' } })), { kind: 'done', word: 'Mission livrée', icon: 'check', tone: 'success' });
  assert.deepEqual(model.signalOf(row('a', 'done')), { kind: 'done', word: 'A fini', icon: 'check', tone: 'success' });
  assert.deepEqual(model.signalOf(row('a', 'blocked')), { kind: 'stuck', word: 'Bloquée', icon: 'block', tone: 'danger' });
  assert.deepEqual(model.signalOf(row('a', 'error')), { kind: 'stuck', word: 'En erreur', icon: 'x', tone: 'danger' });
});

test('the compact word counts the conversations that wait, as the cockpit does', () => {
  const one = [row('a', 'permission'), row('b', 'tool')];
  const two = [row('a', 'permission'), row('c', 'external'), row('b', 'tool')];
  const withDelivered = [...two, row('d', 'done', { summary: { kind: 'delivered' } })];
  assert.equal(model.compactWordOf(one), 'Permission');
  assert.equal(model.compactWordOf(two), '2 t\'attendent');
  assert.equal(model.compactWordOf(withDelivered), '3 t\'attendent');
  assert.equal(model.compactWordOf([row('b', 'tool')]), 'Travaille');
  assert.equal(model.compactWordOf([]), 'Personne au travail');
});

test('the entity state follows the real status of the conversation', () => {
  const states = { permission: 'permission', external: 'waiting', done: 'done', error: 'error', blocked: 'error', later: 'sleep', thinking: 'working', tool: 'working', closed: 'idle', seen: 'idle' };
  for (const [status, expected] of Object.entries(states)) assert.equal(model.entityStateOf(row('a', status)), expected, status);
  assert.equal(model.entityStateOf(row('a', 'done', { summary: { kind: 'question' } })), 'waiting');
});

test('the focus keeps a shown conversation and falls back on the most urgent', () => {
  const rows = [row('w', 'tool'), row('p', 'permission'), row('c', 'closed')];
  assert.equal(model.focusOf(rows, 'w').engineId, 'w');
  assert.equal(model.focusOf(rows, 'c').engineId, 'p');
  assert.equal(model.focusOf(rows, null).engineId, 'p');
  assert.equal(model.focusOf([row('c', 'closed')], null), null);
});

test('the others exclude the focused conversation and respect the limit', () => {
  const rows = [row('a', 'permission'), row('b', 'tool'), row('c', 'done'), row('d', 'thinking')];
  assert.deepEqual(model.othersOf(rows, 'a', 2).map(r => r.engineId), ['c', 'b']);
});

test('only a wait that was not waiting before opens the island by itself', () => {
  const rows = [row('a', 'permission'), row('b', 'tool')];
  assert.equal(model.newWaitOf(null, rows), null);
  assert.equal(model.newWaitOf(new Set(['a']), rows), null);
  assert.equal(model.newWaitOf(new Set(), rows).engineId, 'a');
  assert.equal(model.waitingIdsOf(rows).has('a'), true);
});

test('the feed lists what the conversation did, the current step last', () => {
  const feed = model.createFeed({ max: 3 });
  const labelOf = r => (r.tool ? `outil ${r.tool}` : 'réfléchit');
  feed.observe([row('a', 'thinking')], 1000, labelOf);
  feed.observe([row('a', 'tool', { tool: 'Read' })], 2000, labelOf);
  feed.observe([row('a', 'tool', { tool: 'Read' })], 2500, labelOf);
  feed.observe([row('a', 'tool', { tool: 'Bash' })], 3000, labelOf);
  const lines = feed.linesOf(row('a', 'tool', { tool: 'Bash' }), labelOf);
  assert.deepEqual(lines.map(l => [l.label, l.isCurrent]), [['réfléchit', false], ['outil Read', false], ['outil Bash', true]]);
});

test('the feed keeps only the last steps and drops them when the conversation stops working', () => {
  const feed = model.createFeed({ max: 2 });
  const labelOf = r => `outil ${r.tool}`;
  for (const [index, tool] of ['A', 'B', 'C'].entries()) feed.observe([row('a', 'tool', { tool })], 1000 + index, labelOf);
  assert.equal(feed.linesOf(row('a', 'tool', { tool: 'C' }), labelOf).length, 2);
  feed.observe([row('a', 'done')], 5000, labelOf);
  assert.deepEqual(feed.linesOf(row('a', 'done'), labelOf), []);
});

test('without any observed step the feed shows the current activity alone', () => {
  const feed = model.createFeed({ max: 3 });
  const lines = feed.linesOf(row('z', 'tool', { tool: 'Grep' }), () => 'fouille le code');
  assert.deepEqual(lines.map(l => [l.label, l.isCurrent]), [['fouille le code', true]]);
});

test('the spring eases from 0 to 1 with a light overshoot', () => {
  const ease = model.springEase({ zeta: 0.72, ms: 300 }, 300);
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  const peak = Math.max(...Array.from({ length: 101 }, (unused, index) => ease(index / 100)));
  assert.ok(peak > 1 && peak < 1.12, `peak ${peak}`);
});

test('the hover intent opens after the delay only if the pointer stays', () => {
  const timers = [];
  const opened = [];
  const intent = model.createHoverIntent({ delayMs: 120, setTimer: (run, ms) => { timers.push({ run, ms, live: true }); return timers.length - 1; }, clearTimer: handle => { timers[handle].live = false; }, onOpen: () => opened.push('open') });
  intent.enter();
  assert.equal(timers[0].ms, 120);
  intent.leave();
  assert.equal(timers[0].live, false);
  intent.enter();
  timers[1].run();
  assert.deepEqual(opened, ['open']);
});

test('the hover intent ignores a second enter and never opens twice', () => {
  const timers = [];
  const opened = [];
  const intent = model.createHoverIntent({ delayMs: 120, setTimer: run => { timers.push(run); return timers.length - 1; }, clearTimer: () => {}, onOpen: () => opened.push(1) });
  intent.enter();
  intent.enter();
  assert.equal(timers.length, 1);
});

test('the status of the quick reply depends on the server and on the conversation', () => {
  assert.equal(model.canReply(row('a', 'done'), { isServer: true }), true);
  assert.equal(model.canReply(row('a', 'done', { isCurrent: true }), { isServer: true }), false);
  assert.equal(model.canReply(row('a', 'done'), { isServer: false }), false);
  assert.equal(model.canReply(row('a', 'permission'), { isServer: true }), false);
});

const ask = (engineId, extra = {}) => ({ requestId: `r-${engineId}`, engineId, tool: 'Commande', summary: 'npm test', detail: 'npm test', canAlways: true, askedAt: 1000, ...extra });

test('the permission request of a conversation is found by its id', () => {
  const asks = [ask('a'), ask('b')];
  assert.equal(model.permissionOf(asks, 'b').requestId, 'r-b');
  assert.equal(model.permissionOf(asks, 'z'), null);
  assert.equal(model.permissionOf(undefined, 'a'), null);
});

test('a permission the island holds can be answered from the island, any other cannot', () => {
  const waiting = row('a', 'permission');
  assert.equal(model.canDecide(waiting, [ask('a')]), true);
  assert.equal(model.canDecide(waiting, []), false);
  assert.equal(model.canDecide(row('a', 'done'), [ask('a')]), true);
  assert.equal(model.canDecide(null, [ask('a')]), false);
});

test('the buttons of a permission ignore clicks during its first 600 ms', () => {
  assert.equal(model.isDecisionArmed(1000, 1500), false);
  assert.equal(model.isDecisionArmed(1000, 1600), true);
  assert.equal(model.isDecisionArmed(null, 1600), false);
});

test('a permission the island can answer comes first among the waits, then the oldest wait', () => {
  const rows = [row('q-old', 'done', { updatedAt: 100, summary: { kind: 'question' } }), row('perm', 'permission', { updatedAt: 900 }), row('q-new', 'external', { updatedAt: 500 })];
  assert.deepEqual(model.waitOrderOf(rows, [ask('perm')]).map(entry => entry.engineId), ['perm', 'q-old', 'q-new']);
  assert.deepEqual(model.waitOrderOf(rows, []).map(entry => entry.engineId), ['q-old', 'q-new', 'perm']);
});

test('the permission card says how long Claude waits for the island', () => {
  assert.equal(model.holdNoteOf(31000, 7000), 'Claude attend ta réponse ici. Sinon, il te la demande lui-même dans 24 s.');
  assert.equal(model.holdNoteOf(31000, 30500), 'Claude attend ta réponse ici. Sinon, il te la demande lui-même dans 1 s.');
  assert.equal(model.holdNoteOf(31000, 31000), 'Claude te la demande maintenant dans sa propre fenêtre.');
  assert.equal(model.holdNoteOf(undefined, 1000), '');
});

test('the feed shows the steps the mod saw, the last three, with files and line counts', () => {
  const feed = model.createFeed({ max: 3 });
  const steps = [
    { at: 1, kind: 'read', label: 'Lit a.js', file: '/r/a.js' },
    { at: 2, kind: 'command', label: 'Lance npm test' },
    { at: 3, kind: 'edit', label: 'Modifie b.js', file: '/r/b.js', added: 4, removed: 1, diff: { before: 'x', after: 'y' } },
    { at: 4, kind: 'edit', label: 'Écrit c.md', file: '/r/c.md', added: 2, removed: 0 },
  ];
  const lines = feed.linesOf(row('a', 'tool', { tool: 'Edit', steps }), () => 'Modifie le code');
  assert.deepEqual(lines.map(line => line.label), ['Lance npm test', 'Modifie b.js', 'Écrit c.md']);
  assert.deepEqual(lines.map(line => line.isCurrent), [false, false, true]);
  assert.equal(lines[1].added, 4);
  assert.equal(lines[1].removed, 1);
  assert.equal(lines[1].diffAt, 3);
  assert.equal(lines[2].diffAt, null);
});

test('a resting conversation keeps no feed, even with steps', () => {
  const feed = model.createFeed({ max: 3 });
  assert.deepEqual(feed.linesOf(row('a', 'done', { steps: [{ at: 1, kind: 'read', label: 'Lit a.js' }] }), () => ''), []);
});
