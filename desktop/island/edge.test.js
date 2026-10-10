const { test } = require('node:test')
const assert = require('node:assert/strict')
const { edgeZoneOf, isAtEdge, createEdgePoller, EDGE_WIDTH, EDGE_HEIGHT, POLL_INTERVAL_MS } = require('./edge')

const AREA = { x: 0, y: 0, width: 1920, height: 1040 }

const fakeClock = () => {
  let now = 0
  let nextId = 1
  const timers = new Map()
  return {
    setTimer: (callback, delay) => { const id = nextId++; timers.set(id, { callback, at: now + delay }); return id },
    clearTimer: id => { timers.delete(id) },
    advance: ms => {
      const end = now + ms
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (due === undefined) break
        timers.delete(due[0])
        now = due[1].at
        due[1].callback()
      }
      now = end
    },
    pending: () => timers.size,
  }
}

test('la zone de detection fait 320 x 4 px, en haut au centre', () => {
  assert.deepEqual(edgeZoneOf(AREA), { x: 800, y: 0, width: EDGE_WIDTH, height: EDGE_HEIGHT })
  assert.equal(EDGE_WIDTH, 320)
  assert.equal(EDGE_HEIGHT, 4)
})

test('la zone suit la zone utile d un ecran decale', () => {
  const area = { x: -1920, y: 40, width: 1920, height: 1000 }
  assert.deepEqual(edgeZoneOf(area), { x: -1920 + 800, y: 40, width: 320, height: 4 })
})

test('isAtEdge : dedans aux bornes incluses, dehors juste apres', () => {
  assert.equal(isAtEdge({ x: 800, y: 0 }, AREA), true)
  assert.equal(isAtEdge({ x: 1119, y: 3 }, AREA), true)
  assert.equal(isAtEdge({ x: 1120, y: 3 }, AREA), false)
  assert.equal(isAtEdge({ x: 799, y: 0 }, AREA), false)
  assert.equal(isAtEdge({ x: 960, y: 4 }, AREA), false)
})

const setupPoller = () => {
  const clock = fakeClock()
  const calls = []
  let cursor = { x: 0, y: 500 }
  const poller = createEdgePoller({ clock, getCursor: () => cursor, getArea: () => AREA, onEdge: value => calls.push(value) })
  return { clock, calls, poller, move: next => { cursor = next } }
}

test('le sondeur ne tourne pas tant qu on ne le demarre pas', () => {
  const { clock, poller } = setupPoller()
  assert.equal(poller.isRunning(), false)
  assert.equal(clock.pending(), 0)
})

test('le sondeur signale seulement les changements, toutes les 100 ms', () => {
  const { clock, calls, poller, move } = setupPoller()
  poller.start()
  clock.advance(POLL_INTERVAL_MS * 2)
  move({ x: 960, y: 1 })
  clock.advance(POLL_INTERVAL_MS * 3)
  move({ x: 960, y: 300 })
  clock.advance(POLL_INTERVAL_MS)
  assert.deepEqual(calls, [true, false])
})

test('arret : plus aucune minuterie, plus aucun sondage', () => {
  const { clock, calls, poller, move } = setupPoller()
  poller.start()
  poller.stop()
  move({ x: 960, y: 1 })
  clock.advance(POLL_INTERVAL_MS * 10)
  assert.equal(clock.pending(), 0)
  assert.deepEqual(calls, [])
  assert.equal(poller.isRunning(), false)
})

test('un curseur deja au bord au demarrage est signale tout de suite', () => {
  const { calls, poller, move } = setupPoller()
  move({ x: 960, y: 0 })
  poller.start()
  assert.deepEqual(calls, [true])
})
