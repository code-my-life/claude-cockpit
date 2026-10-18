const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SHAPE_SELECTOR,
  ACTIVITY_THROTTLE_MS,
  isInsideShape,
  createPointerReporter,
  statusChanges,
  waitingCountOf,
  pinKindOf,
  announcementOf,
  shouldPauseLoops,
  shouldAnnounce,
  createThrottle,
  hasNewWaiting,
  TOAST_WIDTH,
  TOAST_MARGIN,
  toastExtentOf,
} = require('./island');

const targetMatching = selector => ({ closest: query => (query === selector ? {} : null) });

test('la forme de l ile est la forme de verre seule, plus de dock ni de fiche', () => {
  assert.deepEqual(SHAPE_SELECTOR.split(',').map(part => part.trim()), ['.island']);
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

test('waitingCountOf compte les conversations qui t attendent, pas les missions livrees', () => {
  const rows = [{ status: 'permission' }, { status: 'done', summary: { kind: 'question' } }, { status: 'done', summary: { kind: 'delivered' } }, { status: 'thinking' }];
  assert.equal(waitingCountOf(rows), 2);
  assert.equal(waitingCountOf([]), 0);
});

test('pinKindOf : une question a laquelle on peut repondre epingle fort, une mission livree epingle moins longtemps', () => {
  assert.equal(pinKindOf([{ status: 'external' }]), 'attention')
  assert.equal(pinKindOf([{ status: 'done', summary: { kind: 'question' } }]), 'attention')
  assert.equal(pinKindOf([{ status: 'done' }, { status: 'thinking' }]), 'done')
  assert.equal(pinKindOf([{ status: 'thinking' }]), 'none')
  assert.equal(pinKindOf([]), 'none')
})

test('pinKindOf : ce qu on ne peut pas traiter depuis l ile n epingle pas', () => {
  assert.equal(pinKindOf([{ status: 'permission' }]), 'none')
  assert.equal(pinKindOf([{ status: 'external', isCurrent: true }]), 'none')
  assert.equal(pinKindOf([{ status: 'external' }], { isServer: false }), 'none')
  assert.equal(pinKindOf([{ status: 'permission' }, { status: 'external' }]), 'attention')
})

test('reply field markup contains arrow SVG paths and correct attributes', () => {
  // This test will fail until the reply-field.js module is created and exports renderReplyField()
  // The markup should match the mockup exactly
  const { renderReplyField } = require('./reply-field');
  const html = renderReplyField();
  assert.match(html, /<label class="reply">/, 'should have label.reply');
  assert.match(html, /<input class="ep-input" type="text" placeholder="R[eé]pondre.?" \/>/, 'should have input.ep-input with placeholder');
  assert.match(html, /<button class="send" type="submit" aria-label="Envoyer">/, 'should have button.send with correct attributes');
  assert.match(html, /<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">/, 'should have SVG with correct attributes');
  assert.match(html, /<path d="M5 12h13" \/>/, 'should have first arrow path');
  assert.match(html, /<path d="M13 6l6 6-6 6" \/>/, 'should have second arrow path');
  assert.doesNotMatch(html, /ep-btn--primary/, 'should not have ep-btn--primary class');
  // Button should not have disc background or fill styles (SVG fill="none" is correct)
  assert.doesNotMatch(html, /<button[^>]*style="[^"]*background/, 'button should not have background style');
  assert.doesNotMatch(html, /<button[^>]*class="[^"]*fill/, 'button should not have fill class');
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

test('hasNewWaiting : une conversation qui se met a attendre est nouvelle', () => {
  const rows = [{ engineId: 'a', status: 'permission' }, { engineId: 'b', status: 'thinking' }];
  assert.equal(hasNewWaiting(null, rows), false);
  assert.equal(hasNewWaiting(new Set(['a']), rows), false);
  assert.equal(hasNewWaiting(new Set(), rows), true);
  assert.equal(hasNewWaiting(new Set(['a']), [...rows, { engineId: 'c', status: 'external' }]), true);
  assert.equal(hasNewWaiting(new Set(['a']), [...rows, { engineId: 'c', status: 'done' }]), false);
});

test('toasts: no toast takes no room, toasts take their height plus a margin and a fixed width', () => {
  assert.deepEqual(toastExtentOf(0, 0), { width: 0, height: 0 });
  assert.deepEqual(toastExtentOf(0, 120), { width: 0, height: 0 });
  assert.deepEqual(toastExtentOf(1, 96), { width: TOAST_WIDTH, height: 96 + TOAST_MARGIN });
  assert.equal(toastExtentOf(2, 200.4).height, 201 + TOAST_MARGIN);
});

test('a permission the island can answer pins it like a question', () => {
  const rows = [{ engineId: 'a', title: 'A', status: 'permission', updatedAt: 1 }];
  assert.equal(pinKindOf(rows, { isServer: true }), 'none');
  assert.equal(pinKindOf(rows, { isServer: true, permissions: [{ requestId: 'r', engineId: 'a' }] }), 'attention');
});
