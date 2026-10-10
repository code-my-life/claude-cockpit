const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createMorph, springEase } = require('./morph')

// Horloge et planificateur factices : chaque « image » avance le temps de 8 ms.
const harness = () => {
  let time = 0
  const queue = []
  const frames = []
  const morph = createMorph({
    now: () => time,
    schedule: run => { queue.push(run) },
    cancel: () => { queue.length = 0 },
    apply: bounds => frames.push({ ...bounds, at: time }),
  })
  const tick = (ms = 8) => { time += ms; const run = queue.shift(); if (run) run() }
  const settle = (limit = 200) => { for (let i = 0; i < limit && queue.length > 0; i++) tick() }
  return { morph, frames, tick, settle, at: () => time }
}

const SMALL = { x: 800, y: 0, width: 320, height: 44 }
const BIG = { x: 580, y: 0, width: 760, height: 280 }

test('le ressort part de 0, arrive a 1 et depasse legerement', () => {
  const ease = springEase({ zeta: 0.72, ms: 300 })
  assert.equal(ease(0), 0)
  assert.equal(ease(1), 1)
  const peak = Math.max(...Array.from({ length: 101 }, (unused, index) => ease(index / 100)))
  assert.ok(peak > 1 && peak < 1.12)
})

test('la fenetre va de la pastille a l ile ouverte et finit exactement sur la cible', () => {
  const { morph, frames, settle } = harness()
  morph.jump(SMALL)
  frames.length = 0
  morph.to(BIG, { ms: 300, zeta: 0.72 })
  settle()
  assert.deepEqual({ ...frames[frames.length - 1], at: 0 }, { ...BIG, at: 0 })
  assert.ok(frames.length >= 20, `images : ${frames.length}`)
})

test('la fenetre reste centree : x suit la largeur a chaque image', () => {
  const { morph, frames, settle } = harness()
  morph.jump(SMALL)
  morph.to(BIG, { ms: 300, zeta: 0.72 })
  settle()
  for (const frame of frames) assert.ok(Math.abs(frame.x + frame.width / 2 - 960) <= 1)
})

test('aucune image n est appliquee deux fois a l identique', () => {
  const { morph, frames, settle } = harness()
  morph.jump(SMALL)
  morph.to(BIG, { ms: 300, zeta: 0.72 })
  settle()
  for (let i = 1; i < frames.length; i++) assert.notDeepEqual({ ...frames[i], at: 0 }, { ...frames[i - 1], at: 0 })
})

test('une nouvelle cible en cours de route repart de la taille courante', () => {
  const { morph, frames, tick, settle } = harness()
  morph.jump(SMALL)
  morph.to(BIG, { ms: 300, zeta: 0.72 })
  for (let i = 0; i < 12; i++) tick()
  const middle = { ...frames[frames.length - 1] }
  morph.to(SMALL, { ms: 260, zeta: 0.9 })
  settle()
  assert.ok(Math.abs(frames[frames.length - 1].width - SMALL.width) < 1)
  const afterRetarget = frames.slice(frames.indexOf(frames.find(f => f.at > middle.at)))
  assert.ok(Math.abs(afterRetarget[0].width - middle.width) < 80)
})

test('sans animation (mouvement reduit) : la cible est appliquee tout de suite', () => {
  const { morph, frames } = harness()
  morph.jump(SMALL)
  morph.to(BIG, { ms: 0, zeta: 0.72 })
  assert.deepEqual({ ...frames[frames.length - 1], at: 0 }, { ...BIG, at: 0 })
})

test('quand tout est fini plus rien n est planifie', () => {
  const { morph, settle } = harness()
  morph.jump(SMALL)
  morph.to(BIG, { ms: 300, zeta: 0.72 })
  settle()
  assert.equal(morph.isRunning(), false)
})

test('une meme cible redemandee ne relance rien', () => {
  const { morph, frames, settle } = harness()
  morph.jump(BIG)
  frames.length = 0
  morph.to(BIG, { ms: 300, zeta: 0.72 })
  settle()
  assert.equal(frames.length, 0)
})

test('onDone est appele une fois, a l arrivee', () => {
  const { morph, settle } = harness()
  let done = 0
  morph.jump(SMALL)
  morph.to(BIG, { ms: 300, zeta: 0.72, onDone: () => { done += 1 } })
  settle()
  assert.equal(done, 1)
})

test('reset oublie la geometrie : le prochain jump est applique meme a l identique', () => {
  const { morph, frames } = harness()
  morph.jump(SMALL)
  morph.reset()
  assert.equal(morph.boundsOf(), null)
  morph.jump(SMALL)
  assert.equal(frames.length, 2)
})
