const test = require('node:test');
const assert = require('node:assert/strict');

require('./cards.js');
const { headingOf } = globalThis.CockpitCards;

const measure = text => text.length * 0.05;

test('headingOf : un titre court tient sur une ligne', () => {
  assert.equal(headingOf('Une question', measure), 'Une question');
});

test('headingOf : un titre moyen se coupe en deux lignes', () => {
  assert.equal(headingOf('Une question courte', measure), 'Une question|courte');
});

test('headingOf : un titre long se coupe en deux lignes avec ellipsis sur la seconde', () => {
  assert.equal(headingOf('Refonte du menu de la barre des tâches', measure), 'Refonte du menu|de la barre des…');
});

test('headingOf : un titre très long se coupe tôt avec ellipsis sur la seconde ligne', () => {
  assert.equal(headingOf('Installation OpenCode avec Hermes sur WSL et Windows', measure), 'Installation|OpenCode avec…');
});

test('headingOf : un mot unique trop long est tronqué avec ellipsis', () => {
  assert.equal(headingOf('Supercalifragilisticexpialidocious', measure), 'Supercalifragil…');
});

test('headingOf : un mot trop long en début de seconde ligne est tronqué, pas remplacé par « … »', () => {
  assert.equal(headingOf('Installation Supercalifragilisticexpialidocious', measure), 'Installation|Supercalifragil…');
});

test('headingOf : titre vide ou espaces seulement donne chaîne vide', () => {
  assert.equal(headingOf('   ', measure), '');
});

test('headingOf : chaque ligne respecte le budget de mesure (≤ 0.8)', () => {
  const titles = [
    'Une question',
    'Une question courte',
    'Refonte du menu de la barre des tâches',
    'Installation OpenCode avec Hermes sur WSL et Windows',
    'Supercalifragilisticexpialidocious',
    '   ',
  ];
  for (const title of titles) {
    const result = headingOf(title, measure);
    const lines = result.split('|');
    assert.ok(lines.length <= 2, `trop de lignes pour "${title}" : ${lines.length}`);
    for (const line of lines) {
      assert.ok(measure(line) <= 0.8, `ligne dépasse le budget pour "${title}" : "${line}" = ${measure(line)}`);
    }
  }
});

test('headingOf : sans mesure (Node, pas de document) utilise le fallback', () => {
  assert.equal(headingOf('Une question'), 'Une question');
});

// Reproduction of issue #15 : actions on the front face of cards
// The cards module was already required above (line 4) and set CockpitCards on globalThis
// because window was undefined at load time. We set up a jsdom window here to test
// the sg-flip click delegation, but CockpitCards remains on globalThis.
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.customElements = dom.window.customElements;
global.HTMLElement = dom.window.HTMLElement;
global.MouseEvent = dom.window.MouseEvent;
global.CustomEvent = dom.window.CustomEvent;
global.setTimeout = dom.window.setTimeout;
global.CSS = dom.window.CSS;
global.Node = dom.window.Node;
global.Element = dom.window.Element;
const mockCtx = { measureText: () => ({ width: 100 }) };
dom.window.HTMLCanvasElement.prototype.getContext = () => mockCtx;
// Load systems-generator after jsdom setup so custom elements register on the jsdom window
require('./systems-generator/index.global.js');
const { createCard } = globalThis.CockpitCards;

test('createCard : un clic sur un bouton de la face avant ne retourne pas la carte', () => {
  const card = createCard(
    { engineId: 'test-engine', title: 'Test', status: 'working' },
    { system: 'default', fit: 'fill', seed: 0, finish: 'mat', rarity: 'common', state: 'rest', 'top-left': '', 'top-right': '', heading: 'Test', subtitle: '' }
  );
  dom.window.document.body.appendChild(card);
  assert.equal(card.hasAttribute('flipped'), false, 'card starts unflipped');
  const body = card.querySelector('[data-body]');
  assert.ok(body, '[data-body] exists');
  body.innerHTML = `<div class="card-actions">
    <button type="button" data-action="big">Agrandir</button>
    <button type="button" data-action="toggle">Replier</button>
  </div>`;
  body.querySelector('[data-action="big"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(card.hasAttribute('flipped'), false, 'big button click must not flip the card');
  body.querySelector('[data-action="toggle"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(card.hasAttribute('flipped'), false, 'toggle button click must not flip the card');
  card.remove();
});

test('createCard : clic sur le picto retourne la carte', () => {
  const card = createCard(
    { engineId: 'test-engine-2', title: 'Test', status: 'working' },
    { system: 'default', fit: 'fill', seed: 0, finish: 'mat', rarity: 'common', state: 'rest', 'top-left': '', 'top-right': '', heading: 'Test', subtitle: '' }
  );
  dom.window.document.body.appendChild(card);
  assert.equal(card.hasAttribute('flipped'), false);
  const picto = card.querySelector('.sg-flip__picto');
  assert.ok(picto, 'picto exists');
  picto.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(card.hasAttribute('flipped'), true, 'picto click must flip the card');
  card.remove();
});

test('createCard : clic sur le dos (sg-card) retourne la carte', () => {
  const card = createCard(
    { engineId: 'test-engine-3', title: 'Test', status: 'working' },
    { system: 'default', fit: 'fill', seed: 0, finish: 'mat', rarity: 'common', state: 'rest', 'top-left': '', 'top-right': '', heading: 'Test', subtitle: '' }
  );
  dom.window.document.body.appendChild(card);
  assert.equal(card.hasAttribute('flipped'), false);
  card.querySelector('sg-card').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(card.hasAttribute('flipped'), true, 'sg-card click must flip the card');
  card.remove();
});
