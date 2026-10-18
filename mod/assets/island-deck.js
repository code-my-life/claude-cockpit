(function (root) {
  'use strict';

  // La pile de cartes de l'île : la conversation visée dessus, retournée (sa face avant accueille le texte d'accueil et,
  // quand elle t'attend, les formulaires de réponse, déplacés tels quels pour garder ce qu'on y tape) ; les suivantes
  // dépassent derrière, par urgence ; un clic sur l'une d'elles la vise. Rien n'est recréé d'un rendu à l'autre.
  const SHOWN = 5;
  const STEP = 18;
  const PEEK = 56;
  const PEEK_DELAY_MS = 160;

  const createDeck = ctx => {
    const { S, model, helpers, $, islandEl } = ctx;
    const cards = () => root.CockpitCards;
    let peekTimer = 0;

    // Ce que le dos dit d'une conversation : mot d'état, âge, dossier, état de l'entité à graver.
    const infoOf = row => {
      const kind = model.kindOf(row);
      const states = root.CharacterCore ? root.CharacterCore.STATUS_TO_STATE : {};
      return { isWaiting: kind === model.KIND_WAIT, word: model.signalOf(row).word, age: helpers.ageOf(row.updatedAt, Date.now()), folder: helpers.folderOf(row.cwd), entityState: states[row.status] || 'idle' };
    };

    // La pile : la conversation visée d'abord, puis les autres par urgence.
    const stackOf = () => {
      const focus = ctx.focus();
      const others = model.byUrgency(S.rows).filter(row => !focus || row.engineId !== focus.engineId);
      return (focus ? [focus, ...others] : others).slice(0, SHOWN);
    };

    const wire = el => {
      el.addEventListener('pointerenter', () => { root.clearTimeout(peekTimer); if (el.classList.contains('is-below')) peekTimer = root.setTimeout(() => el.classList.add('is-peek'), PEEK_DELAY_MS); });
      el.addEventListener('pointerleave', () => { root.clearTimeout(peekTimer); el.classList.remove('is-peek'); });
      // Une carte du dessous visée d'un clic ; la carte du dessus garde le retournement de <sg-flip>.
      el.addEventListener('click', event => {
        if (!el.classList.contains('is-below')) return;
        event.stopImmediatePropagation();
        el.classList.remove('is-peek');
        S.diff = null;
        S.focusId = el.dataset.engine;
        ctx.ui.switchView('home', { by: 'click' });
      }, true);
      el.dataset.wired = '1';
    };

    // La face avant de la carte du dessus reçoit les nœuds existants : le texte d'accueil, et les formulaires de l'attente.
    const hostFront = (top, row) => {
      const body = top.querySelector('[data-body]');
      const home = $('#homeText');
      if (home && home.parentElement !== body) body.append(home);
      const alert = $('.alert-main');
      const waits = row && model.kindOf(row) === model.KIND_WAIT && (ctx.canReply(row) || model.permissionOf(S.permissions, row.engineId) !== null);
      const keep = $('#alertKeep');
      if (alert) {
        if (waits && alert.parentElement !== body) body.append(alert);
        if (!waits && keep && alert.parentElement !== keep) keep.append(alert);
      }
      body.classList.toggle('is-waiting', Boolean(waits));
    };

    // Les mini-cartes des pastilles et de l'état réduit : une par conversation et par taille, gardées d'un rendu à l'autre.
    const minis = new Map();
    const fillMinis = () => {
      if (!cards() || !cards().isReady()) return;
      for (const slot of islandEl.querySelectorAll('.mini-slot[data-mini-slot]')) {
        const row = ctx.rowOf(slot.dataset.miniSlot);
        if (!row) continue;
        const key = `${row.engineId}@${slot.style.getPropertyValue('--mini')}`;
        let mini = minis.get(key);
        if (!mini) { mini = root.document.createElement('sg-card'); mini.className = 'conv-mini'; mini.dataset.mini = row.engineId; mini.setAttribute('aria-hidden', 'true'); minis.set(key, mini); }
        for (const [name, value] of Object.entries(cards().miniAttrsOf(row, infoOf(row)))) if (mini.getAttribute(name) !== String(value)) mini.setAttribute(name, String(value));
        if (mini.parentElement !== slot) slot.replaceChildren(mini);
      }
      for (const [key, mini] of minis) if (!mini.isConnected) minis.delete(key);
    };

    const flash = (engineId, kind = 'wait') => { if (cards()) cards().react(engineId, kind); };

    const render = () => {
      fillMinis();
      const pile = $('#pile');
      if (!pile || !cards() || !cards().isReady()) return;
      // Configure cards before filling the stack (must happen in this order)
      const finishes = root.__CONVERSATIONS__ && root.__CONVERSATIONS__.cardFinishes;
      if (finishes !== undefined) cards().configure({ finishes });
      // If server is stale, don't render empty deck — home view shows update notice
      const stale = root.CockpitIsland && root.CockpitIsland.staleNoticeOf ? root.CockpitIsland.staleNoticeOf() : null;
      if (stale) return;
      const stack = stackOf();
      const seen = new Set();
      const stackEls = [];
      stack.forEach((row, i) => {
        const el = cards().cardIn(pile, row, infoOf(row));
        if (!el.dataset.wired) wire(el);
        seen.add(row.engineId);
        el.className = `conv-card${i > 0 ? ' is-below' : ''}`;
        el.dataset.engine = row.engineId;
        el.style.setProperty('--y', `${i * STEP}px`);
        el.style.setProperty('--s', String(1 - i * 0.02));
        el.style.zIndex = String(SHOWN + 1 - i);
        el.style.opacity = i > 3 ? '0' : '1';
        // l'ordre du DOM suit la pile : la carte du dessus est le premier enfant
        const expected = i === 0 ? pile.firstElementChild : stackEls[i - 1].nextElementSibling;
        if (expected !== el) pile.insertBefore(el, expected);
        stackEls.push(el);
        if (i === 0) { hostFront(el, row); el.flip(true); } else el.flip(false);
      });
      for (const el of [...pile.querySelectorAll(':scope > sg-flip')]) if (!seen.has(el.dataset.engine)) el.remove();
      pile.hidden = stack.length === 0;
      // hauteur : la carte du dessus, les bords qui dépassent et la place du glissement ; la fenêtre de l'île se mesure dessus
      const top = pile.firstElementChild;
      if (top) pile.style.height = `${top.offsetHeight + STEP * (Math.min(stack.length, 4) - 1) + PEEK}px`;
      islandEl.classList.add('cards');
    };

    return { render, fillMinis, flash, stackOf, infoOf };
  };

  const api = { createDeck, SHOWN, STEP, PEEK };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.CockpitIslandDeck = api;
})(typeof window !== 'undefined' ? window : globalThis);
