(function (root) {
  'use strict';

  // Sons des identités : synthèse WebAudio (oscillateurs et gains), aucun fichier son.
  // La partie pure (notes, enveloppes, plans, anti rafale, événements) ne touche ni au DOM ni à l'horloge ;
  // le lecteur reçoit son AudioContext et ses minuteries, ce qui le rend testable.

  const SOUND_KINDS = ['call', 'permission', 'done', 'error', 'sent', 'appear'];
  // Appel, permission, terminé et erreur par défaut ; envoyé et apparition coupés.
  const DEFAULT_ENABLED = { call: true, permission: true, done: true, error: true, sent: false, appear: false };
  const DEFAULT_VOLUME = 0.12;
  const MAX_VOLUME = 0.2;
  // Jamais plus d'un son du même type par seconde.
  const MIN_GAP_MS = 1000;

  // Gamme pentatonique majeure sur deux octaves : deux notes quelconques restent consonantes
  // (aucun demi-ton, triton ou septième majeure entre elles).
  const ROOT_HZ = 220;
  const PENTATONIC = [0, 2, 4, 7, 9];
  const SEMITONES_PER_OCTAVE = 12;
  const NOTE_COUNT = 10;
  const OCTAVE_DOWN = 0.5;
  const NOTE_SALT = 0x9e3779b1;
  const UINT32_RANGE = 4294967296;

  const MS_PER_SECOND = 1000;
  const CHORD_STEPS = [0, 2, 4];
  const CHORD_DELAY_S = 0.07;
  const PERMISSION_STEP = 1;

  // Enveloppes : attaque, maintien, déclin en secondes (60 à 250 ms par voix) ; gain relatif au volume.
  const VOICE_SPECS = {
    call: { wave: 'sine', attack: 0.012, hold: 0.04, decay: 0.15, gain: 1 },
    permission: { wave: 'sine', attack: 0.01, hold: 0.05, decay: 0.15, gain: 1 },
    done: { wave: 'sine', attack: 0.01, hold: 0.03, decay: 0.12, gain: 0.5 },
    error: { wave: 'triangle', attack: 0.006, hold: 0.04, decay: 0.12, gain: 0.9 },
    sent: { wave: 'sine', attack: 0.004, hold: 0.012, decay: 0.06, gain: 0.35 },
    appear: { wave: 'sine', attack: 0.08, hold: 0.02, decay: 0.15, gain: 0.3 },
  };

  const clampVolume = value => {
    const number = Number(value);
    if (!Number.isFinite(number)) return DEFAULT_VOLUME;
    return Math.min(MAX_VOLUME, Math.max(0, number));
  };

  // Une note par identité, tirée du seed.
  const noteIndexOf = seed => Math.floor(((Math.imul(seed >>> 0, NOTE_SALT) >>> 0) / UINT32_RANGE) * NOTE_COUNT);

  const semitonesOf = index => PENTATONIC[index % PENTATONIC.length] + SEMITONES_PER_OCTAVE * Math.floor(index / PENTATONIC.length);

  const frequencyOf = index => ROOT_HZ * Math.pow(2, semitonesOf(index) / SEMITONES_PER_OCTAVE);

  const voiceOf = (kind, frequency, delay = 0) => {
    const spec = VOICE_SPECS[kind];
    return { frequency, wave: spec.wave, delay, attack: spec.attack, hold: spec.hold, decay: spec.decay, gain: spec.gain };
  };

  // L'erreur descend d'une octave sur la note de l'identité, sans passer sous les 100 Hz (petits haut-parleurs).
  const errorFrequencyOf = index => frequencyOf(index % PENTATONIC.length) * OCTAVE_DOWN;

  const PLANNERS = {
    call: index => [voiceOf('call', frequencyOf(index))],
    permission: index => [voiceOf('permission', frequencyOf(index + PERMISSION_STEP))],
    done: index => CHORD_STEPS.map((step, rank) => voiceOf('done', frequencyOf(index + step), rank * CHORD_DELAY_S)),
    error: index => [voiceOf('error', errorFrequencyOf(index))],
    sent: index => [voiceOf('sent', frequencyOf(index + PENTATONIC.length))],
    appear: index => [voiceOf('appear', frequencyOf(index))],
  };

  // Les voix d'un son : { frequency, wave, delay, attack, hold, decay, gain }.
  const planOf = (kind, seed) => (PLANNERS[kind] ? PLANNERS[kind](noteIndexOf(seed)) : []);

  const envelopePoints = ({ attack, hold, decay, gain }) => [[0, 0], [attack, gain], [attack + hold, gain], [attack + hold + decay, 0]];

  const durationOf = ({ attack, hold, decay }) => (attack + hold + decay) * MS_PER_SECOND;

  const createGate = clock => {
    const lastAt = new Map();
    return {
      allow(kind) {
        const now = clock();
        const last = lastAt.get(kind);
        if (last !== undefined && now - last < MIN_GAP_MS) return false;
        lastAt.set(kind, now);
        return true;
      },
    };
  };

  // Le réglage global « couper les sons » l'emporte sur les interrupteurs par type.
  const shouldPlay = ({ isMuted, kinds }, kind) => !isMuted && kinds[kind] === true;

  // Un son pour ce qui se met à attendre : question (appel), permission, mission livrée, erreur.
  const EVENT_KINDS = { external: 'call', permission: 'permission', done: 'done', error: 'error' };

  const soundEventsOf = (previous, rows) => {
    if (previous === null) return [];
    const events = [];
    for (const row of rows) {
      const before = previous.get(row.engineId);
      const kind = EVENT_KINDS[row.status];
      if (before === undefined || before === row.status || kind === undefined) continue;
      events.push({ engineId: row.engineId, kind });
    }
    return events;
  };

  const LEAD_S = 0.01;
  // Un contexte sans voix active est suspendu après ce délai : plus aucune activité audio au repos.
  const IDLE_SUSPEND_MS = 500;

  const defaultContext = () => {
    const Context = root.AudioContext || root.webkitAudioContext;
    return Context ? new Context() : null;
  };

  const rampsOf = (gainNode, voice, start, volume) => {
    const points = envelopePoints({ ...voice, gain: voice.gain * volume });
    gainNode.gain.setValueAtTime(points[0][1], start + points[0][0]);
    for (const [time, level] of points.slice(1)) gainNode.gain.linearRampToValueAtTime(level, start + time);
  };

  const createPlayer = ({ createContext = defaultContext, clock = () => root.performance.now(), setTimer = (run, delay) => root.setTimeout(run, delay), clearTimer = handle => root.clearTimeout(handle) } = {}) => {
    const gate = createGate(clock);
    const state = { isMuted: false, kinds: { ...DEFAULT_ENABLED }, volume: DEFAULT_VOLUME };
    let context = null;
    let isUnavailable = false;
    let activeVoices = 0;
    let idleTimer = null;

    const contextOf = () => {
      if (context !== null || isUnavailable) return context;
      try { context = createContext(); } catch { context = null; }
      isUnavailable = context === null;
      return context;
    };

    const cancelIdle = () => {
      if (idleTimer === null) return;
      clearTimer(idleTimer);
      idleTimer = null;
    };

    const suspendWhenIdle = () => {
      cancelIdle();
      idleTimer = setTimer(() => {
        idleTimer = null;
        if (activeVoices === 0 && context.state === 'running') context.suspend();
      }, IDLE_SUSPEND_MS);
    };

    const startVoice = (voice, start) => {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      oscillator.type = voice.wave;
      oscillator.frequency.value = voice.frequency;
      rampsOf(gainNode, voice, start + voice.delay, clampVolume(state.volume));
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      activeVoices++;
      oscillator.onended = () => {
        oscillator.disconnect();
        gainNode.disconnect();
        activeVoices--;
        if (activeVoices === 0) suspendWhenIdle();
      };
      oscillator.start(start + voice.delay);
      oscillator.stop(start + voice.delay + durationOf(voice) / MS_PER_SECOND);
    };

    const schedule = voices => {
      cancelIdle();
      const start = context.currentTime + LEAD_S;
      for (const voice of voices) startVoice(voice, start);
    };

    const play = (kind, seed) => {
      if (!shouldPlay(state, kind) || contextOf() === null || !gate.allow(kind)) return false;
      const voices = planOf(kind, seed);
      if (context.state === 'running') schedule(voices);
      else context.resume().then(() => schedule(voices), () => {});
      return true;
    };

    // Premier geste de l'utilisateur : le navigateur peut avoir laissé le contexte suspendu.
    const unlock = () => {
      if (context !== null && context.state === 'suspended') context.resume().catch(() => {});
    };

    return {
      play,
      unlock,
      activeVoices: () => activeVoices,
      setMuted: isMuted => { state.isMuted = isMuted === true; },
      setVolume: volume => { state.volume = volume; },
      setKinds: kinds => { state.kinds = { ...state.kinds, ...kinds }; },
    };
  };

  const api = {
    SOUND_KINDS, DEFAULT_ENABLED, DEFAULT_VOLUME, MAX_VOLUME, MIN_GAP_MS, ROOT_HZ, IDLE_SUSPEND_MS,
    clampVolume, noteIndexOf, semitonesOf, frequencyOf, planOf, envelopePoints, durationOf, createGate, shouldPlay, soundEventsOf, createPlayer,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  root.CockpitIdentitySound = api;
})(typeof window !== 'undefined' ? window : globalThis);
