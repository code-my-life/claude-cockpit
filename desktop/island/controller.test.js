const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createIslandController } = require('./controller')
const { ISLAND_CLOSE_MS, SETTLE_SLACK_MS, ISLAND_PAD } = require('../bounds')
const { HIDE_DELAY_MS, POINTER_HIDE_DELAY_MS, FOLD_DELAY_MS, INTENT_DELAY_MS, PIN_DONE_MS } = require('./fsm')
const { POLL_INTERVAL_MS } = require('./edge')

const AREA = { x: 0, y: 0, width: 1920, height: 1040 }
const SETTLE_MS = ISLAND_CLOSE_MS + SETTLE_SLACK_MS
const AT_EDGE = { x: 960, y: 1 }
const AWAY = { x: 960, y: 500 }

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

const setup = () => {
  const clock = fakeClock()
  const log = { bounds: [], shapes: [], sent: [], visible: [], cursorReads: 0, focus: 0 }
  const cursor = { value: AWAY }
  const island = createIslandController({
    clock,
    getArea: () => AREA,
    getCursor: () => { log.cursorReads++; return cursor.value },
    applyBounds: bounds => log.bounds.push(bounds),
    applyShape: rects => log.shapes.push(rects),
    setVisible: isVisible => log.visible.push(isVisible),
    focusWindow: () => { log.focus++ },
    send: (channel, payload, cause) => log.sent.push([channel, payload, cause]),
  })
  island.setDockSize(420, 96)
  return { clock, log, island, cursor }
}

const last = list => list[list.length - 1]

test('demarrage : l ile se revele en reduit, par evenement', () => {
  const { island, log } = setup()
  island.start()
  assert.equal(island.phase(), 'compact')
  assert.deepEqual(last(log.sent), ['island-state', 'compact', 'event'])
  assert.equal(last(log.bounds).width, 420 + 2 * ISLAND_PAD)
  assert.equal(last(log.visible), true)
})

test('cache : la fenetre est masquee, aucune zone ne capte la souris', () => {
  const { island, log, clock } = setup()
  island.start()
  clock.advance(HIDE_DELAY_MS)
  assert.equal(island.phase(), 'hidden')
  clock.advance(SETTLE_MS)
  assert.equal(last(log.visible), false)
})

test('repli decide par l app : l etat part tout de suite, la fenetre attend la fin de l animation', () => {
  const { island, log, clock } = setup()
  island.start()
  island.setExpanded(true, 900, 600)
  const openBounds = last(log.bounds)
  island.escape()
  assert.equal(last(log.sent)[1], 'compact')
  assert.deepEqual(last(log.bounds), openBounds)
  clock.advance(SETTLE_MS)
  assert.equal(last(log.bounds).height, 96 + 2 * ISLAND_PAD)
})

test('fiche deja fermee par la page : la fenetre retrecit sans attendre', () => {
  const { island, log } = setup()
  island.start()
  island.setExpanded(true, 900, 600)
  island.setExpanded(false, 0, 0)
  assert.equal(last(log.bounds).height, 96 + 2 * ISLAND_PAD)
})

test('apres un repli decide par l app, la confirmation de la page retrecit tout de suite', () => {
  const { island, log } = setup()
  island.start()
  island.setExpanded(true, 900, 600)
  island.escape()
  island.setExpanded(false, 0, 0)
  assert.equal(last(log.bounds).height, 96 + 2 * ISLAND_PAD)
})

test('animations coupees : la fenetre retrecit sans attendre', () => {
  const { island, log } = setup()
  island.setMotion(true)
  island.start()
  island.setExpanded(true, 900, 600)
  island.escape()
  assert.equal(last(log.bounds).height, 96 + 2 * ISLAND_PAD)
})

test('un agrandissement annule un repli en attente', () => {
  const { island, log, clock } = setup()
  island.start()
  island.setExpanded(true, 900, 600)
  island.escape()
  island.setExpanded(true, 900, 600)
  clock.advance(SETTLE_MS)
  assert.equal(last(log.bounds).height, 96 + 600 + 3 * ISLAND_PAD)
})

