const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SHAPE_SELECTOR,
  ACTIVITY_THROTTLE_MS,
  LEAVE_MS,
  isInsideShape,
  createPointerReporter,
  statusChanges,
  waitingCountOf,
  shouldPauseLoops,
  createThrottle,
} = require('./island');

const targetMatching = selector => ({ closest: query => (query === selector ? {} : null) });

test('la forme de l ile est le dock, la fiche et la bande d eveil', () => {
  assert.deepEqual(SHAPE_SELECTOR.split(',').map(part => part.trim()), ['.dock', '.t-sheet', '.wake']);
});

test('isInsideShape : vrai dans la forme, faux ailleurs ou sans cible', () => {
  assert.equal(isInsideShape(targetMatching(SHAPE_SELECTOR)), true);
  assert.equal(isInsideShape({ closest: () => null }), false);
  assert.equal(isInsideShape(null), false);
  assert.equal(isInsideShape({}), false);
});

test('le rapporteur de pointeur ne signale que les changements', () => {
  const calls = [];
  const report = createPointerReporter(value => calls.push(value));
  report(false);
  report(true);
  report(true);
  report(false);
  assert.deepEqual(calls, [true, false]);
});

test('statusChanges : le premier passage ne signale rien', () => {
  const first = statusChanges(null, [{ engineId: 'a', status: 'thinking' }]);
  assert.equal(first.hasChanged, false);
  assert.equal(first.next.get('a'), 'thinking');
});

test('statusChanges : un statut qui change ou une conversation qui arrive est un evenement', () => {
  const previous = new Map([['a', 'thinking']]);
  assert.equal(statusChanges(previous, [{ engineId: 'a', status: 'permission' }]).hasChanged, true);
  assert.equal(statusChanges(previous, [{ engineId: 'a', status: 'thinking' }, { engineId: 'b', status: 'thinking' }]).hasChanged, true);
  assert.equal(statusChanges(previous, [{ engineId: 'a', status: 'thinking' }]).hasChanged, false);
});

test('waitingCountOf compte les conversations qui attendent', () => {
  const rows = [{ status: 'permission' }, { status: 'done' }, { status: 'thinking' }];
  assert.equal(waitingCountOf(rows, ['permission', 'done', 'external']), 2);
  assert.equal(waitingCountOf([], ['done']), 0);
});

test('les boucles d animation se coupent quand l ile est cachee', () => {
  assert.equal(shouldPauseLoops('hidden'), true);
  assert.equal(shouldPauseLoops('compact'), false);
  assert.equal(shouldPauseLoops('open'), false);
});

test('createThrottle laisse passer un appel par fenetre de temps', () => {
  let now = 1000;
  const calls = [];
  const run = createThrottle(() => calls.push(now), ACTIVITY_THROTTLE_MS, () => now);
  run();
  now += ACTIVITY_THROTTLE_MS - 1;
  run();
  now += 1;
  run();
  assert.deepEqual(calls, [1000, 1000 + ACTIVITY_THROTTLE_MS]);
});

test('la fermeture dure 180 ms, comme le CSS', () => {
  assert.equal(LEAVE_MS, 180);
});
