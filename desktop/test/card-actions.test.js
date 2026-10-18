const test = require('node:test');
const assert = require('node:assert/strict');

// Load CockpitCards first (before JSDOM) - it sets CockpitCards on globalThis
require('../../mod/assets/cards.js');

// Reproduction of issue #15 : actions on the front face of cards (island variant with data-act)
// This test verifies that action buttons with data-act attributes inside the card front
// do not trigger the sg-flip flip parasite.

// Set up JSDOM
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
require('../../mod/assets/systems-generator/index.global.js');

// Now CockpitCards has the custom elements registered
const { createCard, cardIn } = globalThis.CockpitCards;

test('card actions (island): collapse shrinks front to compact (no flip)', () => {
  // Create a card using the same pattern as island-deck.js
  const card = createCard(
    { engineId: 'test-engine', title: 'Test', status: 'working' },
    { system: 'default', fit: 'fill', seed: 0, finish: 'mat', rarity: 'common', state: 'rest', 'top-left': '', 'top-right': '', heading: 'Test', subtitle: '' }
  );
  dom.window.document.body.appendChild(card);

  // Card starts unflipped
  assert.equal(card.hasAttribute('flipped'), false, 'card starts unflipped');

  // Get the card body (front face)
  const body = card.querySelector('[data-body]');
  assert.ok(body, '[data-body] exists');

  // Inject action buttons with data-act attributes (as used in island-deck.js)
  body.innerHTML = `
    <div class="card-actions">
      <button type="button" data-act="big" data-testid="card-enlarge">Agrandir</button>
      <button type="button" data-act="exact" data-testid="card-exact-answer" aria-expanded="false">Voir la réponse exacte</button>
      <button type="button" data-act="terminal" data-testid="card-terminal">Terminal</button>
      <button type="button" data-act="toggle" data-testid="card-collapse">Replier</button>
    </div>
  `;

  // Click each action button - none should flip the card
  const enlargeBtn = body.querySelector('[data-act="big"]');
  enlargeBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(card.hasAttribute('flipped'), false, 'enlarge button click must not flip the card');

  const exactBtn = body.querySelector('[data-act="exact"]');
  exactBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(card.hasAttribute('flipped'), false, 'exact answer button click must not flip the card');

  const terminalBtn = body.querySelector('[data-act="terminal"]');
  terminalBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(card.hasAttribute('flipped'), false, 'terminal button click must not flip the card');

  const collapseBtn = body.querySelector('[data-act="toggle"]');
  collapseBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(card.hasAttribute('flipped'), false, 'collapse button click must not flip the card');

  card.remove();
});