test('la forme suit la phase appliquee : la fiche reste dessinee pendant son repli', () => {
  const { island, log, clock } = setup()
  island.start()
  island.setExpanded(true, 900, 600)
  assert.equal(last(log.shapes).length, 2)
  island.escape()
  assert.equal(last(log.shapes).length, 2)
  clock.advance(SETTLE_MS)
  assert.equal(last(log.shapes).length, 1)
})

const hide = ({ island, clock }) => {
  island.start()
  clock.advance(HIDE_DELAY_MS + SETTLE_MS)
}

test('cache : le sondage du curseur tourne, et seulement alors', () => {
  const ctx = setup()
  const { island, log, clock } = ctx
  island.start()
  const reads = log.cursorReads
  clock.advance(POLL_INTERVAL_MS * 10)
  assert.equal(log.cursorReads, reads)
  clock.advance(HIDE_DELAY_MS)
  const afterHide = log.cursorReads
  clock.advance(POLL_INTERVAL_MS * 10)
  assert.ok(log.cursorReads >= afterHide + 9)
  island.event()
  const afterReveal = log.cursorReads
  clock.advance(POLL_INTERVAL_MS * 10)
  assert.equal(log.cursorReads, afterReveal)
})

test('le curseur reste au bord assez longtemps : l ile apparait, cause pointeur', () => {
  const ctx = setup()
  hide(ctx)
  ctx.cursor.value = AT_EDGE
  ctx.clock.advance(POLL_INTERVAL_MS + INTENT_DELAY_MS)
  assert.equal(ctx.island.phase(), 'compact')
  assert.equal(last(ctx.log.sent)[2], 'pointer')
})

test('le curseur ne fait que passer au bord : rien n apparait', () => {
  const ctx = setup()
  hide(ctx)
  ctx.cursor.value = AT_EDGE
  ctx.clock.advance(POLL_INTERVAL_MS)
  ctx.cursor.value = AWAY
  ctx.clock.advance(POLL_INTERVAL_MS * 10)
  assert.equal(ctx.island.phase(), 'hidden')
})

test('revele par le seul pointeur : de nouveau cachee apres 4 s', () => {
  const ctx = setup()
  hide(ctx)
  ctx.cursor.value = AT_EDGE
  ctx.clock.advance(POLL_INTERVAL_MS + INTENT_DELAY_MS)
  ctx.cursor.value = AWAY
  ctx.clock.advance(POINTER_HIDE_DELAY_MS)
  assert.equal(ctx.island.phase(), 'hidden')
})

test('un evenement revele l ile cachee', () => {
  const ctx = setup()
  hide(ctx)
  ctx.island.event()
  assert.equal(ctx.island.phase(), 'compact')
})

test('la taille du dock ne rouvre pas une fenetre cachee', () => {
  const ctx = setup()
  hide(ctx)
  const count = ctx.log.bounds.length
  ctx.island.setDockSize(500, 96)
  assert.equal(ctx.log.bounds.length, count)
  ctx.island.event()
  assert.equal(last(ctx.log.bounds).width, 500 + 2 * ISLAND_PAD)
})

test('Afficher l ile : revele, place la fenetre, prend le focus et previent la page', () => {
  const ctx = setup()
  hide(ctx)
  ctx.island.showAndFocus()
  assert.equal(ctx.island.phase(), 'compact')
  assert.equal(last(ctx.log.visible), true)
  assert.equal(ctx.log.focus, 1)
  assert.equal(last(ctx.log.sent)[0], 'island-focus')
})

test('une conversation en attente epingle l ile', () => {
  const { island, clock } = setup()
  island.setPinned('attention')
  clock.advance(HIDE_DELAY_MS * 3)
  assert.equal(island.phase(), 'compact')
})

test('mission livree : epinglage limite a 3 minutes', () => {
  const { island, clock } = setup()
  island.setPinned('done')
  clock.advance(PIN_DONE_MS + HIDE_DELAY_MS)
  assert.equal(island.phase(), 'hidden')
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

test('dispose arrete le sondage et les minuteries', () => {
  const ctx = setup()
  hide(ctx)
  ctx.island.dispose()
  assert.equal(ctx.clock.pending(), 0)
})
