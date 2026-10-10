const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createIslandController } = require('./controller')
const { ISLAND_CLOSE_MS, SETTLE_SLACK_MS, WAKE_WIDTH, WAKE_HEIGHT, ISLAND_PAD } = require('../bounds')
const { HIDE_DELAY_MS, FOLD_DELAY_MS } = require('./fsm')

const AREA = { x: 0, y: 0, width: 1920, height: 1040 }
const SETTLE_MS = ISLAND_CLOSE_MS + SETTLE_SLACK_MS

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
  }
}

const setup = () => {
  const clock = fakeClock()
  const log = { bounds: [], shapes: [], sent: [] }
  const island = createIslandController({
    clock,
    getArea: () => AREA,
    applyBounds: bounds => log.bounds.push(bounds),
    applyShape: rects => log.shapes.push(rects),
    send: (channel, payload) => log.sent.push([channel, payload]),
  })
  island.setDockSize(420, 96)
  return { clock, log, island }
}

const last = list => list[list.length - 1]

test('demarrage : l ile se revele en reduit', () => {
  const { island, log } = setup()
  island.start()
  assert.equal(island.phase(), 'compact')
  assert.deepEqual(last(log.sent), ['island-state', 'compact'])
  assert.equal(last(log.bounds).width, 420 + 2 * ISLAND_PAD)
})

test('cache : la fenetre est la bande d eveil, seule zone qui capte la souris', () => {
  const { island, log, clock } = setup()
  island.start()
  clock.advance(HIDE_DELAY_MS)
  assert.equal(island.phase(), 'hidden')
  clock.advance(SETTLE_MS)
  assert.equal(last(log.bounds).width, WAKE_WIDTH)
  assert.equal(last(log.bounds).height, WAKE_HEIGHT)
  assert.deepEqual(last(log.shapes), [{ x: 0, y: 0, width: WAKE_WIDTH, height: WAKE_HEIGHT }])
})

test('repli : l etat part tout de suite, la fenetre attend la fin de l animation', () => {
  const { island, log, clock } = setup()
  island.start()
  island.setExpanded(true, 900, 600)
  const openBounds = last(log.bounds)
  island.setExpanded(false, 0, 0)
  assert.deepEqual(last(log.sent), ['island-state', 'compact'])
  assert.deepEqual(last(log.bounds), openBounds)
  clock.advance(SETTLE_MS)
  assert.equal(last(log.bounds).height, 96 + 2 * ISLAND_PAD)
})

test('animations coupees : la fenetre retrecit sans attendre', () => {
  const { island, log } = setup()
  island.setMotion(true)
  island.start()
  island.setExpanded(true, 900, 600)
  island.setExpanded(false, 0, 0)
  assert.equal(last(log.bounds).height, 96 + 2 * ISLAND_PAD)
})

test('un agrandissement annule un repli en attente', () => {
  const { island, log, clock } = setup()
  island.start()
  island.setExpanded(true, 900, 600)
  island.setExpanded(false, 0, 0)
  island.setExpanded(true, 900, 600)
  clock.advance(SETTLE_MS)
  assert.equal(last(log.bounds).height, 96 + 600 + 3 * ISLAND_PAD)
})

test('la forme suit la phase appliquee : la fiche reste dessinee pendant son repli', () => {
  const { island, log, clock } = setup()
  island.start()
  island.setExpanded(true, 900, 600)
  assert.equal(last(log.shapes).length, 2)
  island.setExpanded(false, 0, 0)
  assert.equal(last(log.shapes).length, 2)
  clock.advance(SETTLE_MS)
  assert.equal(last(log.shapes).length, 1)
})

test('le survol de la bande d eveil revele l ile', () => {
  const { island, clock } = setup()
  island.start()
  clock.advance(HIDE_DELAY_MS + SETTLE_MS)
  island.pointer(true)
  assert.equal(island.phase(), 'compact')
})

test('un evenement revele l ile cachee', () => {
  const { island, clock } = setup()
  island.start()
  clock.advance(HIDE_DELAY_MS)
  island.event()
  assert.equal(island.phase(), 'compact')
})

test('la taille du dock ne bouge pas la bande d eveil', () => {
  const { island, log, clock } = setup()
  island.start()
  clock.advance(HIDE_DELAY_MS + SETTLE_MS)
  const count = log.bounds.length
  island.setDockSize(500, 96)
  assert.equal(log.bounds.length, count)
  island.event()
  assert.equal(last(log.bounds).width, 500 + 2 * ISLAND_PAD)
})

test('une conversation en attente epingle l ile', () => {
  const { island, clock } = setup()
  island.setPinned(true)
  clock.advance(HIDE_DELAY_MS * 3)
  assert.equal(island.phase(), 'compact')
})

test('ouverte et laissee seule : repli apres 15 s', () => {
  const { island, clock } = setup()
  island.start()
  island.setExpanded(true, 900, 600)
  clock.advance(FOLD_DELAY_MS)
  assert.equal(island.phase(), 'compact')
})

test('Echap replie puis cache', () => {
  const { island } = setup()
  island.start()
  island.setExpanded(true, 900, 600)
  island.escape()
  assert.equal(island.phase(), 'compact')
  island.escape()
  assert.equal(island.phase(), 'hidden')
})

test('hors ligne : l ile reste visible a la taille du message', () => {
  const { island, log, clock } = setup()
  island.setOffline(true, 380, 44)
  clock.advance(HIDE_DELAY_MS * 2)
  assert.equal(island.phase(), 'compact')
  assert.equal(last(log.bounds).width, 380 + 2 * ISLAND_PAD)
})
