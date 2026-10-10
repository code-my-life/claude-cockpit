const test = require('node:test');
const assert = require('node:assert/strict');

const sound = require('./identity-sound.js');
const { identityOf } = require('./identity.js');

const {
  SOUND_KINDS, DEFAULT_ENABLED, DEFAULT_VOLUME, MAX_VOLUME, MIN_GAP_MS, ROOT_HZ,
  noteIndexOf, frequencyOf, semitonesOf, planOf, envelopePoints, durationOf, clampVolume, createGate, shouldPlay, soundEventsOf,
  createPlayer,
} = sound;

const SEEDS = [0, 1, 7, 42, 999, 123456789, 4294967295, identityOf('a').seed, identityOf('session-b').seed];
const PENTATONIC_CLASSES = [0, 2, 4, 7, 9];

const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} proche de ${expected}`);

test('six kinds of sound; call, permission, done and error on by default, sent and appear off', () => {
  assert.deepEqual(SOUND_KINDS, ['call', 'permission', 'done', 'error', 'sent', 'appear']);
  assert.deepEqual(DEFAULT_ENABLED, { call: true, permission: true, done: true, error: true, sent: false, appear: false });
});

test('volume: 0.12 by default, never above 0.2, never negative', () => {
  assert.equal(DEFAULT_VOLUME, 0.12);
  assert.equal(MAX_VOLUME, 0.2);
  assert.equal(clampVolume(0.5), 0.2);
  assert.equal(clampVolume(-1), 0);
  assert.equal(clampVolume('abc'), DEFAULT_VOLUME);
  assert.equal(clampVolume(0.15), 0.15);
});

test('an identity always gets the same note, drawn from the seed', () => {
  for (const seed of SEEDS) assert.equal(noteIndexOf(seed), noteIndexOf(seed));
  const notes = new Set(Array.from({ length: 200 }, (unused, index) => noteIndexOf(identityOf(`id-${index}`).seed)));
  assert.ok(notes.size >= 6);
});

test('notes stay on a pentatonic scale', () => {
  for (let index = 0; index < 30; index++) {
    assert.ok(PENTATONIC_CLASSES.includes(semitonesOf(index) % 12), String(index));
  }
  close(frequencyOf(0), ROOT_HZ);
  close(frequencyOf(5), ROOT_HZ * 2);
});

test('two identities sounding together stay consonant: no semitone, tritone or major seventh between any two notes', () => {
  const forbidden = [1, 6, 11];
  for (let first = 0; first < 14; first++) {
    for (let second = 0; second < 14; second++) {
      const interval = Math.abs(semitonesOf(first) - semitonesOf(second)) % 12;
      assert.ok(!forbidden.includes(interval), `${first} ${second}`);
    }
  }
});

test('every voice of every sound has an envelope of 60 to 250 ms', () => {
  for (const kind of SOUND_KINDS) {
    for (const seed of SEEDS) {
      for (const voice of planOf(kind, seed)) {
        const duration = durationOf(voice);
        assert.ok(duration >= 60 && duration <= 250, `${kind} ${duration}`);
      }
    }
  }
});

test('the envelope rises during the attack, holds, then falls to silence', () => {
  const voice = { attack: 0.01, hold: 0.04, decay: 0.15, gain: 0.8 };
  assert.deepEqual(envelopePoints(voice), [[0, 0], [0.01, 0.8], [0.05, 0.8], [0.2, 0]]);
  close(durationOf(voice), 200);
});

test('a sound is short and does not clip, whatever the volume', () => {
  for (const kind of SOUND_KINDS) {
    const voices = planOf(kind, 12345);
    const end = Math.max(...voices.map(voice => voice.delay + durationOf(voice) / 1000));
    assert.ok(end <= 0.6, kind);
    const total = voices.reduce((sum, voice) => sum + voice.gain, 0);
    assert.ok(total * MAX_VOLUME <= 0.35, kind);
  }
});

test('call plays the note of the identity', () => {
  const seed = 42;
  const [voice] = planOf('call', seed);
  close(voice.frequency, frequencyOf(noteIndexOf(seed)));
});

test('permission is a little higher than call', () => {
  for (const seed of SEEDS) {
    assert.ok(planOf('permission', seed)[0].frequency > planOf('call', seed)[0].frequency);
  }
});

test('done is a short rising chord of three notes of the scale', () => {
  const voices = planOf('done', 7);
  assert.equal(voices.length, 3);
  const frequencies = voices.map(voice => voice.frequency);
  assert.deepEqual([...frequencies].sort((a, b) => a - b), frequencies);
  const delays = voices.map(voice => voice.delay);
  assert.deepEqual([...delays].sort((a, b) => a - b), delays);
  assert.ok(delays[2] > delays[0]);
  for (const voice of voices) assert.ok(PENTATONIC_CLASSES.includes(Math.round(12 * Math.log2(voice.frequency / ROOT_HZ)) % 12));
});

test('error is a short low note, lower than call but still audible on small speakers', () => {
  for (const seed of SEEDS) {
    const [voice] = planOf('error', seed);
    assert.ok(voice.frequency < planOf('call', seed)[0].frequency);
    assert.ok(voice.frequency >= 100);
    assert.equal(voice.wave, 'triangle');
  }
});

test('sent is discreet and appearance is very soft', () => {
  const call = planOf('call', 9)[0];
  assert.ok(planOf('sent', 9)[0].gain < call.gain);
  assert.ok(planOf('appear', 9)[0].gain <= 0.4);
  assert.ok(planOf('appear', 9)[0].attack >= 0.05);
});

test('an unknown kind gives no sound', () => {
  assert.deepEqual(planOf('nimporte', 1), []);
});

test('the gate lets one sound of a kind through per second, another kind is independent', () => {
  let now = 10000;
  const gate = createGate(() => now);
  assert.equal(MIN_GAP_MS, 1000);
  assert.equal(gate.allow('call'), true);
  assert.equal(gate.allow('call'), false);
  assert.equal(gate.allow('error'), true);
  now += 999;
  assert.equal(gate.allow('call'), false);
  now += 1;
  assert.equal(gate.allow('call'), true);
});

test('shouldPlay: the global mute wins, then the kind switch', () => {
  assert.equal(shouldPlay({ isMuted: false, kinds: DEFAULT_ENABLED }, 'call'), true);
  assert.equal(shouldPlay({ isMuted: true, kinds: DEFAULT_ENABLED }, 'call'), false);
  assert.equal(shouldPlay({ isMuted: false, kinds: DEFAULT_ENABLED }, 'sent'), false);
  assert.equal(shouldPlay({ isMuted: false, kinds: { ...DEFAULT_ENABLED, sent: true } }, 'sent'), true);
  assert.equal(shouldPlay({ isMuted: false, kinds: DEFAULT_ENABLED }, 'nimporte'), false);
});

test('sound events: what changed to waiting, permission, done or error, nothing on the first render', () => {
  const previous = new Map([['a', 'thinking'], ['b', 'thinking'], ['c', 'thinking'], ['d', 'thinking'], ['e', 'done'], ['f', 'thinking']]);
  const rows = [
    { engineId: 'a', status: 'external' },
    { engineId: 'b', status: 'permission' },
    { engineId: 'c', status: 'done' },
    { engineId: 'd', status: 'error' },
    { engineId: 'e', status: 'done' },
    { engineId: 'f', status: 'thinking' },
    { engineId: 'g', status: 'done' },
  ];
  assert.deepEqual(soundEventsOf(previous, rows), [
    { engineId: 'a', kind: 'call' },
    { engineId: 'b', kind: 'permission' },
    { engineId: 'c', kind: 'done' },
    { engineId: 'd', kind: 'error' },
  ]);
  assert.deepEqual(soundEventsOf(null, rows), []);
});

// Faux AudioContext : enregistre les nœuds créés et ce qu'on en fait.
const createFakeAudio = (initialState = 'running') => {
  const log = { oscillators: [], gains: [], resumes: 0, suspends: 0 };
  const context = {
    state: initialState,
    currentTime: 5,
    destination: { id: 'destination' },
    createOscillator() {
      const node = { frequency: { value: 0 }, type: '', started: null, stopped: null, isConnected: false, connect() { node.isConnected = true; }, disconnect() { node.isConnected = false; }, start(at) { node.started = at; }, stop(at) { node.stopped = at; } };
      log.oscillators.push(node);
      return node;
    },
    createGain() {
      const node = { events: [], isConnected: false, gain: { setValueAtTime: (value, at) => node.events.push(['set', value, at]), linearRampToValueAtTime: (value, at) => node.events.push(['ramp', value, at]) }, connect() { node.isConnected = true; }, disconnect() { node.isConnected = false; } };
      log.gains.push(node);
      return node;
    },
    resume() { log.resumes++; context.state = 'running'; return Promise.resolve(); },
    suspend() { log.suspends++; context.state = 'suspended'; return Promise.resolve(); },
  };
  return { context, log };
};

const createTestPlayer = (initialState) => {
  const audio = createFakeAudio(initialState);
  const timers = [];
  let now = 0;
  const player = createPlayer({
    createContext: () => audio.context,
    clock: () => now,
    setTimer: (run, delay) => { timers.push({ run, delay }); return timers.length; },
    clearTimer: handle => { timers[handle - 1].run = () => {}; },
  });
  return { player, audio, timers, advance: ms => { now += ms; } };
};

const finishAll = log => { for (const node of log.oscillators) if (node.onended) node.onended(); };

test('player: creates no audio context until the first sound', () => {
  let created = 0;
  createPlayer({ createContext: () => { created++; return createFakeAudio().context; } });
  assert.equal(created, 0);
});

test('player: a call becomes one oscillator at the note frequency, with its envelope, started and stopped on time', () => {
  const { player, audio } = createTestPlayer();
  assert.equal(player.play('call', 42), true);
  const [oscillator] = audio.log.oscillators;
  const [gain] = audio.log.gains;
  const [voice] = planOf('call', 42);
  close(oscillator.frequency.value, voice.frequency);
  assert.equal(oscillator.type, 'sine');
  assert.ok(oscillator.started >= 5);
  close(oscillator.stopped - oscillator.started, durationOf(voice) / 1000, 0.02);
  const peak = Math.max(...gain.events.map(event => event[1]));
  close(peak, voice.gain * DEFAULT_VOLUME);
  assert.equal(gain.events[gain.events.length - 1][1], 0);
});

test('player: the volume is capped at 0.2', () => {
  const { player, audio } = createTestPlayer();
  player.setVolume(5);
  player.play('call', 1);
  const peak = Math.max(...audio.log.gains[0].events.map(event => event[1]));
  close(peak, planOf('call', 1)[0].gain * MAX_VOLUME);
});

test('player: after the sound, every node is disconnected and the context is suspended after a pause', () => {
  const { player, audio, timers } = createTestPlayer();
  player.play('done', 3);
  assert.equal(audio.log.oscillators.length, 3);
  assert.ok(audio.log.oscillators.every(node => node.isConnected));
  finishAll(audio.log);
  assert.ok(audio.log.oscillators.every(node => !node.isConnected));
  assert.ok(audio.log.gains.every(node => !node.isConnected));
  assert.equal(player.activeVoices(), 0);
  timers[timers.length - 1].run();
  assert.equal(audio.log.suspends, 1);
  assert.equal(audio.context.state, 'suspended');
});

test('player: a sound played while a voice is still running does not suspend the context', () => {
  const { player, audio, timers, advance } = createTestPlayer();
  player.play('call', 3);
  finishAll(audio.log);
  const idleTimer = timers[timers.length - 1];
  advance(1500);
  player.play('error', 3);
  idleTimer.run();
  assert.equal(audio.log.suspends, 0);
});

test('player: a suspended context is resumed before playing', async () => {
  const { player, audio } = createTestPlayer('suspended');
  player.play('call', 8);
  await Promise.resolve();
  assert.equal(audio.log.resumes, 1);
  assert.equal(audio.log.oscillators.length, 1);
});

test('player: no sound when muted, when the kind is off, or in a burst', () => {
  const { player, audio, advance } = createTestPlayer();
  player.setMuted(true);
  assert.equal(player.play('call', 1), false);
  player.setMuted(false);
  assert.equal(player.play('sent', 1), false);
  assert.equal(player.play('appear', 1), false);
  assert.equal(audio.log.oscillators.length, 0);
  assert.equal(player.play('call', 1), true);
  assert.equal(player.play('call', 2), false);
  advance(1000);
  assert.equal(player.play('call', 2), true);
  player.setKinds({ sent: true });
  assert.equal(player.play('sent', 1), true);
});

test('player: muting does not use up the burst allowance', () => {
  const { player } = createTestPlayer();
  player.setMuted(true);
  player.play('call', 1);
  player.setMuted(false);
  assert.equal(player.play('call', 1), true);
});

test('player: without audio support it stays silent without failing', () => {
  const player = createPlayer({ createContext: () => null });
  assert.equal(player.play('call', 1), false);
});

test('player: a failing context creation is swallowed', () => {
  const player = createPlayer({ createContext: () => { throw new Error('pas de son'); } });
  assert.equal(player.play('call', 1), false);
});

test('player: unlock resumes a suspended context on a gesture, and does nothing if there is none', async () => {
  const { player, audio } = createTestPlayer('suspended');
  player.unlock();
  assert.equal(audio.log.resumes, 0);
  player.play('call', 1);
  await Promise.resolve();
  audio.context.state = 'suspended';
  player.unlock();
  assert.equal(audio.log.resumes, 2);
});
