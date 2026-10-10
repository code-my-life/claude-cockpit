(function (root) {
  'use strict';

  // Réactions des identités génératives : une couche de modulation PURE (aucun accès au DOM ni à l'horloge).
  // modulationAt(réaction, ms écoulées) dit comment moduler le rendu d'une identité ; le rendu l'applique.

  const TAU = Math.PI * 2;

  // Attente (question, mission livrée) : relance toute les 6 s, coup de phase de 0,6 rad en 280 ms.
  const WAIT_PERIOD_MS = 6000;
  const PERMISSION_PERIOD_MS = 3000;
  const RELANCE_KICK_RAD = 0.6;
  const RELANCE_MS = 280;
  const PERMISSION_INK_BIAS = 0.06;
  // Terminé : quart de tour accéléré en 600 ms, puis retour à l'attente.
  const FINISH_KICK_RAD = Math.PI / 2;
  const FINISH_MS = 600;
  const FINISH_SPEED_BOOST = 1;
  // Pastille : saut de 4 px en ressort de 280 ms (une seule fois) ; erreur : deux déplacements de 2 px en 150 ms.
  const JUMP_PX = 4;
  const JUMP_MS = 280;
  // < 1 : la montée est plus rapide que la pose (ressort amorti, sans rebond).
  const JUMP_SKEW = 0.8;
  const SHAKE_PX = 2;
  const SHAKE_MS = 150;
  // Bloqué, erreur, plus tard.
  const BLOCKED_INK_BIAS = 0.15;
  const ERROR_INK_BIAS = 0.12;
  const REST_SPEED = 0.08;
  const LATER_SPEED = 0.04;
  const LATER_INK_BIAS = -0.08;
  // Survol : la tête se tourne vers toi en 280 ms, vitesse x1,5. Pression : coup de phase de 0,2 rad.
  const HOVER_MS = 280;
  const HOVER_SPEED = 1.5;
  const PRESS_KICK_RAD = 0.2;
  const PRESS_MS = 150;
  // Apparition de l'île : faces tracées en 450 ms (entre 300 et 600 ms), décalage de 40 ms par tête.
  const APPEAR_MS = 450;
  const APPEAR_STAGGER_MS = 40;
  // Cadence : 15 images/s au repos (identity.js), 30 pour l'instance qui réagit.
  const REACT_FPS = 30;
  const BADGE_SAMPLES = 8;

  const PERSISTENT_KINDS = ['wait', 'permission', 'finish', 'blocked', 'later', 'error'];
  const HELD_KINDS = ['hover'];
  // Pose « de face » vers laquelle se tourne la tête survolée : lacet et inclinaison en radians.
  const FACE_POSES = {
    chrome: { yaw: 0, tilt: 1.15 },
    helix: { yaw: 0, tilt: 1.1 },
    mobius: { yaw: 0, tilt: 1.1 },
    loft: { yaw: 0, tilt: 0.2 },
  };

  const NEUTRAL = Object.freeze({
    speedFactor: 1, phaseKick: 0, yawOffset: 0, tiltOffset: 0, inkBias: 0, drawProgress: 1, lift: 0, shiftX: 0, isAnimating: false,
  });

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const ratioOf = (ms, duration) => (duration <= 0 ? 1 : clamp(ms / duration, 0, 1));
  // Sortie douce : démarre vite, se pose sans rebond.
  const easeOut = ratio => 1 - Math.pow(1 - ratio, 3);
  const wrapAngle = angle => {
    const turned = (((angle + Math.PI) % TAU) + TAU) % TAU;
    return turned - Math.PI;
  };

  const asReaction = reaction => (typeof reaction === 'string' ? { kind: reaction } : (reaction || { kind: 'none' }));
  const withNeutral = changes => ({ ...NEUTRAL, ...changes });

  // Relance périodique : la première à `period`, chaque coup s'ajoute au précédent (phase cumulée).
  const relanceAt = (ms, period) => {
    if (ms < period) return { kick: 0, isAnimating: false };
    const cycles = Math.floor(ms / period);
    const into = ms - cycles * period;
    return { kick: RELANCE_KICK_RAD * (cycles - 1 + easeOut(ratioOf(into, RELANCE_MS))), isAnimating: into < RELANCE_MS };
  };

  // Ressort du saut : monte et se pose en JUMP_MS, ni rebond ni retour supplémentaire.
  const jumpAt = ms => {
    if (ms >= JUMP_MS) return 0;
    const ratio = ratioOf(ms, JUMP_MS);
    return JUMP_PX * Math.sin(Math.PI * Math.pow(ratio, JUMP_SKEW));
  };

  const shakeAt = ms => SHAKE_PX * Math.sin(TAU * ratioOf(ms, SHAKE_MS)) * (ms < SHAKE_MS ? 1 : 0);

  const waitAt = ms => {
    const { kick, isAnimating } = relanceAt(ms, WAIT_PERIOD_MS);
    return withNeutral({ phaseKick: kick, isAnimating });
  };

  const permissionAt = ms => {
    const { kick, isAnimating } = relanceAt(ms, PERMISSION_PERIOD_MS);
    return withNeutral({ phaseKick: kick, inkBias: PERMISSION_INK_BIAS, isAnimating });
  };

  const finishAt = ms => {
    const ratio = ratioOf(ms, FINISH_MS);
    const after = relanceAt(Math.max(0, ms - FINISH_MS), WAIT_PERIOD_MS);
    return withNeutral({
      phaseKick: FINISH_KICK_RAD * easeOut(ratio) + after.kick,
      speedFactor: 1 + FINISH_SPEED_BOOST * (1 - easeOut(ratio)),
      lift: jumpAt(ms),
      isAnimating: ms < FINISH_MS || after.isAnimating,
    });
  };

  const blockedAt = () => withNeutral({ speedFactor: 0, inkBias: BLOCKED_INK_BIAS });

  const laterAt = () => withNeutral({ speedFactor: LATER_SPEED / REST_SPEED, inkBias: LATER_INK_BIAS });

  const errorAt = (ms, isEvent) => withNeutral({
    speedFactor: 0,
    inkBias: ERROR_INK_BIAS,
    shiftX: isEvent ? shakeAt(ms) : 0,
    isAnimating: isEvent && ms < SHAKE_MS,
  });

  // Survol : les écarts (yawGap, tiltGap) vers la pose de face sont recalculés par le rendu à chaque image.
  const hoverAt = (reaction, ms, isLeaving) => {
    const ratio = easeOut(ratioOf(ms, HOVER_MS));
    const weight = isLeaving ? 1 - ratio : ratio;
    return withNeutral({
      speedFactor: 1 + (HOVER_SPEED - 1) * weight,
      yawOffset: (reaction.yawGap || 0) * weight,
      tiltOffset: (reaction.tiltGap || 0) * weight,
      isAnimating: ms < HOVER_MS,
    });
  };

  const pressAt = ms => withNeutral({ phaseKick: PRESS_KICK_RAD * easeOut(ratioOf(ms, PRESS_MS)), isAnimating: ms < PRESS_MS });

  const appearAt = (reaction, ms) => {
    const delay = (reaction.index || 0) * APPEAR_STAGGER_MS;
    const ratio = ratioOf(ms - delay, APPEAR_MS);
    return withNeutral({ drawProgress: ratio, isAnimating: ms < delay + APPEAR_MS });
  };

  const MODULATORS = {
    wait: (reaction, ms) => waitAt(ms),
    permission: (reaction, ms) => permissionAt(ms),
    finish: (reaction, ms) => finishAt(ms),
    blocked: () => blockedAt(),
    later: () => laterAt(),
    error: (reaction, ms) => errorAt(ms, reaction.isEvent === true),
    hover: (reaction, ms) => hoverAt(reaction, ms, false),
    unhover: (reaction, ms) => hoverAt(reaction, ms, true),
    press: (reaction, ms) => pressAt(ms),
    appear: (reaction, ms) => appearAt(reaction, ms),
  };

  // Une réaction (nom ou { kind, … }) et le temps écoulé depuis son début : la modulation à appliquer.
  const modulationAt = (reaction, elapsedMs) => {
    const spec = asReaction(reaction);
    const modulate = MODULATORS[spec.kind];
    if (modulate === undefined) return { ...NEUTRAL };
    return modulate(spec, Math.max(0, elapsedMs));
  };

  // Mouvement réduit : l'état final statique de chaque réaction, sans animation ni orientation vers le curseur.
  const FINAL_SPECS = {
    permission: { inkBias: PERMISSION_INK_BIAS },
    blocked: { inkBias: BLOCKED_INK_BIAS, speedFactor: 0 },
    error: { inkBias: ERROR_INK_BIAS, speedFactor: 0 },
    later: { inkBias: LATER_INK_BIAS, speedFactor: LATER_SPEED / REST_SPEED },
  };

  const finalModulationOf = reaction => withNeutral(FINAL_SPECS[asReaction(reaction).kind] || {});

  // Le statut d'une conversation donne la réaction de fond de sa tête (null : aucune).
  const STATUS_KINDS = { permission: 'permission', external: 'wait', done: 'wait', blocked: 'blocked', later: 'later', error: 'error' };
  const kindOfStatus = status => STATUS_KINDS[status] || null;

  // Les changements de statut qui déclenchent une réaction ponctuelle : arrivée en « done » (terminé) ou en erreur.
  const EVENT_KINDS = { done: 'finish', error: 'error' };

  const eventsOf = (previous, rows) => {
    if (previous === null) return [];
    const events = [];
    for (const row of rows) {
      const before = previous.get(row.engineId);
      if (before === undefined || before === row.status) continue;
      const kind = EVENT_KINDS[row.status];
      if (kind) events.push({ engineId: row.engineId, kind });
    }
    return events;
  };

  const statusMapOf = rows => new Map(rows.map(row => [row.engineId, row.status]));

  // Pose de face : écarts de lacet et d'inclinaison depuis la vue actuelle, par le plus court chemin.
  const faceGapOf = (family, current) => {
    const pose = FACE_POSES[family] || FACE_POSES.helix;
    return { yawGap: wrapAngle(pose.yaw - current.yaw), tiltGap: pose.tilt - current.tilt };
  };

  // Mouvement de la pastille d'état (badge), échantillonné sur la même modulation : { keyframes, duration } ou null.
  const BADGE_SPECS = {
    finish: { reaction: { kind: 'finish' }, duration: JUMP_MS },
    error: { reaction: { kind: 'error', isEvent: true }, duration: SHAKE_MS },
  };

  const badgeMotionOf = kind => {
    const spec = BADGE_SPECS[kind];
    if (spec === undefined) return null;
    const keyframes = [];
    for (let step = 0; step <= BADGE_SAMPLES; step++) {
      const sample = modulationAt(spec.reaction, (spec.duration * step) / BADGE_SAMPLES);
      keyframes.push({ transform: `translate(${sample.shiftX.toFixed(2)}px, ${(-sample.lift).toFixed(2)}px)`, offset: step / BADGE_SAMPLES });
    }
    return { keyframes, duration: spec.duration };
  };

  // Suivi des réactions d'une instance (état séparé du rendu, horloge injectée par l'appelant).
  const createMotionState = () => ({ persistent: null, persistentSince: 0, transients: [], phaseOffset: 0 });

  const isPersistent = kind => PERSISTENT_KINDS.includes(kind);
  const isHeld = kind => HELD_KINDS.includes(kind);

  const durationOf = reaction => {
    const durations = { hover: HOVER_MS, unhover: HOVER_MS, press: PRESS_MS };
    if (reaction.kind === 'appear') return (reaction.index || 0) * APPEAR_STAGGER_MS + APPEAR_MS;
    return durations[reaction.kind] ?? 0;
  };

  // Les coups de phase d'une réaction qui change ou se termine sont gardés : la tête ne saute pas en arrière.
  const bakedKick = (reaction, elapsedMs) => modulationAt(reaction, elapsedMs).phaseKick;

  const withPersistent = (state, reaction, now) => {
    const current = state.persistent;
    if (current !== null && current.kind === reaction.kind && current.isEvent === reaction.isEvent) return state;
    const baked = current === null ? 0 : bakedKick(current, now - state.persistentSince);
    return { ...state, persistent: reaction, persistentSince: now, phaseOffset: state.phaseOffset + baked };
  };

  const withoutPersistent = (state, now) => {
    if (state.persistent === null) return state;
    const baked = bakedKick(state.persistent, now - state.persistentSince);
    return { ...state, persistent: null, phaseOffset: state.phaseOffset + baked };
  };

  const OPPOSITES = { hover: 'unhover', unhover: 'hover' };

  const withTransient = (state, reaction, now) => {
    const isReplaced = entry => entry.reaction.kind === reaction.kind || entry.reaction.kind === OPPOSITES[reaction.kind];
    const kept = state.transients.filter(entry => !isReplaced(entry));
    return { ...state, transients: [...kept, { reaction, startedAt: now }] };
  };

  const startReaction = (state, reaction, now) => {
    const spec = asReaction(reaction);
    if (isPersistent(spec.kind)) return withPersistent(state, spec, now);
    if (spec.kind === 'none') return withoutPersistent(state, now);
    return withTransient(state, spec, now);
  };

  // Une réaction ponctuelle terminée garde son coup de phase ; un survol relâché n'en laisse aucun.
  const settle = (state, now) => {
    let phaseOffset = state.phaseOffset;
    const transients = [];
    for (const entry of state.transients) {
      const elapsed = now - entry.startedAt;
      const isDone = !isHeld(entry.reaction.kind) && elapsed >= durationOf(entry.reaction);
      if (isDone) phaseOffset += bakedKick(entry.reaction, elapsed);
      else transients.push(entry);
    }
    return { ...state, phaseOffset, transients };
  };

  const combine = parts => {
    const total = { ...NEUTRAL };
    for (const part of parts) {
      total.speedFactor *= part.speedFactor;
      total.phaseKick += part.phaseKick;
      total.yawOffset += part.yawOffset;
      total.tiltOffset += part.tiltOffset;
      total.inkBias += part.inkBias;
      total.drawProgress = Math.min(total.drawProgress, part.drawProgress);
      total.lift += part.lift;
      total.shiftX += part.shiftX;
      total.isAnimating = total.isAnimating || part.isAnimating;
    }
    return total;
  };

  // La modulation totale à l'instant `now` : réaction de fond + ponctuelles + coups de phase gardés.
  // `faceGap` (facultatif) donne les écarts vers la pose de face, recalculés à chaque image.
  const motionAt = (state, now, faceGap = null) => {
    const parts = [];
    if (state.persistent !== null) parts.push(modulationAt(state.persistent, now - state.persistentSince));
    for (const entry of state.transients) {
      const gap = faceGap !== null && (entry.reaction.kind === 'hover' || entry.reaction.kind === 'unhover') ? faceGap() : {};
      parts.push(modulationAt({ ...entry.reaction, ...gap }, now - entry.startedAt));
    }
    const total = combine(parts);
    return { ...total, phaseKick: total.phaseKick + state.phaseOffset };
  };

  const hasHover = state => state.transients.some(entry => entry.reaction.kind === 'hover');

  const api = {
    NEUTRAL, FACE_POSES, REACT_FPS, REST_SPEED, LATER_SPEED, JUMP_MS, SHAKE_MS, HOVER_MS, PRESS_MS, APPEAR_MS, APPEAR_STAGGER_MS,
    PERSISTENT_KINDS, wrapAngle, modulationAt, finalModulationOf, kindOfStatus, eventsOf, statusMapOf, faceGapOf, badgeMotionOf,
    createMotionState, startReaction, settle, motionAt, hasHover,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.CockpitIdentityMotion = api;
})(typeof window !== 'undefined' ? window : globalThis);
