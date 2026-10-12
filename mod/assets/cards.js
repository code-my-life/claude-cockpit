(function (root) {
  'use strict';

  // Les cartes des conversations (systems-generator) : une carte par conversation, dos holographique d'identité
  // (finition et gravure tirées du seed, rareté gagnée par le travail et la réactivité, état piloté par le statut),
  // face avant = le détail de la conversation. Les cartes sont réconciliées, jamais recréées à chaque rafraîchissement :
  // recréer une carte, c'est recompiler son shader.
  const STATE_OF_STATUS = { thinking: 'working', writing: 'working', tool: 'working', working: 'working', permission: 'permission', external: 'waiting', done: 'done', error: 'error', blocked: 'error', later: 'sleep', seen: 'rest' };
  const ENGRAVING_PX = 512;
  const TITLE_SPLIT_FROM = 16;

  const sg = () => root.SystemsGenerator || null;
  const isReady = () => Boolean(sg() && root.customElements && root.customElements.get('sg-flip'));

  // Rareté : travail accompli (temps actif, messages, outils, fichiers) et réactivité (combo de relances), score 0 à 1.
  const scoreOf = stats => {
    if (!stats) return 0;
    const part = (value, full) => Math.min(1, (Number(value) || 0) / full);
    const work = part(stats.activeMs, 4 * 3600 * 1000) * 0.4 + part(stats.messages, 60) * 0.25 + part(stats.tools, 200) * 0.15 + part(stats.files, 40) * 0.1;
    return Math.min(1, work + part(stats.combo, 10) * 0.1);
  };
  const rarityOf = row => sg().rarityOf(scoreOf(row.stats));
  const finishOf = row => sg().finishOf(row.engineId);
  const stateOf = (row, isWaiting) => (isWaiting ? (row.status === 'permission' ? 'permission' : 'waiting') : STATE_OF_STATUS[row.status] || 'rest');

  // Un titre long se coupe en deux lignes pour le lettrage du dos, à l'espace le plus proche du milieu.
  const headingOf = title => {
    const text = String(title || '').trim();
    if (text.length <= TITLE_SPLIT_FROM) return text;
    const middle = text.length / 2;
    let best = -1;
    for (let i = 0; i < text.length; i++) if (text[i] === ' ' && (best < 0 || Math.abs(i - middle) < Math.abs(best - middle))) best = i;
    return best > 0 ? `${text.slice(0, best)}|${text.slice(best + 1)}` : text;
  };

  // Gravure : le dessin de l'entité de la conversation (CharacterCore), figé, recuit quand son état change.
  const engravings = new Map();
  const engravingOf = (row, entityState) => {
    const draw = root.renderCharacter;
    if (typeof draw !== 'function') return null;
    const known = engravings.get(row.engineId);
    if (known && known.state === entityState) return known.canvas;
    const canvas = (known && known.canvas) || root.document.createElement('canvas');
    try {
      draw(row.engineId, ENGRAVING_PX, entityState, { canvas, t: 0, dpr: 1, reduced: true, since: Infinity });
    } catch (error) {
      root.console.warn('carte : dessin de l\'entité impossible', error);
      return null;
    }
    engravings.set(row.engineId, { state: entityState, canvas });
    return canvas;
  };

  const setAttrs = (el, attrs) => {
    for (const [name, value] of Object.entries(attrs)) {
      const text = value === null || value === undefined ? '' : String(value);
      if (el.getAttribute(name) !== text) el.setAttribute(name, text);
    }
  };

  // Les attributs du dos pour une conversation ; `info` vient de la page : mot d'état, âge, dossier, état de l'entité, attente.
  const backAttrsOf = (row, info) => ({
    system: 'image', fit: 'fill', seed: row.engineId, finish: finishOf(row), rarity: rarityOf(row), state: stateOf(row, info.isWaiting),
    'top-left': info.word, 'top-right': info.age, heading: headingOf(row.title), subtitle: info.folder || '', params: 'contrast=0.6, rest=0.4',
  });

  // Une carte par conversation, réutilisée d'un rendu à l'autre (clé : engineId sur [data-engine]).
  const createCard = (row, attrs) => {
    const el = root.document.createElement('sg-flip');
    el.className = 'conv-card';
    el.dataset.engine = row.engineId;
    const back = root.document.createElement('sg-card');
    setAttrs(back, attrs);
    const front = root.document.createElement('div');
    front.dataset.front = '';
    front.innerHTML = '<div class="sg-flip__body conv-card-body" data-body></div>';
    el.append(back, front);
    return el;
  };

  // Met une carte au niveau d'une conversation : attributs du dos et gravure (recuite seulement si l'état de l'entité change).
  const syncCard = (el, row, info) => {
    const back = el.querySelector('sg-card');
    setAttrs(back, backAttrsOf(row, info));
    const drawing = engravingOf(row, info.entityState);
    if (drawing && back.engraving !== drawing) back.engraving = drawing;
    return el;
  };

  // La carte d'une conversation dans un conteneur, réutilisée si elle y est déjà (clé : data-engine).
  const cardIn = (container, row, info) => {
    const known = container.querySelector(`:scope > sg-flip[data-engine="${CSS.escape(row.engineId)}"]`);
    return syncCard(known || createCard(row, backAttrsOf(row, info)), row, info);
  };

  // Réconcilie les cartes d'une section : dans l'ordre des lignes, en gardant chaque carte existante (et son retournement).
  const renderLane = (lane, rows, infoOf, frontHtmlOf) => {
    const existing = new Map();
    for (const el of lane.querySelectorAll(':scope > sg-flip[data-engine]')) existing.set(el.dataset.engine, el);
    let cursor = null;
    for (const row of rows) {
      const info = infoOf(row);
      let el = existing.get(row.engineId);
      if (el) existing.delete(row.engineId); else el = createCard(row, backAttrsOf(row, info));
      syncCard(el, row, info);
      const body = el.querySelector('[data-body]');
      const html = frontHtmlOf(row);
      if (body.dataset.html !== html) { body.innerHTML = html; body.dataset.html = html; }
      if (cursor ? cursor.nextElementSibling !== el : lane.firstElementChild !== el) lane.insertBefore(el, cursor ? cursor.nextElementSibling : lane.firstElementChild);
      cursor = el;
    }
    for (const el of existing.values()) el.remove();
    for (const el of lane.querySelectorAll(':scope > :not(sg-flip)')) el.remove();
  };

  root.CockpitCards = { isReady, renderLane, cardIn, syncCard, createCard, backAttrsOf, rarityOf, finishOf, stateOf, scoreOf, headingOf, engravingOf };
})(typeof window !== 'undefined' ? window : globalThis);
