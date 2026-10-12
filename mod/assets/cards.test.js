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
