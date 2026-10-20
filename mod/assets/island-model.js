(function (root) {
  'use strict';

  // Modèle de l'île : ce que la page sait des conversations, réduit à ce que l'île montre.
  // Module pur : ni DOM, ni horloge, ni Electron. Les minuteries sont injectées.
  const words = typeof module !== 'undefined' && module.exports ? require('./status-words.js') : root.CockpitStatusWords;
  const ACTIVE_STATUSES = ['thinking', 'writing', 'tool', 'working'];
  const WAIT_STATUSES = ['permission', 'external'];
  const STUCK_STATUSES = ['blocked', 'error'];

  const KIND_WAIT = 'wait';
  const KIND_DONE = 'done';
  const KIND_WORK = 'work';
  const KIND_STUCK = 'stuck';
  const RANK = { [KIND_WAIT]: 0, [KIND_STUCK]: 1, [KIND_DONE]: 2, [KIND_WORK]: 3 };
  const DEFAULT_OTHERS = 3;

  // Une tâche terminée qui pose une question attend, comme une permission.
  const kindOf = row => {
    if (WAIT_STATUSES.includes(row.status)) return KIND_WAIT;
    if (row.status === 'done') return row.summary && row.summary.kind === 'question' ? KIND_WAIT : KIND_DONE;
    if (ACTIVE_STATUSES.includes(row.status)) return KIND_WORK;
    if (STUCK_STATUSES.includes(row.status)) return KIND_STUCK;
    return null;
  };

  const shownOf = rows => rows.filter(row => kindOf(row) !== null);

  const compareUrgency = (first, second) => {
    const kindFirst = kindOf(first);
    const kindSecond = kindOf(second);
    if (kindFirst !== kindSecond) return RANK[kindFirst] - RANK[kindSecond];
    // Une attente se traite dans l'ordre d'arrivée, la permission d'abord ; le reste, le plus récent d'abord.
    if (kindFirst === KIND_WAIT) return words.waitRankOf(first) - words.waitRankOf(second) || first.updatedAt - second.updatedAt;
    return second.updatedAt - first.updatedAt;
  };

  const byUrgency = rows => [...shownOf(rows)].sort(compareUrgency);

  const signalOf = row => {
    const kind = kindOf(row);
    // Le mot précis du cockpit (Permission, Question, Mission livrée…), pas un mot propre à l'île.
    if (kind === KIND_WAIT || kind === KIND_DONE) {
      const wait = words.WAIT_KINDS[words.waitKindOf(row)];
      return kind === KIND_WAIT ? { kind, word: wait.label, icon: wait.icon, tone: 'warning' } : { kind, word: wait.label, icon: 'check', tone: 'success' };
    }
    if (kind === KIND_STUCK) return row.status === 'blocked' ? { kind, word: 'Bloquée', icon: 'block', tone: 'danger' } : { kind, word: 'En erreur', icon: 'x', tone: 'danger' };
    return { kind: KIND_WORK, word: 'Travaille', icon: 'play', tone: '' };
  };

  const waitingOf = rows => rows.filter(row => kindOf(row) === KIND_WAIT);
  const waitingIdsOf = rows => new Set(waitingOf(rows).map(row => row.engineId));

  const compactWordOf = rows => {
    const urgent = byUrgency(rows)[0];
    if (!urgent) return 'Personne au travail';
    // Le même compte que le cockpit et le lanceur : la mission livrée attend aussi tes ordres.
    const count = words.waitingCountOf(rows);
    return count > 1 ? words.waitingPhraseOf(count, false) : signalOf(urgent).word;
  };

  const STATE_OF_STATUS = { permission: 'permission', error: 'error', blocked: 'error', later: 'sleep' };
  const entityStateOf = row => {
    if (STATE_OF_STATUS[row.status]) return STATE_OF_STATUS[row.status];
    const kind = kindOf(row);
    if (kind === KIND_WAIT) return 'waiting';
    if (kind === KIND_DONE) return 'done';
    if (kind === KIND_WORK) return 'working';
    return 'idle';
  };

  const focusOf = (rows, focusId) => {
    const shown = shownOf(rows);
    return shown.find(row => row.engineId === focusId) || byUrgency(rows)[0] || null;
  };

  const othersOf = (rows, focusId, limit = DEFAULT_OTHERS) => byUrgency(rows).filter(row => row.engineId !== focusId).slice(0, limit);

  // Une attente nouvelle ouvre l'île ; au premier rendu on ne connaît rien, donc rien ne s'ouvre.
  const newWaitOf = (previousIds, rows) => {
    if (previousIds === null) return null;
    return waitingOf(rows).sort(compareUrgency).find(row => !previousIds.has(row.engineId)) || null;
  };

  // Une réponse écrite répond à une question, pas à une demande d'autorisation.
  const canReply = (row, { isServer }) => isServer && !row.isCurrent && row.status !== 'permission';

  // Une demande d'autorisation que l'app tient pour cette conversation : l'île peut alors Refuser, Autoriser ou Toujours.
  const PERMISSION_ARM_MS = 600;
  const permissionOf = (permissions, engineId) => (Array.isArray(permissions) ? permissions.find(entry => entry.engineId === engineId) || null : null);
  const canDecide = (row, permissions) => Boolean(row) && permissionOf(permissions, row.engineId) !== null;
  // Comme coucou : les boutons ignorent les clics le temps de lire la demande (un clic destiné à autre chose ne l'autorise pas).
  const isDecisionArmed = (shownAt, now) => typeof shownAt === 'number' && now - shownAt >= PERMISSION_ARM_MS;
  // Le délai que la conversation laisse à l'île avant que Claude ne pose la question lui-même : écrit en clair, la conversation qui
  // semble « en cours » dans Claude attend en fait cette réponse.
  const holdNoteOf = (deadlineAt, now) => {
    if (typeof deadlineAt !== 'number') return '';
    const left = Math.ceil((deadlineAt - now) / 1000);
    return left > 0 ? `Claude attend ta réponse ici. Sinon, il te la demande lui-même dans ${left} s.` : 'Claude te la demande maintenant dans sa propre fenêtre.';
  };
  // Ordre de la vue d'attente : une autorisation que l'île peut trancher d'abord (Claude est bloqué dessus), puis la plus ancienne attente.
  const waitOrderOf = (rows, permissions) => waitingOf(rows).sort((a, b) => Number(canDecide(b, permissions)) - Number(canDecide(a, permissions)) || a.updatedAt - b.updatedAt);

  // Fil d'activité : ce que la page a vu faire à une conversation (le nom de l'outil, rien de plus),
  // gardé en mémoire tant qu'elle travaille.
  const createFeed = ({ max = 3 } = {}) => {
    const steps = new Map();
    const keyOf = (row, labelOf) => `${row.status}|${labelOf(row)}`;
    const observe = (rows, now, labelOf) => {
      for (const row of rows) {
        if (!ACTIVE_STATUSES.includes(row.status)) { steps.delete(row.engineId); continue; }
        const list = steps.get(row.engineId) || [];
        const key = keyOf(row, labelOf);
        if (list.length > 0 && list[list.length - 1].key === key) continue;
        steps.set(row.engineId, [...list, { key, label: labelOf(row), at: now }].slice(-max));
      }
    };
    // Les étapes vues par le mod (fichier, lignes ajoutées et retirées, diff) quand il en a ; sinon le nom de l'outil relevé ici.
    // `diffAt` désigne l'étape dont l'île peut montrer le diff.
    const modLinesOf = row => row.steps.slice(-max).map((step, index, shown) => ({
      label: step.label, at: step.at, isCurrent: index === shown.length - 1, kind: step.kind, file: step.file || null,
      added: step.added, removed: step.removed, diffAt: step.diff ? step.at : null,
    }));
    const linesOf = (row, labelOf) => {
      if (!ACTIVE_STATUSES.includes(row.status)) return [];
      if (Array.isArray(row.steps) && row.steps.length > 0) return modLinesOf(row);
      const list = steps.get(row.engineId) || [];
      const current = { label: labelOf(row), at: null, isCurrent: true };
      if (list.length === 0) return [current];
      return list.map((step, index) => ({ label: step.label, at: step.at, isCurrent: index === list.length - 1 }));
    };
    return { observe, linesOf };
  };

  // Ressort à amortissement sous-critique : 1 - e^(-ζωt)(cos ωd t + (ζω/ωd) sin ωd t), sur `ms` millisecondes.
  const springEase = ({ zeta }, ms) => {
    const omega = 2 * Math.PI / (ms / 1000);
    const damped = omega * Math.sqrt(1 - zeta * zeta);
    return progress => {
      if (progress <= 0) return 0;
      if (progress >= 1) return 1;
      const t = progress * ms / 1000;
      return 1 - Math.exp(-zeta * omega * t) * (Math.cos(damped * t) + (zeta * omega / damped) * Math.sin(damped * t));
    };
  };

  // Intention de survol : l'île ne s'ouvre que si le pointeur reste.
  const createHoverIntent = ({ delayMs, setTimer, clearTimer, onOpen }) => {
    let handle = null;
    const cancel = () => {
      if (handle === null) return;
      clearTimer(handle);
      handle = null;
    };
    return {
      enter() {
        if (handle !== null) return;
        handle = setTimer(() => { handle = null; onOpen(); }, delayMs);
      },
      leave: cancel,
      cancel,
    };
  };

  const api = {
    ACTIVE_STATUSES, KIND_WAIT, KIND_DONE, KIND_WORK, KIND_STUCK, kindOf, shownOf, byUrgency, signalOf, waitingOf, waitingIdsOf, compactWordOf,
    entityStateOf, focusOf, othersOf, newWaitOf, canReply, permissionOf, canDecide, isDecisionArmed, waitOrderOf, holdNoteOf, PERMISSION_ARM_MS, createFeed, springEase, createHoverIntent,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.CockpitIslandModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
