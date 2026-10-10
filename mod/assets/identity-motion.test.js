const test = require('node:test');
const assert = require('node:assert/strict');

const motion = require('./identity-motion.js');
const { SPEEDS } = require('./identity.js');

const {
  NEUTRAL, REST_SPEED, finishTurnOf, modulationAt, finalModulationOf, kindOfStatus, eventsOf, statusMapOf, faceGapOf, badgeMotionOf,
  createMotionState, startReaction, settle, motionAt, wrapAngle, hasHover,
} = motion;

const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} proche de ${expected}`);

test('the reference rest speed follows the identity rest speed', () => {
  assert.equal(REST_SPEED, SPEEDS.rest);
});

test('an unknown reaction leaves the identity untouched', () => {
  assert.deepEqual(modulationAt('nimporte', 1000), { ...NEUTRAL });
  assert.deepEqual(modulationAt(undefined, 1000), { ...NEUTRAL });
});

test('waiting: no kick before 6 s, then +0.6 rad over 280 ms with a soft exit', () => {
  assert.equal(modulationAt('wait', 5999).phaseKick, 0);
  assert.equal(modulationAt('wait', 6000).phaseKick, 0);
  const half = modulationAt('wait', 6140);
  assert.ok(half.phaseKick > 0.3 && half.phaseKick < 0.6);
  close(modulationAt('wait', 6280).phaseKick, 0.6);
  close(modulationAt('wait', 11999).phaseKick, 0.6);
  assert.equal(modulationAt('wait', 6100).isAnimating, true);
  assert.equal(modulationAt('wait', 7000).isAnimating, false);
});

test('waiting: the soft exit slows down toward the end of the kick', () => {
  const early = modulationAt('wait', 6070).phaseKick - modulationAt('wait', 6000).phaseKick;
  const late = modulationAt('wait', 6280).phaseKick - modulationAt('wait', 6210).phaseKick;
  assert.ok(early > late);
});

test('waiting: kicks accumulate every 6 s and the speed is the existing one', () => {
  close(modulationAt('wait', 12280).phaseKick, 1.2);
  close(modulationAt('wait', 18500).phaseKick, 1.8);
  assert.equal(modulationAt('wait', 3000).speedFactor, 1);
  assert.equal(modulationAt('wait', 3000).inkBias, 0);
});

test('permission: kick every 3 s with a slightly denser ink', () => {
  const quiet = modulationAt('permission', 2000);
  assert.equal(quiet.phaseKick, 0);
  assert.equal(quiet.inkBias, 0.06);
  close(modulationAt('permission', 3280).phaseKick, 0.6);
  close(modulationAt('permission', 6280).phaseKick, 1.2);
});

test('finished: a visible quarter turn of the view in 600 ms, accelerated then back to the waiting speed', () => {
  assert.equal(modulationAt('finish', 0).yawOffset, 0);
  close(modulationAt('finish', 600).yawOffset, Math.PI / 2);
  close(modulationAt('finish', 5000).yawOffset, Math.PI / 2);
  assert.equal(modulationAt('finish', 600).phaseKick, 0);
  const start = modulationAt('finish', 0);
  const end = modulationAt('finish', 600);
  assert.ok(start.speedFactor > 1);
  assert.equal(end.speedFactor, 1);
  assert.equal(modulationAt('finish', 300).isAnimating, true);
  assert.equal(modulationAt('finish', 2000).isAnimating, false);
});

test('finished: then back to waiting, the next relance comes 6 s later', () => {
  assert.equal(modulationAt('finish', 5000).phaseKick, 0);
  close(modulationAt('finish', 600 + 6280).phaseKick, 0.6);
});

test('finished: the turn is set per family so that it reads at 56 px', () => {
  assert.equal(finishTurnOf('mobius'), Math.PI / 2);
  assert.equal(finishTurnOf('helix'), Math.PI / 2);
  assert.equal(finishTurnOf('loft'), Math.PI);
  assert.ok(finishTurnOf('chrome') >= Math.PI / 2);
  assert.equal(finishTurnOf('inconnu'), Math.PI / 2);
  close(modulationAt({ kind: 'finish', turn: Math.PI }, 600).yawOffset, Math.PI);
  close(modulationAt({ kind: 'finish', turn: Math.PI }, 300).yawOffset, Math.PI * (1 - Math.pow(0.5, 3)));
});

test('finished: the badge jumps by 4 px in 280 ms, once, and settles on zero', () => {
  assert.equal(modulationAt('finish', 0).lift, 0);
  let peak = 0;
  for (let ms = 0; ms <= 280; ms += 10) peak = Math.max(peak, modulationAt('finish', ms).lift);
  assert.ok(peak > 3.4 && peak <= 4);
  close(modulationAt('finish', 280).lift, 0);
  assert.equal(modulationAt('finish', 5000).lift, 0);
  assert.equal(modulationAt('finish', 6200).lift, 0);
});

test('blocked: rotation stopped and ink darkened by 0.15', () => {
  const blocked = modulationAt('blocked', 12345);
  assert.equal(blocked.speedFactor, 0);
  assert.equal(blocked.phaseKick, 0);
  assert.equal(blocked.inkBias, 0.15);
});

test('later: speed 0.04 (half of the rest speed) and a lighter line', () => {
  const later = modulationAt('later', 100);
  close(later.speedFactor * REST_SPEED, 0.04);
  assert.ok(later.inkBias < 0);
});

test('error: stopped, dense ink, the badge moves 2 px sideways twice in 150 ms', () => {
  const settled = modulationAt('error', 2000);
  assert.equal(settled.speedFactor, 0);
  assert.ok(settled.inkBias > 0.06);
  assert.equal(settled.shiftX, 0);
  const samples = [];
  for (let ms = 0; ms <= 150; ms += 5) samples.push(modulationAt({ kind: 'error', isEvent: true }, ms).shiftX);
  assert.ok(Math.max(...samples) > 1.9 && Math.max(...samples) <= 2);
  assert.ok(Math.min(...samples) < -1.9 && Math.min(...samples) >= -2);
  const crossings = samples.slice(1).filter((value, index) => Math.sign(value) !== Math.sign(samples[index]) && value !== 0).length;
  assert.ok(crossings >= 2);
  close(modulationAt({ kind: 'error', isEvent: true }, 150).shiftX, 0);
  assert.equal(modulationAt({ kind: 'error', isEvent: true }, 400).isAnimating, false);
});

test('error: without the event flag the badge does not move', () => {
  assert.equal(modulationAt('error', 40).shiftX, 0);
  assert.equal(modulationAt('error', 40).isAnimating, false);
});

test('hover: turns toward the face pose in 280 ms and speeds up by 1.5', () => {
  const reaction = { kind: 'hover', yawGap: 1, tiltGap: -0.4 };
  const start = modulationAt(reaction, 0);
  const end = modulationAt(reaction, 280);
  assert.equal(start.yawOffset, 0);
  assert.equal(start.speedFactor, 1);
  close(end.yawOffset, 1);
  close(end.tiltOffset, -0.4);
  close(end.speedFactor, 1.5);
  assert.equal(modulationAt(reaction, 5000).yawOffset, end.yawOffset);
  assert.equal(modulationAt(reaction, 5000).isAnimating, false);
});

test('hover: leaving brings the head back in 280 ms', () => {
  const reaction = { kind: 'unhover', yawGap: 1, tiltGap: -0.4 };
  close(modulationAt(reaction, 0).yawOffset, 1);
  close(modulationAt(reaction, 0).speedFactor, 1.5);
  close(modulationAt(reaction, 280).yawOffset, 0);
  close(modulationAt(reaction, 280).speedFactor, 1);
});

test('press: a phase kick of 0.2 rad', () => {
  assert.equal(modulationAt('press', 0).phaseKick, 0);
  close(modulationAt('press', 150).phaseKick, 0.2);
  close(modulationAt('press', 900).phaseKick, 0.2);
});

test('appearance: faces drawn over 450 ms, 40 ms later for each head', () => {
  assert.equal(modulationAt({ kind: 'appear', index: 0 }, 0).drawProgress, 0);
  assert.equal(modulationAt({ kind: 'appear', index: 0 }, 450).drawProgress, 1);
  assert.equal(modulationAt({ kind: 'appear', index: 3 }, 120).drawProgress, 0);
  assert.ok(modulationAt({ kind: 'appear', index: 3 }, 120 + 225).drawProgress > 0);
  assert.equal(modulationAt({ kind: 'appear', index: 3 }, 120 + 450).drawProgress, 1);
  assert.ok(450 >= 300 && 450 <= 600);
});

test('reduced motion: each reaction gives a static final state', () => {
  const kinds = ['wait', 'permission', 'finish', 'blocked', 'later', 'error', 'hover', 'press', 'appear'];
  for (const kind of kinds) {
    const final = finalModulationOf(kind);
    assert.equal(final.isAnimating, false, kind);
    assert.equal(final.phaseKick, 0, kind);
    assert.equal(final.yawOffset, 0, kind);
    assert.equal(final.tiltOffset, 0, kind);
    assert.equal(final.lift, 0, kind);
    assert.equal(final.shiftX, 0, kind);
    assert.equal(final.drawProgress, 1, kind);
  }
  assert.equal(finalModulationOf('blocked').inkBias, 0.15);
  assert.equal(finalModulationOf('permission').inkBias, 0.06);
  assert.equal(finalModulationOf('wait').inkBias, 0);
  assert.ok(finalModulationOf('later').inkBias < 0);
});

test('status to background reaction', () => {
  assert.equal(kindOfStatus('permission'), 'permission');
  assert.equal(kindOfStatus('external'), 'wait');
  assert.equal(kindOfStatus('done'), 'wait');
  assert.equal(kindOfStatus('blocked'), 'blocked');
  assert.equal(kindOfStatus('later'), 'later');
  assert.equal(kindOfStatus('error'), 'error');
  assert.equal(kindOfStatus('thinking'), null);
  assert.equal(kindOfStatus(undefined), null);
});

test('events: only a change of status to done or error triggers a one-off reaction', () => {
  const previous = statusMapOf([
    { engineId: 'a', status: 'thinking' },
    { engineId: 'b', status: 'thinking' },
    { engineId: 'c', status: 'done' },
    { engineId: 'd', status: 'permission' },
  ]);
  const rows = [
    { engineId: 'a', status: 'done' },
    { engineId: 'b', status: 'error' },
    { engineId: 'c', status: 'done' },
    { engineId: 'd', status: 'thinking' },
    { engineId: 'e', status: 'done' },
  ];
  assert.deepEqual(eventsOf(previous, rows), [{ engineId: 'a', kind: 'finish' }, { engineId: 'b', kind: 'error' }]);
});

test('events: the first render reacts to nothing', () => {
  assert.deepEqual(eventsOf(null, [{ engineId: 'a', status: 'done' }]), []);
});

test('face pose: the shortest way for the yaw, and a tilt gap', () => {
  const gap = faceGapOf('helix', { yaw: 0.2 + Math.PI * 2, tilt: 0.5 });
  close(gap.yawGap, -0.2);
  close(gap.tiltGap, motion.FACE_POSES.helix.tilt - 0.5);
  assert.ok(Math.abs(wrapAngle(7)) <= Math.PI);
  assert.ok(faceGapOf('inconnu', { yaw: 0, tilt: 0 }).tiltGap > 0);
});

test('badge motion: sampled from the modulation, finish rises 4 px, error shakes 2 px', () => {
  const finish = badgeMotionOf('finish');
  assert.equal(finish.duration, 280);
  assert.equal(finish.keyframes[0].transform, 'translate(0.00px, 0.00px)');
  assert.ok(finish.keyframes.some(frame => /-3\.\d\dpx\)$/.test(frame.transform)));
  const error = badgeMotionOf('error');
  assert.equal(error.duration, 150);
  assert.ok(error.keyframes.some(frame => frame.transform.startsWith('translate(2.')));
  assert.ok(error.keyframes.some(frame => frame.transform.startsWith('translate(-2.')));
  assert.equal(badgeMotionOf('wait'), null);
});

test('state: a background reaction restarts only when it changes', () => {
  const first = startReaction(createMotionState(), 'wait', 1000);
  const again = startReaction(first, 'wait', 5000);
  assert.equal(again, first);
  assert.equal(again.persistentSince, 1000);
});

test('state: a changing reaction keeps its accumulated kicks, the head never jumps back', () => {
  const waiting = startReaction(createMotionState(), 'wait', 0);
  const before = motionAt(waiting, 6280).phaseKick;
  const blocked = startReaction(waiting, 'blocked', 6280);
  close(motionAt(blocked, 6280).phaseKick, before);
  close(motionAt(blocked, 60000).phaseKick, before);
  const none = startReaction(waiting, 'none', 6280);
  assert.equal(none.persistent, null);
  close(motionAt(none, 9000).phaseKick, before);
});

test('state: finish is a background reaction then falls back to the waiting relances', () => {
  const state = startReaction(startReaction(createMotionState(), 'wait', 0), 'finish', 1000);
  const total = motionAt(state, 1600);
  close(total.yawOffset, Math.PI / 2);
  assert.equal(total.speedFactor, 1);
});

test('state: the quarter turn is kept when the status changes again', () => {
  const finished = startReaction(createMotionState(), 'finish', 0);
  const blocked = startReaction(finished, 'blocked', 2000);
  close(motionAt(blocked, 9000).yawOffset, Math.PI / 2);
  const again = startReaction(blocked, 'finish', 9000);
  close(motionAt(again, 9600).yawOffset, Math.PI);
});

test('state: the face pose is aimed from the view already turned by a quarter turn', () => {
  const seen = [];
  const state = startReaction(startReaction(createMotionState(), 'finish', 0), 'hover', 1000);
  motionAt(state, 2000, carried => { seen.push(carried); return { yawGap: 0, tiltGap: 0 }; });
  close(seen[0], Math.PI / 2);
});

test('state: a press keeps its kick after it ends', () => {
  let state = startReaction(createMotionState(), 'press', 0);
  assert.equal(state.transients.length, 1);
  state = settle(state, 400);
  assert.equal(state.transients.length, 0);
  close(motionAt(state, 400).phaseKick, 0.2);
  close(settle(state, 900).phaseOffset, 0.2);
});

test('state: hover is held until the pointer leaves, then eases back and disappears', () => {
  const gap = () => ({ yawGap: 1, tiltGap: 0.5 });
  let state = startReaction(createMotionState(), 'hover', 0);
  state = settle(state, 10000);
  assert.equal(hasHover(state), true);
  close(motionAt(state, 10000, gap).yawOffset, 1);
  state = startReaction(state, 'unhover', 10000);
  assert.equal(hasHover(state), false);
  close(motionAt(state, 10000, gap).yawOffset, 1);
  close(motionAt(state, 10280, gap).yawOffset, 0);
  state = settle(state, 10500);
  assert.equal(state.transients.length, 0);
  assert.equal(state.phaseOffset, 0);
});

test('state: coming back under the pointer replaces a release in progress', () => {
  let state = startReaction(createMotionState(), 'hover', 0);
  state = startReaction(state, 'unhover', 1000);
  state = startReaction(state, 'hover', 1100);
  assert.equal(state.transients.length, 1);
  assert.equal(state.transients[0].reaction.kind, 'hover');
});

test('state: reactions add up: speed multiplies, ink and kicks add', () => {
  let state = startReaction(createMotionState(), 'permission', 0);
  state = startReaction(state, 'hover', 0);
  const total = motionAt(state, 400, () => ({ yawGap: 0.5, tiltGap: 0 }));
  assert.equal(total.inkBias, 0.06);
  close(total.speedFactor, 1.5);
  close(total.yawOffset, 0.5);
});

test('state: the appearance finishes by itself', () => {
  let state = startReaction(createMotionState(), { kind: 'appear', index: 2 }, 0);
  assert.equal(motionAt(state, 10).drawProgress < 1, true);
  state = settle(state, 80 + 450);
  assert.equal(state.transients.length, 0);
  assert.equal(motionAt(state, 600).drawProgress, 1);
});

test('face pose: loft keeps its rest tilt (a tilt of 0.2 flattened it into a cut fan)', () => {
  assert.equal(motion.FACE_POSES.loft.tilt, 0.55);
  assert.ok(motion.FACE_POSES.loft.tilt > 0.4);
});
