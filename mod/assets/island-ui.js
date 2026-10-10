(function (root) {
  'use strict';

  // L'île côté page : une forme de verre qui s'étire (morphose), ses vues, les entités vivantes.
  // La forme mène, le contenu suit. La phase (caché, réduit, ouvert) est décidée par l'automate de l'app ;
  // ce module la reflète, rend les vues et branche les actions réelles du cockpit (fournies par la page).
  const W_COMPACT = 320;
  const W_OPEN = 760;
  const HERO_PX = 96;
  const HERO_COMPACT_PX = HERO_PX;
  const SPRING_OPEN = { zeta: 0.72, ms: 300 };
  const SPRING_CLOSE = { zeta: 0.9, ms: 260 };
  const FADE_IN_MS = 150;
  const FADE_OUT_MS = 100;
  const CONTENT_DELAY_MS = 110;
  const CONTENT_DELAY_CLOSE_MS = 70;
  const HOVER_INTENT_MS = 120;
  const GLASS_REFRESH_MS = 70;
  const AGE_TICK_MS = 1000;
  const OTHERS_SHOWN = 4;
  const LAYERS = ['compact', 'home', 'wait', 'order', 'new', 'park'];
  const SLOT_PX = { compact: 32, home: 96, wait: 64, order: 64, new: 64, park: 64 };
  const FOLDER_LIST_MAX = 120;
  const PARK_KINDS = {
    blocked: { title: 'Bloquée par…', ok: 'Marquer bloquée', chips: ['Attente client', 'Attente d\'un collègue', 'Accès manquant', 'Bug externe'] },
    later: { title: 'Je reviens dessus…', ok: 'Mettre de côté', chips: ['Pas prioritaire', 'Après la mise en prod', 'Demain', 'Quand j\'ai le temps'] },
  };

  const shellHtml = (typeof module !== 'undefined' && module.exports ? require('./island-shell.js') : root.CockpitIslandShell).shellHtml;
  const clamp01 = value => Math.min(1, Math.max(0, value));
  const upperFirst = text => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

  const create = ({ doc, win, host, model, entities, helpers, actions, desktop = null, announce = () => {} }) => {
    const { esc, icon, markdown, ageOf, activityOf, awaitingOf, statsLineOf, tintOf, openUrlOf, folderOf, isServer, quickReplies } = helpers;
    const reduceQuery = typeof win.matchMedia === 'function' ? win.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const S = {
      phase: 'hidden', view: 'home', focusId: null, by: 'click', nextView: null, nextBy: 'click', rows: [], key: '', waitIds: null,
      details: false, exact: false, parkKind: 'later', parkReason: '', images: [], folders: [], picked: [], sounds: true, isPointerIn: false,
    };
    const feed = model.createFeed({ max: 3 });
    const mounts = new Map();
    let hero = null;
    let heroKey = '';
    let cur = null;
    let tweens = {};
    let raf = 0;
    let lastGlass = 0;
    let settleTimer = 0;
    let ageTimer = 0;
    let extentTimer = 0;
    let lastExtent = '';
    let hang = 0;

    const $ = (selector, scope = host) => scope.querySelector(selector);
    const $$ = (selector, scope = host) => [...scope.querySelectorAll(selector)];
    host.innerHTML = shellHtml();
    const islandEl = $('#island');
    const stageEl = $('#stage');
    const heroEl = $('#hero');
    const layerEl = name => $(`#v-${name}`);

    // ---------------------------------------------------------------- Données
    const rows = () => S.rows;
    const focus = () => model.focusOf(rows(), S.focusId);
    const urgent = () => model.byUrgency(rows())[0] || null;
    const waiting = () => model.waitingOf(rows()).sort((a, b) => a.updatedAt - b.updatedAt);
    const rowOf = id => S.rows.find(row => row.engineId === id) || null;
    const canReply = row => Boolean(row) && model.canReply(row, { isServer });
    const tagHtml = (row, extra = '') => {
      const sig = model.signalOf(row);
      const toneClass = sig.tone ? ` ep-tag--${sig.tone}` : '';
      const lead = sig.tone ? '' : icon(sig.icon);
      return `<span class="ep-tag${toneClass} ${extra}">${lead}${esc(sig.word)}</span>`;
    };

    // ---------------------------------------------------------------- Entités vivantes
    const canvasHtml = (row, size) => `<canvas class="ent" data-ent="${esc(row.engineId)}" data-size="${size}" data-state="${model.entityStateOf(row)}" aria-hidden="true"></canvas>`;

    const mountIn = scope => {
      for (const canvas of $$('canvas[data-ent]', scope)) {
        const row = rowOf(canvas.dataset.ent);
        if (!row || mounts.has(canvas)) continue;
        const target = canvas.closest('.mini-head, button, a') || canvas;
        mounts.set(canvas, entities.mount(canvas, { seed: row.engineId, size: Number(canvas.dataset.size), state: model.entityStateOf(row), hoverTarget: target }));
      }
    };
    const unmountIn = scope => {
      for (const [canvas, mount] of [...mounts]) {
        if (scope && !scope.contains(canvas)) continue;
        mount.destroy();
        mounts.delete(canvas);
      }
    };

    const heroOf = row => {
      if (!hero) hero = entities.mount($('#heroCanvas'), { seed: row.engineId, size: HERO_COMPACT_PX, state: model.entityStateOf(row) });
      return hero;
    };
    const syncHero = () => {
      const row = S.phase === 'open' ? heroRowFor(S.view) : urgent();
      if (!row) return;
      const mount = heroOf(row);
      const key = `${row.engineId}|${S.phase === 'open' ? 'big' : 'small'}`;
      mount.setSeed(row.engineId);
      mount.setState(model.entityStateOf(row));
      if (key !== heroKey) { heroKey = key; mount.setSize(S.phase === 'open' ? HERO_PX : HERO_COMPACT_PX); }
      islandEl.style.setProperty('--conv-tint', tintOf(row.engineId) || 'var(--paper)');
      islandEl.dataset.conv = row.engineId;
    };
    const heroRowFor = view => {
      if (view === 'wait') return waiting()[0] || focus();
      return focus();
    };

    // ---------------------------------------------------------------- Vues
    const feedHtml = row => feed.linesOf(row, activityLabel).map(line => `<li class="body-s${line.isCurrent ? ' now' : ''}"><span aria-hidden="true">${icon(line.isCurrent ? 'play' : 'check')}</span><span class="t">${esc(line.label)}</span></li>`).join('');
    const activityLabel = row => upperFirst(activityOf(row)[1]);

    const bodyOf = row => {
      const kind = model.kindOf(row);
      if (kind === model.KIND_WORK) return `<ul class="feed" id="feed" aria-label="Fil d'activité">${feedHtml(row)}</ul>`;
      if (kind === model.KIND_STUCK) {
        const text = row.status === 'blocked' ? (row.park && row.park.reason ? row.park.reason : 'Bloquée, sans raison') : 'S\'est arrêtée sur une erreur.';
        return `<p class="body-s clamp">${esc(text)}</p>`;
      }
      const text = awaitingOf(row) || (kind === model.KIND_DONE ? 'A fini son tour.' : 'Regarde où en est cette conversation.');
      return `<p class="body-s clamp">${esc(text)}</p>`;
    };

    const primaryOf = row => {
      const kind = model.kindOf(row);
      const url = openUrlOf(row);
      const open = url ? `<button type="button" class="ep-btn ep-btn--primary" data-act="open">Ouvrir ${icon('open')}</button>` : '';
      if (row.status === 'blocked' && isServer) return `<button type="button" class="ep-btn ep-btn--primary" data-act="unpark">Reprendre ${icon('arrow')}</button>`;
      if (kind === model.KIND_WAIT && canReply(row)) return `<button type="button" class="ep-btn ep-btn--primary" data-act="reply">Répondre ${icon('arrow')}</button>`;
      if (open) return open;
      return canReply(row) ? `<button type="button" class="ep-btn ep-btn--primary" data-act="to-order">Envoyer un ordre ${icon('arrow')}</button>` : '';
    };

    const threadHtml = row => {
      const thread = (row.summary && row.summary.thread) || [];
      if (thread.length === 0) return '';
      const toggle = `<button type="button" class="ep-btn ep-btn--ghost ep-btn--sm" data-act="exact" aria-expanded="${S.exact}">${S.exact ? 'Masquer la réponse exacte' : 'Voir la réponse exacte'}</button>`;
      if (!S.exact) return toggle;
      const bubbles = thread.slice(-2).map(message => `<div class="is-bubble ${message.role === 'user' ? 'user' : 'assistant'}">${markdown(message.text)}</div>`).join('');
      return `${toggle}<div class="is-thread" tabindex="0" aria-label="Derniers messages">${bubbles}</div>`;
    };

    const detailsHtml = row => {
      const summary = row.summary && !row.summary.isLoading ? (row.summary.plain || row.summary.text || '') : '';
      const plain = summary ? `<div class="is-plain" tabindex="0" aria-label="Résumé">${markdown(summary)}</div>` : '<p class="ep-hint">Pas encore de résumé. « Rafraîchir » le demande.</p>';
      const btn = (act, label, ic, extra = '') => `<button type="button" class="ep-btn ep-btn--ghost ep-btn--sm" data-act="${act}" ${extra}>${icon(ic)} ${label}</button>`;
      const parked = row.status === 'blocked';
      const tools = [
        isServer ? btn('summarize', 'Rafraîchir', 'refresh') : '',
        isServer && row.cwd ? btn('terminal', 'Terminal', 'terminal') : '',
        isServer && model.kindOf(row) === model.KIND_WAIT ? btn('seen', 'Mettre au repos', 'eye') : '',
        isServer && !row.isCurrent && !parked ? btn('park', 'Plus tard', 'later', 'data-kind="later"') + btn('park', 'Bloquée', 'block', 'data-kind="blocked"') : '',
      ].join('');
      return `<div class="col">${plain}</div><div class="col">${threadHtml(row)}<div class="ep-cluster">${tools}</div></div>`;
    };

    const metaLine = row => {
      const stats = row.stats ? ` · ${statsLineOf(row)}` : '';
      return `<span class="caption-s" data-age="${row.updatedAt}">${esc(ageOf(row.updatedAt))}${esc(stats)}</span>`;
    };

    const renderDetails = row => {
      const box = $('#details');
      box.hidden = !(S.details && row);
      box.innerHTML = S.details && row ? detailsHtml(row) : '';
    };

    const renderHomeText = () => {
      const row = focus();
      const target = $('#homeText');
      if (!row) {
        renderDetails(null);
        target.innerHTML = '<h2 class="h4">Personne au travail</h2><p class="body-s">Aucune conversation ne bouge pour l\'instant. Lance-en une depuis l\'onglet « Nouvelle conversation ».</p>';
        return;
      }
      const toggle = `<button type="button" class="ep-btn ep-btn--ghost ep-btn--sm" data-act="details" aria-expanded="${S.details}" aria-controls="details">Détails</button>`;
      renderDetails(row);
      target.innerHTML = `<h2 class="h4">${esc(row.title)}</h2><div class="meta">${tagHtml(row)}${metaLine(row)}</div>${bodyOf(row)}<div class="is-acts">${primaryOf(row)}${toggle}</div>`;
    };

    const pillHtml = row => `<a href="#" class="ep-side-link mini-head" data-pick="${esc(row.engineId)}">${canvasHtml(row, 24)}<span class="pn">${esc(row.title)}</span>${tagHtml(row)}</a>`;

    const toolsHtml = () => {
      const btn = (act, label, ic, extra = '') => `<button type="button" class="ep-btn ep-btn--ghost ep-btn--icon ep-btn--sm" data-act="${act}" aria-label="${label}" title="${label}" ${extra}>${icon(ic)}</button>`;
      const sounds = `<button type="button" class="ep-btn ep-btn--ghost ep-btn--icon ep-btn--sm" data-act="sounds" aria-pressed="${S.sounds}" aria-label="Alertes sonores" title="Alertes sonores : ${S.sounds ? 'activées' : 'coupées'}">${icon('volume')}</button>`;
      return `<div class="is-tools" role="group" aria-label="Outils de l'île">${isServer ? btn('search', 'Rechercher dans les conversations', 'search') : ''}${btn('cockpit', 'Ouvrir le cockpit complet', 'expand')}${desktop ? sounds : ''}${desktop ? btn('quit', 'Quitter Claude Cockpit', 'x') : ''}</div>`;
    };

    const renderPills = () => {
      const focusRow = focus();
      const all = model.othersOf(rows(), focusRow ? focusRow.engineId : null, 99);
      const shown = all.slice(0, OTHERS_SHOWN).map(pillHtml).join('');
      const more = all.length > OTHERS_SHOWN ? `<button type="button" class="ep-btn ep-btn--ghost ep-btn--sm" data-act="cockpit">+${all.length - OTHERS_SHOWN} dans le cockpit</button>` : '';
      const empty = all.length === 0 ? '<p class="caption-s">Aucune autre conversation.</p>' : '';
      $('#homePills').innerHTML = `<p class="ep-side-title">Autres conversations</p>${shown}${empty}${more}${toolsHtml()}`;
    };

    const railHtml = () => {
      const focusRow = heroRowFor(S.view);
      const others = model.othersOf(rows(), focusRow ? focusRow.engineId : null, 3);
      return others.map(row => `<button type="button" class="ep-btn ep-btn--ghost ep-btn--icon mini-head" data-pick="${esc(row.engineId)}" aria-label="${esc(row.title)}, ${esc(model.signalOf(row).word)}" title="${esc(row.title)} : ${esc(model.signalOf(row).word)}">${canvasHtml(row, 28)}</button>`).join('');
    };

    const renderCompact = () => {
      const row = urgent();
      const sig = $('#cSig');
      if (!row) {
        sig.className = 'ep-tag';
        sig.textContent = 'Personne au travail';
        $('#cOthers').innerHTML = '';
        $('#compactBtn').setAttribute('aria-label', 'Ouvrir l\'île : personne au travail');
        return;
      }
      const g = model.signalOf(row);
      const word = model.compactWordOf(rows());
      sig.className = `ep-tag${g.tone ? ` ep-tag--${g.tone}` : ''}`;
      sig.innerHTML = `${g.tone ? '' : icon(g.icon)}${esc(word)}`;
      $('#cOthers').innerHTML = model.othersOf(rows(), row.engineId, 3).map(other => canvasHtml(other, 22)).join('');
      $('#compactBtn').setAttribute('aria-label', `Ouvrir l'île : ${row.title}, ${word}`);
    };

    const kindLabelOf = row => {
      if (row.status === 'permission') return 'demande d\'autorisation';
      if (row.status === 'external') return 'attend autre chose';
      return 'question de Claude';
    };

    const renderWait = () => {
      const row = waiting()[0] || focus();
      if (!row) return;
      $('#wName').textContent = row.title;
      $('#wKind').textContent = kindLabelOf(row);
      $('#wQuote').textContent = awaitingOf(row) || 'Regarde où en est cette conversation.';
      const can = canReply(row);
      $('#replyForm').hidden = !can;
      $('#wQuick').hidden = !can;
      $('#wQuick').innerHTML = can ? quickReplies.map(text => `<button type="button" class="ep-btn ep-btn--ghost ep-btn--sm" data-act="quick" data-text="${esc(text)}">${esc(text)}</button>`).join('') : '';
      const note = $('#wNote');
      note.hidden = can;
      note.textContent = row.status === 'permission' ? 'Cette demande d\'autorisation se traite dans Claude : l\'île ne peut pas la valider à ta place.' : (row.isCurrent ? 'C\'est la conversation qui fait tourner ce cockpit : réponds-lui directement dans l\'app.' : 'Répondre demande la version servie du cockpit.');
      const open = $('#wOpen');
      const url = openUrlOf(row);
      open.hidden = can || !url;
      open.innerHTML = url ? `<button type="button" class="ep-btn ep-btn--primary" data-act="open">Ouvrir dans Claude ${icon('open')}</button>` : '';
      $$('[data-rail]', layerEl('wait')).forEach(rail => { rail.innerHTML = railHtml(); });
    };

    const renderOrder = () => {
      const row = focus();
      $('#oName').textContent = row ? row.title : 'Aucune conversation';
      const sig = $('#oSig');
      sig.hidden = !row;
      if (row) { const g = model.signalOf(row); sig.className = `ep-tag${g.tone ? ` ep-tag--${g.tone}` : ''}`; sig.innerHTML = `${g.tone ? '' : icon(g.icon)}${esc(g.word)}`; }
      const can = canReply(row);
      $('#orderForm').hidden = !can;
      const note = $('#oNote');
      note.hidden = can;
      note.textContent = !row ? 'Rien à qui parler pour l\'instant.' : (row.status === 'permission' ? 'Une demande d\'autorisation attend dans Claude : un ordre écrit n\'y répond pas.' : (row.isCurrent ? 'C\'est la conversation qui fait tourner ce cockpit : réponds-lui directement dans l\'app.' : 'Donner un ordre demande la version servie du cockpit.'));
    };

    const renderPark = () => {
      const row = focus();
      const info = PARK_KINDS[S.parkKind];
      $('#pName').textContent = row ? row.title : '';
      $('#pTitle').textContent = info.title;
      $('#parkOk').textContent = info.ok;
      $('#parkChips').innerHTML = info.chips.map(chip => `<button type="button" class="ep-btn ep-btn--sm" data-act="park-chip" data-reason="${esc(chip)}">${esc(chip)}</button>`).join('');
    };

    const renderNewList = () => {
      const needle = $('#newSearch').value.trim().toLowerCase();
      const list = S.folders.filter(folder => folder.toLowerCase().includes(needle)).slice(0, FOLDER_LIST_MAX);
      $('#newList').innerHTML = list.length === 0 ? '<span class="caption-s">Aucun dépôt connu</span>' : list.map(folder => `<label class="is-item ep-check"><input type="checkbox" value="${esc(folder)}" ${S.picked.includes(folder) ? 'checked' : ''}><span class="is-item-text"><span class="is-name">${esc(folderOf(folder))}</span><span class="is-path">${esc(folder)}</span></span></label>`).join('');
      $('#newPicked').innerHTML = S.picked.map((folder, index) => `<span class="ep-tag ${index === 0 ? 'ep-tag--accent' : ''}">${index === 0 ? 'Principal · ' : ''}${esc(folderOf(folder))}</span>`).join('');
    };

    const renderOrderThumbs = () => {
      $('#orderThumbs').innerHTML = S.images.map((image, index) => `<div class="is-thumb"><img src="${image.url}" alt=""><button type="button" class="ep-btn ep-btn--ghost ep-btn--icon ep-btn--sm" data-act="rm-image" data-index="${index}" aria-label="Retirer l'image">${icon('x')}</button></div>`).join('');
    };

    // Les vues avec champs ne sont jamais réécrites en entier : seuls leurs textes changent.
    // Un rendu réécrit les vues : le focus clavier retrouve son bouton (par data-act ou data-pick).
    const focusKeyOf = el => {
      if (!el || !islandEl.contains(el) || !el.dataset) return null;
      if (el.dataset.act) return `[data-act="${el.dataset.act}"]`;
      if (el.dataset.pick) return `[data-pick="${el.dataset.pick.replace(/"/g, '\\"')}"]`;
      return null;
    };
    const renderAll = () => {
      const focusKey = focusKeyOf(doc.activeElement);
      renderViews();
      if (focusKey) { const again = $(focusKey, layerEl(S.phase === 'open' ? S.view : 'compact')); if (again) again.focus({ preventScroll: true }); }
    };
    const renderViews = () => {
      unmountIn(null);
      renderCompact();
      renderHomeText();
      renderPills();
      renderWait();
      renderOrder();
      renderPark();
      syncHero();
      mountVisible();
      refreshGlass();
    };

    const visibleLayers = () => {
      const target = S.phase === 'open' ? S.view : (S.phase === 'compact' ? 'compact' : null);
      return LAYERS.filter(name => name === target || (cur && (cur[`o:${name}`] || 0) > 0.02));
    };
    function mountVisible() { for (const name of visibleLayers()) mountIn(layerEl(name)); }

    // ---------------------------------------------------------------- Mouvement
    // __islandSlow : ralentisseur de mise au point (DevTools), sans effet tant qu'il n'est pas posé.
    const speed = () => (reduceQuery.matches ? 0 : (Number(win.__islandSlow) || 1));
    const slotOf = name => {
      const el = $('[data-slot]', layerEl(name));
      if (!el) return null;
      const a = el.getBoundingClientRect();
      const b = stageEl.getBoundingClientRect();
      return { x: a.left - b.left, y: a.top - b.top, size: SLOT_PX[name] };
    };
    const hdrH = () => $('#hdr').offsetHeight;
    const heightOf = view => {
      if (view === 'compact') return $('#v-compact .compact').offsetHeight;
      const layer = layerEl(view);
      layer.style.top = `${hdrH()}px`;
      return hdrH() + $('.is-body', layer).offsetHeight;
    };

    const targetFor = (phase, view) => {
      for (const name of LAYERS) if (name !== 'compact') layerEl(name).style.top = `${hdrH()}px`;
      const target = { w: W_COMPACT, h: heightOf('compact'), r: radiusOf(false), hx: 0, hy: 0, hs: 1, ho: 1, oh: 0 };
      for (const name of LAYERS) target[`o:${name}`] = 0;
      const layer = phase === 'open' ? view : 'compact';
      const place = slotOf(layer);
      if (place) { target.hx = place.x; target.hy = place.y; target.hs = place.size / HERO_PX; } else if (cur) { target.hx = cur.hx; target.hy = cur.hy; target.hs = cur.hs; }
      if (phase === 'hidden') { target.h = 0; return target; }
      if (phase === 'compact') { target['o:compact'] = 1; return target; }
      target.w = W_OPEN;
      target.h = heightOf(view);
      target.r = radiusOf(true);
      target.oh = 1;
      target[`o:${view}`] = 1;
      target.ho = view === 'new' ? 0 : 1;
      return target;
    };
    const radiusOf = isOpen => {
      const css = win.getComputedStyle(doc.documentElement);
      return isOpen ? 28 : (parseFloat(css.getPropertyValue('--radius-glass-s')) || 14);
    };

    const springs = { open: model.springEase(SPRING_OPEN, SPRING_OPEN.ms), close: model.springEase(SPRING_CLOSE, SPRING_CLOSE.ms), fade: p => 1 - (1 - p) * (1 - p) };
    const isFadeKey = key => key.startsWith('o:') || key === 'oh' || key === 'ho';

    const retarget = (target, isShrinking) => {
      const t0 = win.performance.now();
      const k = speed();
      for (const key of Object.keys(target)) {
        const to = target[key];
        if (tweens[key] && tweens[key].to === to) continue;
        if (cur[key] === to && !tweens[key]) continue;
        let delay = 0;
        let dur;
        let ease;
        if (isFadeKey(key)) {
          const appearing = to > cur[key];
          dur = appearing ? FADE_IN_MS : FADE_OUT_MS;
          delay = appearing ? (isShrinking ? CONTENT_DELAY_CLOSE_MS : CONTENT_DELAY_MS) : 0;
          ease = springs.fade;
        } else {
          dur = isShrinking ? SPRING_CLOSE.ms : SPRING_OPEN.ms;
          ease = isShrinking ? springs.close : springs.open;
        }
        tweens[key] = { from: cur[key], to, t0, delay: delay * k, dur: dur * k, ease };
      }
      schedule();
    };

    const evaluate = now => {
      let active = false;
      for (const key of Object.keys(tweens)) {
        const tween = tweens[key];
        const p = tween.dur <= 0 ? 1 : clamp01((now - tween.t0 - tween.delay) / tween.dur);
        cur[key] = tween.from + (tween.to - tween.from) * tween.ease(p);
        if (p >= 1) { cur[key] = tween.to; delete tweens[key]; } else active = true;
      }
      return active;
    };

    let lastRoom = -1;
    const apply = () => {
      islandEl.style.width = `${cur.w}px`;
      islandEl.style.height = `${Math.max(0, cur.h) + hang}px`;
      islandEl.style.setProperty('--r', `${cur.r}px`);
      islandEl.dataset.hidden = cur.h < 1 ? 'true' : 'false';
      heroEl.style.transform = `translate(${cur.hx}px, ${cur.hy}px) scale(${cur.hs})`;
      heroEl.style.opacity = cur.ho;
      $('#hdr').style.opacity = cur.oh;
      $('#hdr').style.visibility = cur.oh < 0.01 ? 'hidden' : 'visible';
      for (const name of LAYERS) {
        const el = layerEl(name);
        const opacity = cur[`o:${name}`];
        el.style.opacity = opacity;
        el.style.visibility = opacity < 0.01 ? 'hidden' : 'visible';
      }
      // Les toasts se posent sous l'île, où qu'elle en soit de sa morphose.
      const room = Math.round(cur.h) + 8;
      if (room !== lastRoom) { lastRoom = room; doc.body.style.setProperty('--dock-room', `${room}px`); }
    };

    const refreshGlass = () => { if (win.EncrePapier && win.EncrePapier.Glass) win.EncrePapier.Glass.refresh(islandEl); };
    const frame = () => {
      raf = 0;
      const now = win.performance.now();
      const active = evaluate(now);
      apply();
      if (active && now - lastGlass > GLASS_REFRESH_MS) { lastGlass = now; refreshGlass(); }
      if (active) { raf = win.requestAnimationFrame(frame); return; }
      onSettled();
    };
    function schedule() { if (!raf) raf = win.requestAnimationFrame(frame); }

    // Fin de morphose : le verre se recalcule, les entités des vues cachées s'arrêtent, la grande entité reprend sa taille.
    const onSettled = () => {
      win.clearTimeout(settleTimer);
      settleTimer = win.setTimeout(() => {
        refreshGlass();
        for (const name of LAYERS) if (!visibleLayers().includes(name)) unmountIn(layerEl(name));
        if (S.phase !== 'open' && hero) { heroKey = `${(urgent() || {}).engineId}|small`; hero.setSize(HERO_COMPACT_PX); }
      }, 80);
    };

    // ---------------------------------------------------------------- Phases et vues
    const rankOf = phase => (phase === 'hidden' ? 0 : phase === 'compact' ? 1 : 2);

    const pushExtent = (isShrinking, phase, view) => {
      if (!desktop) return;
      const h = Math.round(heightOf(phase === 'open' ? view : 'compact'));
      const w = phase === 'open' ? W_OPEN : W_COMPACT;
      const key = `${phase}:${w}x${h}`;
      if (key === lastExtent) return;
      lastExtent = key;
      win.clearTimeout(extentTimer);
      const send = () => (phase === 'open' ? desktop.setExpanded(true, w, h, S.by === 'hover', S.by !== 'click') : desktop.setDockSize(w, h));
      if (isShrinking && phase === 'open') extentTimer = win.setTimeout(send, SPRING_CLOSE.ms + 40);
      else send();
    };

    const setTabs = view => {
      const home = ['home', 'wait', 'park'].includes(view) ? 'home' : view;
      for (const el of $$('.ep-tab')) {
        const selected = el.dataset.tab === home;
        el.setAttribute('aria-selected', String(selected));
        el.tabIndex = selected ? 0 : -1;
      }
      $('#foldLabel').textContent = view === 'wait' ? 'Plus tard' : 'Replier';
    };

    const go = (phase, view, { silent = false } = {}) => {
      const previous = S.phase;
      S.phase = phase;
      S.view = view;
      if (phase !== 'open') { S.details = false; S.exact = false; stopAges(); }
      if (phase !== 'open') S.focusId = (urgent() || {}).engineId || null;
      renderAll();
      const target = targetFor(phase, view);
      const currentH = cur ? cur.h : target.h;
      const isShrinking = rankOf(phase) < rankOf(previous) || (phase === previous && target.h < currentH - 0.5);
      for (const name of LAYERS) layerEl(name).toggleAttribute('inert', !(phase === 'open' ? name === view : name === 'compact' && phase === 'compact'));
      $('#hdr').toggleAttribute('inert', phase !== 'open');
      setTabs(view);
      if (!cur) { cur = { ...target }; apply(); }
      else if (silent || speed() === 0) { cur = { ...target }; tweens = {}; apply(); onSettled(); }
      else retarget(target, isShrinking);
      pushExtent(isShrinking, phase, view);
      if (phase === 'open') startAges();
      mountVisible();
      if (phase === 'hidden') entities.pause(); else entities.resume();
    };

    const ageTick = () => {
      const now = Date.now();
      for (const el of $$('[data-age]')) {
        const row = focus();
        const stats = row && row.stats ? ` · ${statsLineOf(row)}` : '';
        el.textContent = `${ageOf(Number(el.dataset.age), now)}${stats}`;
      }
    };
    function startAges() { stopAges(); ageTimer = win.setInterval(ageTick, AGE_TICK_MS); }
    function stopAges() { if (ageTimer) { win.clearInterval(ageTimer); ageTimer = 0; } }

    const focusFirst = view => {
      const selector = { wait: '#replyInput', order: '#orderInput', new: '#newSearch', park: '#parkInput' }[view] || '[data-act="reply"], [data-act="open"], [data-act="to-order"], .ep-tab[aria-selected="true"]';
      const el = $(selector, layerEl(view)) || $(selector);
      if (el && !el.hidden && el.offsetParent !== null) el.focus({ preventScroll: true });
    };

    // Phase décidée par l'automate de l'app.
    const setPhase = (phase, cause) => {
      if (phase === S.phase && phase !== 'open') return;
      if (phase === 'open') {
        const view = S.nextView || 'home';
        S.by = S.nextBy;
        S.nextView = null;
        if (view === 'wait') S.focusId = (waiting()[0] || {}).engineId || S.focusId;
        else if (!S.focusId || !rowOf(S.focusId)) S.focusId = (urgent() || {}).engineId || null;
        go('open', view);
        if (S.by === 'click') win.setTimeout(() => focusFirst(view), reduceQuery.matches ? 0 : 200);
        return;
      }
      const hadFocus = islandEl.contains(doc.activeElement);
      go(phase, 'home');
      if (phase === 'compact' && hadFocus) $('#compactBtn').focus({ preventScroll: true });
    };

    const switchView = (view, { by } = {}) => {
      if (S.phase !== 'open') return;
      if (by) S.by = by;
      go('open', view);
    };

    const openWith = (view, by) => {
      S.nextView = view;
      S.nextBy = by;
      if (S.phase === 'open') { switchView(view, { by }); return; }
      if (!desktop) { setPhase('open', 'event'); return; }
      renderAll();
      desktop.setExpanded(true, W_OPEN, Math.round(targetFor('open', view).h), by === 'hover', by !== 'click');
    };

    const fold = () => {
      if (S.phase !== 'open') return;
      if (!desktop) { setPhase('compact', 'event'); return; }
      desktop.islandEscape();
    };

    // ---------------------------------------------------------------- Intention de survol
    const intent = model.createHoverIntent({
      delayMs: HOVER_INTENT_MS, setTimer: (run, ms) => win.setTimeout(run, ms), clearTimer: handle => win.clearTimeout(handle),
      onOpen: () => { if (S.isPointerIn && S.phase === 'compact') openWith('home', 'hover'); },
    });
    const pointer = isInside => {
      S.isPointerIn = isInside;
      if (isInside && S.phase === 'compact') intent.enter();
      if (!isInside) intent.leave();
    };
    const interacted = () => { if (S.by === 'hover') S.by = 'click'; };

    // ---------------------------------------------------------------- Actions
    const resolveReply = async (id, text, images) => {
      const row = rowOf(id);
      const ok = await actions.reply(id, text, images);
      if (!ok) return false;
      S.images = [];
      renderOrderThumbs();
      announce(`Réponse envoyée à ${row ? row.title : 'la conversation'}`);
      fold();
      return true;
    };

    const onSubmitReply = async event => {
      event.preventDefault();
      const row = waiting()[0] || focus();
      const input = $('#replyInput');
      const text = input.value.trim();
      if (!row || text.length === 0) return;
      input.readOnly = true;
      if (await resolveReply(row.engineId, text, [])) input.value = '';
      input.readOnly = false;
    };

    const onSubmitOrder = async event => {
      event.preventDefault();
      const row = focus();
      const input = $('#orderInput');
      const text = input.value.trim();
      if (!row || (text.length === 0 && S.images.length === 0)) return;
      const images = S.images.map(image => ({ type: image.type, base64: image.base64, url: image.url }));
      input.readOnly = true;
      if (await resolveReply(row.engineId, text, images)) input.value = '';
      input.readOnly = false;
    };

    const onSubmitPark = async event => {
      event.preventDefault();
      const row = focus();
      if (!row) return;
      const ok = await actions.park(row.engineId, S.parkKind, $('#parkInput').value.trim());
      if (ok) { $('#parkInput').value = ''; switchView('home'); }
    };

    const startNewConv = () => {
      const text = $('#newInput').value.trim();
      const error = actions.newConv(S.picked, text);
      $('#newNote').textContent = error || '';
      if (error) return;
      S.picked = [];
      $('#newInput').value = '';
      renderNewList();
      fold();
    };

    const readImage = file => new Promise(resolve => {
      const reader = new win.FileReader();
      reader.onload = () => { const url = String(reader.result); resolve({ type: file.type || 'image/png', base64: url.split(',')[1], url }); };
      reader.readAsDataURL(file);
    });

    const onPaste = async event => {
      const files = [...(event.clipboardData && event.clipboardData.items ? event.clipboardData.items : [])].filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile());
      if (files.length === 0) return;
      event.preventDefault();
      for (const file of files) S.images.push(await readImage(file));
      renderOrderThumbs();
      refreshExtent();
    };

    function refreshExtent() { if (S.phase === 'open') go('open', S.view); }

    const act = {
      reply: () => switchView('wait'),
      open: () => { const row = focus(); if (row) actions.open(row); },
      'to-order': () => switchView('order'),
      details: () => { S.details = !S.details; if (S.details) actions.ensureSummary(focus()); refreshExtent(); },
      exact: () => { S.exact = !S.exact; refreshExtent(); },
      summarize: () => { const row = focus(); if (row) actions.summarize(row.engineId); },
      terminal: () => { const row = focus(); if (row) actions.terminal(row.engineId); },
      seen: () => { const row = focus(); if (row) { actions.seen(row.engineId); S.details = false; refreshExtent(); } },
      unpark: () => { const row = focus(); if (row) actions.unpark(row.engineId); },
      park: el => { S.parkKind = el.dataset.kind === 'blocked' ? 'blocked' : 'later'; $('#parkInput').value = ''; switchView('park'); win.setTimeout(() => focusFirst('park'), 60); },
      'park-cancel': () => switchView('home'),
      'park-chip': el => { actions.park((focus() || {}).engineId, S.parkKind, el.dataset.reason).then(ok => { if (ok) switchView('home'); }); },
      quick: el => { const row = waiting()[0] || focus(); if (row) resolveReply(row.engineId, el.dataset.text, []); },
      'rm-image': el => { S.images.splice(Number(el.dataset.index), 1); renderOrderThumbs(); refreshExtent(); },
      search: () => actions.openCockpit('search'),
      cockpit: () => actions.openCockpit(null),
      sounds: () => actions.setSounds(!S.sounds),
      quit: () => actions.quit(),
    };

    host.addEventListener('click', event => {
      const el = event.target.closest('button, a, [data-pick]');
      if (!el || !islandEl.contains(el)) return;
      if (el.tagName === 'A') event.preventDefault();
      if (el.id === 'compactBtn') { openWith('home', 'click'); return; }
      interacted();
      if (el.id === 'foldBtn') { fold(); return; }
      if (el.dataset.tab) { S.focusId = (focus() || {}).engineId || null; switchView(el.dataset.tab); return; }
      if (el.dataset.pick) { S.focusId = el.dataset.pick; switchView(S.view === 'order' ? 'order' : 'home'); return; }
      if (el.id === 'startBtn') { startNewConv(); return; }
      const handler = act[el.dataset.act];
      if (handler) handler(el);
    });
    host.addEventListener('submit', event => event.preventDefault());
    $('#replyForm').addEventListener('submit', onSubmitReply);
    $('#orderForm').addEventListener('submit', onSubmitOrder);
    $('#parkForm').addEventListener('submit', onSubmitPark);
    $('#orderInput').addEventListener('paste', onPaste);
    $('#orderInput').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('#orderForm').requestSubmit(); } });
    $('#newSearch').addEventListener('input', renderNewList);
    $('#newInput').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); startNewConv(); } });
    $('#newList').addEventListener('change', event => {
      const folder = event.target.value;
      const others = S.picked.filter(item => item !== folder);
      S.picked = event.target.checked ? [...others, folder] : others;
      renderNewList();
    });
    $('#tabs').addEventListener('keydown', event => {
      const order = ['home', 'order', 'new'];
      const active = doc.activeElement;
      const current = order.indexOf(active && active.dataset ? active.dataset.tab : '');
      const next = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: order.length - 1 }[event.key];
      if (next === undefined || current < 0) return;
      event.preventDefault();
      const view = order[(next + order.length) % order.length];
      switchView(view);
      $(`#tab-${view}`).focus();
    });
    host.addEventListener('pointerdown', event => { if (!event.target.closest('.compact')) interacted(); });
    islandEl.addEventListener('pointerover', event => { const slotEl = event.target.closest('[data-slot]'); if (slotEl && hero) hero.hover(true); });
    islandEl.addEventListener('pointerout', event => { const slotEl = event.target.closest('[data-slot]'); if (slotEl && hero) hero.hover(false); });
    islandEl.addEventListener('pointerdown', event => { if (event.target.closest('[data-slot]') && hero) hero.press(); });
    if (reduceQuery.addEventListener) reduceQuery.addEventListener('change', () => { tweens = {}; });

    // ---------------------------------------------------------------- Données de la page
    const relevantKey = list => JSON.stringify(list.map(row => [row.engineId, row.status, row.title, row.tool || '', row.summary && row.summary.awaiting, row.summary && row.summary.kind, row.park && row.park.reason, row.stats && row.stats.messages, row.isCurrent, row.hostId, row.cwd]));

    const update = (list, { folders, sounds } = {}) => {
      S.rows = list;
      if (Array.isArray(folders) && folders.join('|') !== S.folderKey) { S.folderKey = folders.join('|'); S.folders = folders; renderNewList(); }
      if (typeof sounds === 'boolean' && sounds !== S.sounds) { S.sounds = sounds; if (S.phase === 'open') renderPills(); }
      feed.observe(list, Date.now(), activityLabel);
      const ids = model.waitingIdsOf(list);
      const fresh = model.newWaitOf(S.waitIds, list);
      S.waitIds = ids;
      const key = `${relevantKey(list)}|${S.focusId}|${S.view}|${S.phase}|${S.details}`;
      if (key !== S.key) {
        S.key = key;
        if (S.phase !== 'hidden') rerender();
        else renderCompact();
      }
      if (S.phase === 'open' && S.view === 'wait' && ids.size === 0) switchView('home');
      if (fresh) onFreshWait(fresh);
    };

    // Mise à jour en place : les vues avec champs gardent ce qu'on y tape.
    const rerender = () => {
      if (S.focusId && !rowOf(S.focusId)) S.focusId = (urgent() || {}).engineId || null;
      go(S.phase, S.view);
    };

    const onFreshWait = row => {
      announce(`${row.title} t'attend`);
      if (S.phase === 'open') { if (S.view === 'home' || S.view === 'wait') { S.focusId = row.engineId; switchView('wait'); } return; }
      S.focusId = row.engineId;
      openWith('wait', 'event');
    };

    const dispose = () => { stopAges(); unmountIn(null); if (hero) hero.destroy(); };

    renderNewList();
    hang = parseFloat(win.getComputedStyle(islandEl).getPropertyValue('--hang')) || 0;
    renderAll();
    cur = null;
    go('hidden', 'home', { silent: true });

    return { setPhase, update, openWith, fold, pointer, dispose, isOpen: () => S.phase === 'open', stateOf: () => ({ phase: S.phase, view: S.view, focusId: S.focusId }), pause: () => entities.pause(), resume: () => entities.resume() };
  };

  const api = { create, W_COMPACT, W_OPEN, HOVER_INTENT_MS };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.CockpitIslandUi = api;
})(typeof window !== 'undefined' ? window : globalThis);
