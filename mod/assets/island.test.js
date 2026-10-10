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
  pinKindOf,
  announcementOf,
  shouldPauseLoops,
  shouldAnnounce,
  createThrottle,
  createLeaveTimer,
  hasNewWaiting,
  focusSelectorOf,
  zoneWordOf,
} = require('./island');

const targetMatching = selector => ({ closest: query => (query === selector ? {} : null) });

test('la forme de l ile est le dock et la fiche, plus de bande d eveil', () => {
  assert.deepEqual(SHAPE_SELECTOR.split(',').map(part => part.trim()), ['.dock', '.t-sheet']);
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

test('pinKindOf : permission et question epinglent fort, done epingle moins longtemps', () => {
  assert.equal(pinKindOf([{ status: 'permission' }, { status: 'done' }]), 'attention');
  assert.equal(pinKindOf([{ status: 'external' }]), 'attention');
  assert.equal(pinKindOf([{ status: 'done' }, { status: 'thinking' }]), 'done');
  assert.equal(pinKindOf([{ status: 'thinking' }]), 'none');
  assert.equal(pinKindOf([]), 'none');
});

test('annonce : singulier, pluriel, rien quand personne n attend', () => {
  assert.equal(announcementOf(1), '1 conversation t\'attend');
  assert.equal(announcementOf(3), '3 conversations t\'attendent');
  assert.equal(announcementOf(0), null);
});

test('l annonce ne vient que d une apparition par evenement', () => {
  assert.equal(shouldAnnounce('hidden', 'compact', 'event'), true);
  assert.equal(shouldAnnounce('hidden', 'compact', 'pointer'), false);
  assert.equal(shouldAnnounce('compact', 'open', 'event'), false);
  assert.equal(shouldAnnounce('open', 'hidden', 'event'), false);
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

const fakeTimers = () => {
  const pending = new Map();
  let nextId = 1;
  return {
    setTimer: (run, delay) => { const id = nextId++; pending.set(id, { run, delay }); return id; },
    clearTimer: id => { pending.delete(id); },
    fire: () => { for (const [id, timer] of [...pending]) { pending.delete(id); timer.run(); } },
    count: () => pending.size,
  };
};

test('fermeture differee : s execute une fois, apres le delai', () => {
  const timers = fakeTimers();
  let runs = 0;
  const leave = createLeaveTimer({ ...timers, run: () => { runs++; } });
  leave.schedule();
  assert.equal(leave.isPending(), true);
  timers.fire();
  assert.equal(runs, 1);
  assert.equal(leave.isPending(), false);
});

test('fermeture differee : une fiche qui se rouvre l annule', () => {
  const timers = fakeTimers();
  let runs = 0;
  const leave = createLeaveTimer({ ...timers, run: () => { runs++; } });
  leave.schedule();
  leave.cancel();
  timers.fire();
  assert.equal(runs, 0);
  assert.equal(timers.count(), 0);
});

test('fermeture differee : replanifier ne laisse qu une minuterie', () => {
  const timers = fakeTimers();
  const leave = createLeaveTimer({ ...timers, run: () => {} });
  leave.schedule();
  leave.schedule();
  assert.equal(timers.count(), 1);
});

test('hasNewWaiting : une conversation qui se met a attendre est nouvelle', () => {
  const waiting = ['permission', 'done', 'external'];
  const rows = [{ engineId: 'a', status: 'permission' }, { engineId: 'b', status: 'thinking' }];
  assert.equal(hasNewWaiting(null, rows, waiting), false);
  assert.equal(hasNewWaiting(new Set(['a']), rows, waiting), false);
  assert.equal(hasNewWaiting(new Set(), rows, waiting), true);
  assert.equal(hasNewWaiting(new Set(['a']), [...rows, { engineId: 'c', status: 'done' }], waiting), true);
});

test('focusSelectorOf : retrouve un bouton du dock par data-mini ou data-engine', () => {
  const element = dataset => ({ dataset });
  assert.equal(focusSelectorOf(element({ mini: 'search' })), '[data-mini="search"]');
  assert.equal(focusSelectorOf(element({ engine: 'abc', action: 'team-open' })), '[data-engine="abc"][data-action="team-open"]');
  assert.equal(focusSelectorOf(element({})), null);
  assert.equal(focusSelectorOf(null), null);
});

test('focusSelectorOf : un identifiant avec des guillemets est echappe', () => {
  assert.equal(focusSelectorOf({ dataset: { mini: 'a"b' } }), '[data-mini="a\\"b"]');
});

test('zoneWordOf : un mot pour les etats voiles ; l attente a deja le sien dans l etat de la tete', () => {
  assert.equal(zoneWordOf('working'), 'au travail');
  assert.equal(zoneWordOf('later'), 'remise à plus tard');
  assert.equal(zoneWordOf('stuck'), 'bloquée');
  assert.equal(zoneWordOf('waiting'), "");
  assert.equal(zoneWordOf('rest'), '');
});
