(function (root) {
  'use strict';

  // Les cartes des conversations (systems-generator) : une carte par conversation, dos holographique d'identité
  // (gravure et finition tirées du seed, rareté gagnée par le travail et la réactivité, état piloté par le statut),
  // face avant = le détail de la conversation ; et des mini-cartes à la place des pastilles. Les cartes sont
  // réconciliées, jamais recréées à chaque rafraîchissement : recréer une carte, c'est recompiler son shader.
  const STATE_OF_STATUS = { thinking: 'working', writing: 'working', tool: 'working', working: 'working', permission: 'permission', external: 'waiting', done: 'done', error: 'error', blocked: 'error', later: 'sleep', seen: 'rest' };
  const HEADING_BUDGET = 0.8;
  const HEADING_SIZE = 0.13;
  const FALLBACK_CHAR = 0.05;
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

  // Largeur d'un texte du dos, en part de la largeur de la carte : mesurée au canvas avec la police du lettrage,
  // estimée au nombre de caractères hors navigateur.
  let measureCtx = null;
  const measureHeading = text => {
    if (!measureCtx && root.document) {
      measureCtx = root.document.createElement('canvas').getContext('2d');
      const fonts = sg() && sg().DEFAULT_FONTS;
      if (measureCtx) measureCtx.font = `400 100px ${fonts ? fonts.display : 'Georgia, serif'}`;
    }
    return measureCtx ? measureCtx.measureText(text).width / 100 * HEADING_SIZE : text.length * FALLBACK_CHAR;
  };

  // Les mots qui tiennent sur une ligne, pris dans l'ordre à partir de `from`.
  const fillLine = (words, from, measure) => {
    let line = '';
    let next = from;
    while (next < words.length) {
      const candidate = line ? `${line} ${words[next]}` : words[next];
      if (measure(candidate) > HEADING_BUDGET) break;
      line = candidate;
      next++;
    }
    return { line, next };
  };

  // Raccourcit un texte, par mots puis par caractères, jusqu'à ce qu'il tienne suivi de « … ».
  const ellipsize = (text, measure) => {
    let cut = text;
    while (cut && measure(`${cut}…`) > HEADING_BUDGET) cut = cut.includes(' ') ? cut.slice(0, cut.lastIndexOf(' ')) : cut.slice(0, -1);
    return `${cut}…`;
  };

  // Le titre du dos sur deux lignes au plus (séparées par |) qui tiennent dans la carte, « … » quand il est trop long.
  const headingOf = (title, measure = measureHeading) => {
    const words = String(title || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';
    const first = fillLine(words, 0, measure);
    if (!first.line) return ellipsize(words[0], measure);
    if (first.next === words.length) return first.line;
    const second = fillLine(words, first.next, measure);
    if (second.next === words.length) return `${first.line}|${second.line}`;
    return `${first.line}|${ellipsize(second.line || words[second.next], measure)}`;
  };

  const setAttrs = (el, attrs) => {
    for (const [name, value] of Object.entries(attrs)) {
      const text = value === null || value === undefined ? '' : String(value);
      if (el.getAttribute(name) !== text) el.setAttribute(name, text);
    }
  };

  // Les attributs du dos pour une conversation ; `info` vient de la page : mot d'état, âge, dossier, attente.
  // Reduced motion: the card shaders stand still (live="false" keeps the image).
  const liveOf = () => (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'false' : 'true');
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
    // Focusable for the keyboard (Enter or Space turns it over, conversations.html). A group, not a button: its face
    // holds buttons of its own (audit 2026-10-20, P1 n° 5).
    el.tabIndex = 0;
    el.setAttribute('role', 'group');
    el.setAttribute('aria-roledescription', 'carte');
    const back = root.document.createElement('sg-card');
    setAttrs(back, attrs);
    const front = root.document.createElement('div');
    front.dataset.front = '';
    front.innerHTML = '<div class="sg-flip__body conv-card-body" data-body></div>';
    el.append(back, front);
    return el;
  };

  const syncCard = (el, row, info) => {
    setAttrs(el.querySelector('sg-card'), backAttrsOf(row, info));
    setAttrs(el, { 'aria-label': `${row.title}, ${info.word}. Entrée pour retourner la carte` });
    return el;
  };

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
      setAttrs(el.querySelector('sg-card'), { live: liveOf() });
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
      setAttrs(mini, { live: liveOf() });
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
