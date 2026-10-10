const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createIslandController } = require('./controller')
const { OPEN_SPRING, CLOSE_SPRING } = require('../bounds')
const { HIDE_DELAY_MS, POINTER_HIDE_DELAY_MS, FOLD_DELAY_MS, INTENT_DELAY_MS, PIN_DONE_MS } = require('./fsm')
const { POLL_INTERVAL_MS } = require('./edge')

const AREA = { x: 0, y: 0, width: 1920, height: 1040 }
const SETTLE_MS = CLOSE_SPRING.ms + 50
const GROW_MS = OPEN_SPRING.ms + 50
const AT_EDGE = { x: 960, y: 1 }
const AWAY = { x: 100, y: 900 }

const fakeClock = () => {
  let now = 0
  let nextId = 1
  const timers = new Map()
  return {
    now: () => now,
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

const setup = (overrides = {}) => {
  const clock = fakeClock()
  const log = { bounds: [], sent: [], visible: [], order: [], cursorReads: 0, focus: 0 }
  const cursor = { value: AWAY }
  const island = createIslandController({
    clock,
    getArea: () => AREA,
    getCursor: () => { log.cursorReads++; return cursor.value },
    applyBounds: bounds => log.bounds.push(bounds),
    setVisible: isVisible => { log.visible.push(isVisible); log.order.push(`visible:${isVisible}`) },
    focusWindow: () => { log.focus++; log.order.push('focus') },
    send: (channel, payload, cause) => log.sent.push([channel, payload, cause]),
    ...overrides,
  })
  island.setCompactSize(320, 44)
  return { clock, log, island, cursor }
}

const last = list => list[list.length - 1]

test('demarrage : l ile se revele en reduit, par evenement', () => {
  const { island, log, clock } = setup()
  island.start()
  assert.equal(island.phase(), 'compact')
  assert.deepEqual(last(log.sent), ['island-state', 'compact', 'event'])
  assert.equal(last(log.visible), true)
  clock.advance(GROW_MS)
  assert.deepEqual([last(log.bounds).width, last(log.bounds).height], [320, 44])
})

test('la forme sort du bord : hauteur de 1 px puis elle grandit jusqu a la pastille', () => {
  const { island, log, clock } = setup()
  island.start()
  assert.equal(log.bounds[0].height, 1)
  clock.advance(GROW_MS)
  assert.ok(log.bounds.length > 4)
})

test('cache : la forme se retracte puis la fenetre est masquee', () => {
  const { island, log, clock } = setup()
  island.start()
  clock.advance(GROW_MS)
  clock.advance(HIDE_DELAY_MS - GROW_MS + 100)
  assert.equal(island.phase(), 'hidden')
  assert.equal(last(log.visible), true)
  clock.advance(SETTLE_MS)
  assert.equal(last(log.visible), false)
})

test('ouverture : la fenetre grandit en ressort jusqu a la taille ouverte, au meme centre', () => {
  const { island, log, clock } = setup()
  island.start()
  clock.advance(GROW_MS)
  const before = log.bounds.length
  island.setExpanded(true, 760, 280)
  clock.advance(GROW_MS)
  assert.deepEqual([last(log.bounds).width, last(log.bounds).height], [760, 280])
  assert.ok(log.bounds.length - before > 20, 'une image par pas de 8 ms, pas un saut')
  for (const bounds of log.bounds) assert.ok(Math.abs(bounds.x + bounds.width / 2 - 960) <= 1)
})

test('repli decide par l app : l etat part tout de suite, la fenetre se referme en ressort', () => {
  const { island, log, clock } = setup()
  island.start()
  island.setExpanded(true, 760, 280)
  clock.advance(GROW_MS)
  island.escape()
  assert.equal(last(log.sent)[1], 'compact')
  clock.advance(SETTLE_MS)
  assert.deepEqual([last(log.bounds).width, last(log.bounds).height], [320, 44])
})

test('animations coupees : la fenetre change de taille d un coup', () => {
  const { island, log } = setup()
  island.setMotion(true)
  island.start()
  island.setExpanded(true, 760, 280)
  assert.deepEqual([last(log.bounds).width, last(log.bounds).height], [760, 280])
  island.escape()
  assert.deepEqual([last(log.bounds).width, last(log.bounds).height], [320, 44])
})

test('un agrandissement en cours de repli repart de la taille courante', () => {
  const { island, log, clock } = setup()
  island.start()
  island.setExpanded(true, 760, 280)
  clock.advance(GROW_MS)
  island.escape()
  clock.advance(80)
  island.setExpanded(true, 760, 280)
  clock.advance(GROW_MS)
  assert.deepEqual([last(log.bounds).width, last(log.bounds).height], [760, 280])
})

test('ouverte par le survol : l automate la replie 0,6 s apres le depart du pointeur', () => {
  const { island, clock } = setup()
  island.start()
  island.pointer(true)
  island.setExpanded(true, 760, 280, true)
  island.pointer(false)
  clock.advance(600)
  assert.equal(island.phase(), 'compact')
})

test('les toasts agrandissent la fenetre sous l ile, sans ouvrir l ile, et la rendent au dernier', () => {
  const { island, log, clock } = setup()
  island.start()
  clock.advance(GROW_MS)
  island.setToasts(380, 120)
  clock.advance(GROW_MS)
  assert.equal(island.phase(), 'compact')
  assert.deepEqual([last(log.bounds).width, last(log.bounds).height], [380 + 16, 44 + 8 + 120])
  island.setToasts(0, 0)
  clock.advance(SETTLE_MS)
  assert.deepEqual([last(log.bounds).width, last(log.bounds).height], [320, 44])
})

const hide = ({ island, clock }) => {
  island.start()
  clock.advance(HIDE_DELAY_MS + SETTLE_MS)
}

test('cache : le sondage du curseur tourne, et seulement alors', () => {
  const ctx = setup()
  const { island, log, clock } = ctx
  island.start()
  clock.advance(GROW_MS)
  const reads = log.cursorReads
  clock.advance(POLL_INTERVAL_MS * 10)
  assert.equal(log.cursorReads, reads)
  clock.advance(HIDE_DELAY_MS)
  const afterHide = log.cursorReads
  clock.advance(POLL_INTERVAL_MS * 10)
  assert.ok(log.cursorReads >= afterHide + 9)
  island.event()
  clock.advance(GROW_MS)
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
  ctx.island.setCompactSize(500, 96)
  assert.equal(ctx.log.bounds.length, count)
  ctx.island.event()
  ctx.clock.advance(GROW_MS)
  assert.equal(last(ctx.log.bounds).width, 500)
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
  clock.advance(GROW_MS)
  assert.equal(last(log.bounds).width, 380)
})

test('dispose arrete le sondage et les minuteries', () => {
  const ctx = setup()
  hide(ctx)
  ctx.island.dispose()
  assert.equal(ctx.clock.pending(), 0)
})

test('forceHide masque meme une ile epinglee, et le sondage reprend', () => {
  const { island, log, clock } = setup()
  island.setPinned('attention')
  island.forceHide()
  assert.equal(island.phase(), 'hidden')
  clock.advance(SETTLE_MS)
  assert.equal(last(log.visible), false)
  const reads = log.cursorReads
  clock.advance(POLL_INTERVAL_MS * 3)
  assert.ok(log.cursorReads > reads)
})

test('apres forceHide, une nouvelle attente epingle de nouveau', () => {
  const { island } = setup()
  island.setPinned('attention')
  island.forceHide()
  island.setPinned('none')
  island.setPinned('attention')
  assert.equal(island.phase(), 'compact')
})

test('plein ecran : le bord ne revele rien, meme avec le curseur dessus', () => {
  const ctx = setup({ isFullscreenActive: () => true })
  hide(ctx)
  ctx.cursor.value = AT_EDGE
  ctx.clock.advance(POLL_INTERVAL_MS + INTENT_DELAY_MS * 3)
  assert.equal(ctx.island.phase(), 'hidden')
})

test('hors plein ecran le meme curseur revele l ile', () => {
  const ctx = setup({ isFullscreenActive: () => false })
  hide(ctx)
  ctx.cursor.value = AT_EDGE
  ctx.clock.advance(POLL_INTERVAL_MS + INTENT_DELAY_MS)
  assert.equal(ctx.island.phase(), 'compact')
})

test('lecteur d ecran actif : une revelation par evenement donne le focus a la fenetre', () => {
  const ctx = setup({ isScreenReaderActive: () => true })
  hide(ctx)
  const before = ctx.log.focus
  ctx.island.event()
  assert.equal(ctx.log.focus, before + 1)
})

test('lecteur d ecran actif : une revelation au seul pointeur ne prend pas le focus', () => {
  const ctx = setup({ isScreenReaderActive: () => true })
  hide(ctx)
  const before = ctx.log.focus
  ctx.cursor.value = AT_EDGE
  ctx.clock.advance(POLL_INTERVAL_MS + INTENT_DELAY_MS)
  assert.equal(ctx.log.focus, before)
})

test('sans lecteur d ecran : pas de focus vole a une revelation par evenement', () => {
  const ctx = setup()
  hide(ctx)
  const before = ctx.log.focus
  ctx.island.event()
  assert.equal(ctx.log.focus, before)
})

test('lecteur d ecran : le focus n arrive qu apres l affichage de la fenetre', () => {
  const ctx = setup({ isScreenReaderActive: () => true })
  hide(ctx)
  ctx.log.order.length = 0
  ctx.island.event()
  assert.deepEqual(ctx.log.order, ['visible:true', 'focus'])
})

test('Afficher l ile : meme ordre, affichage puis focus', () => {
  const ctx = setup()
  hide(ctx)
  ctx.log.order.length = 0
  ctx.island.showAndFocus()
  assert.equal(ctx.log.order[ctx.log.order.length - 1], 'focus')
  assert.ok(ctx.log.order.indexOf('visible:true') < ctx.log.order.indexOf('focus'))
})

test('un toast retient l ile ; apres un rechargement de la page, relacher le maintien la laisse se replier', () => {
  const { clock, island } = setup()
  island.event()
  island.setExpanded(true, 380, 120)
  island.setHeld(true)
  clock.advance(FOLD_DELAY_MS * 4)
  assert.equal(island.phase(), 'open')
  island.setHeld(false)
  island.setExpanded(false, 0, 0)
  clock.advance(FOLD_DELAY_MS * 4)
  assert.notEqual(island.phase(), 'open')
})

test('Echap sous un curseur immobile : une fois la forme refermee, le curseur reel dit qu il n est plus dessus et l ile se cache', () => {
  const { island, clock, cursor } = setup()
  island.start()
  island.setExpanded(true, 760, 280)
  clock.advance(GROW_MS)
  cursor.value = { x: 960, y: 200 }
  island.pointer(true)
  island.escape()
  clock.advance(SETTLE_MS)
  clock.advance(HIDE_DELAY_MS + 1000)
  assert.equal(island.phase(), 'hidden')
})

test('curseur reste sur la pastille refermee : l ile reste survolee et ne se cache pas', () => {
  const { island, clock, cursor } = setup()
  island.start()
  island.setExpanded(true, 760, 280)
  clock.advance(GROW_MS)
  cursor.value = { x: 960, y: 20 }
  island.pointer(true)
  island.escape()
  clock.advance(SETTLE_MS)
  clock.advance(HIDE_DELAY_MS * 2)
  assert.equal(island.phase(), 'compact')
})

test('au changement d etat aussi, le curseur reel corrige un survol rapporte par erreur', () => {
  const { island, clock, cursor } = setup()
  island.start()
  clock.advance(GROW_MS)
  cursor.value = { x: 100, y: 700 }
  island.pointer(true)
  island.setExpanded(true, 760, 280)
  clock.advance(GROW_MS)
  island.escape()
  clock.advance(SETTLE_MS + HIDE_DELAY_MS)
  assert.equal(island.phase(), 'hidden')
})

test('le repli est un ressort, pas un saut : la fenetre passe par des tailles intermediaires', () => {
  const { island, log, clock } = setup()
  island.start()
  island.setExpanded(true, 760, 280)
  clock.advance(GROW_MS)
  const before = log.bounds.length
  island.escape()
  island.setCompactSize(320, 44)
  clock.advance(SETTLE_MS)
  assert.ok(log.bounds.length - before > 15, `images : ${log.bounds.length - before}`)
  assert.deepEqual([last(log.bounds).width, last(log.bounds).height], [320, 44])
})

test('la fenetre dit si elle est en train de s animer : une mesure lourde attend la fin de la morphose', () => {
  const { island, clock } = setup()
  island.start()
  assert.equal(island.isAnimating(), true)
  clock.advance(GROW_MS)
  assert.equal(island.isAnimating(), false)
  island.setExpanded(true, 760, 280)
  assert.equal(island.isAnimating(), true)
  clock.advance(GROW_MS)
  assert.equal(island.isAnimating(), false)
})
