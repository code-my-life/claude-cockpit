(function (root) {
  'use strict';

  // Les cartes des conversations (systems-generator) : une carte par conversation, dos holographique d'identité
  // (gravure et finition tirées du seed, rareté gagnée par le travail et la réactivité, état piloté par le statut),
  // face avant = le détail de la conversation ; et des mini-cartes à la place des pastilles. Les cartes sont
  // réconciliées, jamais recréées à chaque rafraîchissement : recréer une carte, c'est recompiler son shader.
  const STATE_OF_STATUS = { thinking: 'working', writing: 'working', tool: 'working', working: 'working', permission: 'permission', external: 'waiting', done: 'done', error: 'error', blocked: 'error', later: 'sleep', seen: 'rest' };
  const TITLE_SPLIT_FROM = 16;
  const MINI_FPS = 20;
  const FLASH_MS = 1400;
  const settings = { finishes: [] };

  const sg = () => root.SystemsGenerator || null;
  const isReady = () => Boolean(sg() && root.customElements && root.customElements.get('sg-flip'));

  // Réglages du mod : la liste des finitions permises (vide : toutes).
  const configure = ({ finishes } = {}) => {
    const known = sg() ? sg().FINISH_IDS : [];
    settings.finishes = String(finishes || '').split(/[\s,;]+/).map(f => f.trim().toLowerCase()).filter(f => known.includes(f));
  };

  // Rareté : travail accompli (temps actif, messages, outils, fichiers) et réactivité (combo de relances), score 0 à 1.
  const scoreOf = stats => {
    if (!stats) return 0;
    const part = (value, full) => Math.min(1, (Number(value) || 0) / full);
    const work = part(stats.activeMs, 4 * 3600 * 1000) * 0.4 + part(stats.messages, 60) * 0.25 + part(stats.tools, 200) * 0.15 + part(stats.files, 40) * 0.1;
    return Math.min(1, work + part(stats.combo, 10) * 0.1);
  };
  const rarityOf = row => sg().rarityOf(scoreOf(row.stats));
  const finishOf = row => {
    const all = sg().finishOf(row.engineId);
    if (settings.finishes.length === 0 || settings.finishes.includes(all)) return all;
    return settings.finishes[sg().FINISH_IDS.indexOf(all) % settings.finishes.length];
  };
  const systemOf = row => sg().systemOf(row.engineId);
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

  const setAttrs = (el, attrs) => {
    for (const [name, value] of Object.entries(attrs)) {
      const text = value === null || value === undefined ? '' : String(value);
      if (el.getAttribute(name) !== text) el.setAttribute(name, text);
    }
  };

  // Les attributs du dos pour une conversation ; `info` vient de la page : mot d'état, âge, dossier, attente.
  const backAttrsOf = (row, info) => ({
    system: systemOf(row), fit: 'fill', seed: row.engineId, finish: finishOf(row), rarity: rarityOf(row), state: stateOf(row, info.isWaiting),
    'top-left': info.word, 'top-right': info.age, heading: headingOf(row.title), subtitle: info.folder || '',
  });
  // La mini-carte : le même dos, sans texte, à cadence réduite.
  const miniAttrsOf = (row, info) => ({ system: systemOf(row), fit: 'fill', seed: row.engineId, finish: finishOf(row), rarity: rarityOf(row), state: stateOf(row, info.isWaiting), badge: '', fps: String(MINI_FPS) });

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

  const syncCard = (el, row, info) => { setAttrs(el.querySelector('sg-card'), backAttrsOf(row, info)); return el; };

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

  // Une mini-carte par conversation dans un conteneur (clé data-mini), réutilisée d'un rendu à l'autre.
  const miniIn = (container, row, info) => {
    let el = container.querySelector(`:scope > sg-card[data-mini="${CSS.escape(row.engineId)}"]`);
    if (!el) { el = root.document.createElement('sg-card'); el.className = 'conv-mini'; el.dataset.mini = row.engineId; el.setAttribute('aria-hidden', 'true'); }
    setAttrs(el, miniAttrsOf(row, info));
    return el;
  };

  // Une rangée de mini-cartes cliquables (data-av), réconciliée comme une section.
  const renderMinis = (container, rows, infoOf, labelOf = () => '') => {
    const existing = new Map();
    for (const el of container.querySelectorAll(':scope > [data-av]')) existing.set(el.dataset.av, el);
    let cursor = null;
    for (const row of rows) {
      const info = infoOf(row);
      let el = existing.get(row.engineId);
      if (el) existing.delete(row.engineId);
      else { el = root.document.createElement('button'); el.type = 'button'; el.className = 'mini'; el.dataset.av = row.engineId; el.append(root.document.createElement('span')); el.lastElementChild.className = 'av-level'; }
      el.setAttribute('aria-label', `${row.title}, ${info.word}`);
      el.title = row.title;
      const mini = miniIn(el, row, info);
      if (mini.parentElement !== el) el.prepend(mini);
      const label = labelOf(row);
      if (el.lastElementChild.textContent !== label) el.lastElementChild.textContent = label;
      if (cursor ? cursor.nextElementSibling !== el : container.firstElementChild !== el) container.insertBefore(el, cursor ? cursor.nextElementSibling : container.firstElementChild);
      cursor = el;
    }
    for (const el of existing.values()) el.remove();
  };

  // Réaction à un événement (terminé, erreur, nouvelle attente) : un éclat sur la carte et sa mini-carte.
  const react = (engineId, kind) => {
    for (const el of root.document.querySelectorAll(`[data-engine="${CSS.escape(engineId)}"], [data-av="${CSS.escape(engineId)}"], [data-mini="${CSS.escape(engineId)}"]`)) {
      el.classList.remove('is-flash');
      void el.offsetWidth;
      el.dataset.flash = kind;
      el.classList.add('is-flash');
      root.setTimeout(() => el.classList.remove('is-flash'), FLASH_MS);
    }
  };

  root.CockpitCards = { isReady, configure, renderLane, renderMinis, miniIn, cardIn, syncCard, createCard, backAttrsOf, miniAttrsOf, react, rarityOf, finishOf, systemOf, stateOf, scoreOf, headingOf };
})(typeof window !== 'undefined' ? window : globalThis);
