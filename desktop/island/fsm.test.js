const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createIslandFsm, HIDE_DELAY_MS, POINTER_HIDE_DELAY_MS, FOLD_DELAY_MS, HOVER_GRACE_MS, INTENT_DELAY_MS, PIN_DONE_MS } = require('./fsm')

const fakeClock = () => {
  let now = 0
  let nextId = 1
  const timers = new Map()
  return {
    setTimer: (callback, delay) => {
      const id = nextId++
      timers.set(id, { callback, at: now + delay })
      return id
    },
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
  const changes = []
  const causes = []
  const fsm = createIslandFsm({ clock, onChange: (to, from, cause) => { changes.push(`${from}>${to}`); causes.push(cause) } })
  return { clock, changes, causes, fsm }
}

const revealByPointer = (fsm, clock) => {
  fsm.edge(true)
  clock.advance(INTENT_DELAY_MS)
}

test('les delais sont ceux du cahier des charges', () => {
  assert.equal(HIDE_DELAY_MS, 60000)
  assert.equal(FOLD_DELAY_MS, 15000)
  assert.equal(HOVER_GRACE_MS, 600)
  assert.equal(POINTER_HIDE_DELAY_MS, 4000)
  assert.equal(INTENT_DELAY_MS, 200)
  assert.equal(PIN_DONE_MS, 180000)
})

test('au depart l ile est cachee et aucune minuterie ne tourne', () => {
  const { fsm, clock } = setup()
  assert.equal(fsm.state(), 'hidden')
  assert.equal(clock.pending(), 0)
})

test('presence continue au bord : revele apres le delai d intention, cause pointeur', () => {
  const { fsm, clock, causes } = setup()
  fsm.edge(true)
  clock.advance(INTENT_DELAY_MS - 1)
  assert.equal(fsm.state(), 'hidden')
  clock.advance(1)
  assert.equal(fsm.state(), 'compact')
  assert.deepEqual(causes, ['pointer'])
})

test('un passage rapide au bord ne revele rien', () => {
  const { fsm, clock } = setup()
  fsm.edge(true)
  clock.advance(INTENT_DELAY_MS - 50)
  fsm.edge(false)
  clock.advance(INTENT_DELAY_MS * 5)
  assert.equal(fsm.state(), 'hidden')
})

test('reveille par le seul pointeur : cache apres 4 s sans survol', () => {
  const { fsm, clock } = setup()
  revealByPointer(fsm, clock)
  clock.advance(POINTER_HIDE_DELAY_MS - 1)
  assert.equal(fsm.state(), 'compact')
  clock.advance(1)
  assert.equal(fsm.state(), 'hidden')
})

test('reveille par le pointeur puis survole : reste tant que le pointeur est dessus', () => {
  const { fsm, clock } = setup()
  revealByPointer(fsm, clock)
  fsm.hover(true)
  clock.advance(HIDE_DELAY_MS)
  assert.equal(fsm.state(), 'compact')
  fsm.hover(false)
  clock.advance(HOVER_GRACE_MS + POINTER_HIDE_DELAY_MS)
  assert.equal(fsm.state(), 'hidden')
})

test('un evenement pendant une revelation par pointeur releve le delai a 60 s', () => {
  const { fsm, clock } = setup()
  revealByPointer(fsm, clock)
  fsm.reveal()
  clock.advance(POINTER_HIDE_DELAY_MS * 2)
  assert.equal(fsm.state(), 'compact')
  clock.advance(HIDE_DELAY_MS)
  assert.equal(fsm.state(), 'hidden')
})

test('la presence au bord est ignoree quand l ile est visible', () => {
  const { fsm, clock, changes } = setup()
  fsm.reveal()
  fsm.edge(true)
  clock.advance(INTENT_DELAY_MS * 3)
  assert.deepEqual(changes, ['hidden>compact'])
})

test('reduit par evenement : cache apres 60 s, grace comprise apres le depart du pointeur', () => {
  const { fsm, clock } = setup()
  fsm.reveal()
  fsm.hover(true)
  fsm.hover(false)
  clock.advance(HIDE_DELAY_MS + HOVER_GRACE_MS - 1)
  assert.equal(fsm.state(), 'compact')
  clock.advance(1)
  assert.equal(fsm.state(), 'hidden')
})

test('reduit : le retour du pointeur annule le compte a rebours', () => {
  const { fsm, clock } = setup()
  fsm.reveal()
  fsm.hover(true)
  fsm.hover(false)
  clock.advance(HIDE_DELAY_MS)
  fsm.hover(true)
  clock.advance(HIDE_DELAY_MS * 2)
  assert.equal(fsm.state(), 'compact')
  assert.equal(clock.pending(), 0)
})

test('un evenement revele l ile depuis cache puis la recache apres 60 s', () => {
  const { fsm, clock, causes } = setup()
  fsm.reveal()
  assert.equal(fsm.state(), 'compact')
  assert.deepEqual(causes, ['event'])
  clock.advance(HIDE_DELAY_MS)
  assert.equal(fsm.state(), 'hidden')
})

test('un nouvel evenement repousse le delai de 60 s', () => {
  const { fsm, clock } = setup()
  fsm.reveal()
  clock.advance(HIDE_DELAY_MS - 1000)
  fsm.reveal()
  clock.advance(HIDE_DELAY_MS - 1000)
  assert.equal(fsm.state(), 'compact')
  clock.advance(1000)
  assert.equal(fsm.state(), 'hidden')
})

test('ouvert : replie en reduit apres 15 s, puis cache apres 60 s', () => {
  const { fsm, clock } = setup()
  fsm.open()
  assert.equal(fsm.state(), 'open')
  clock.advance(FOLD_DELAY_MS - 1)
  assert.equal(fsm.state(), 'open')
  clock.advance(1)
  assert.equal(fsm.state(), 'compact')
  clock.advance(HIDE_DELAY_MS)
  assert.equal(fsm.state(), 'hidden')
})

test('ouvert avec le pointeur dedans : rien ne se replie', () => {
  const { fsm, clock } = setup()
  fsm.hover(true)
  fsm.open()
  clock.advance(FOLD_DELAY_MS * 10)
  assert.equal(fsm.state(), 'open')
})

test('ouvert : 15 s comptees apres la grace de 0,6 s du depart du pointeur', () => {
  const { fsm, clock } = setup()
  fsm.hover(true)
  fsm.open()
  fsm.hover(false)
  clock.advance(FOLD_DELAY_MS)
  assert.equal(fsm.state(), 'open')
  clock.advance(HOVER_GRACE_MS)
  assert.equal(fsm.state(), 'compact')
})

test('activity repousse le repli de l ile ouverte', () => {
  const { fsm, clock } = setup()
  fsm.open()
  clock.advance(FOLD_DELAY_MS - 1)
  fsm.activity()
  clock.advance(FOLD_DELAY_MS - 1)
  assert.equal(fsm.state(), 'open')
  clock.advance(1)
  assert.equal(fsm.state(), 'compact')
})

test('epinglee (attention) : ni repli ni disparition tant qu une conversation attend', () => {
  const { fsm, clock } = setup()
  fsm.setPinned(true)
  assert.equal(fsm.state(), 'compact')
  clock.advance(HIDE_DELAY_MS * 5)
  assert.equal(fsm.state(), 'compact')
  fsm.open()
  clock.advance(FOLD_DELAY_MS * 5)
  assert.equal(fsm.state(), 'open')
})

test('la fin de l epinglage relance le compte a rebours', () => {
  const { fsm, clock } = setup()
  fsm.setPinned('attention')
  clock.advance(HIDE_DELAY_MS * 2)
  fsm.setPinned('none')
  clock.advance(HIDE_DELAY_MS - 1)
  assert.equal(fsm.state(), 'compact')
  clock.advance(1)
  assert.equal(fsm.state(), 'hidden')
})

test('epinglage done : limite a 3 minutes, ensuite comportement normal', () => {
  const { fsm, clock } = setup()
  fsm.setPinned('done')
  assert.equal(fsm.state(), 'compact')
  clock.advance(PIN_DONE_MS - 1)
  assert.equal(fsm.state(), 'compact')
  clock.advance(1)
  clock.advance(HIDE_DELAY_MS)
  assert.equal(fsm.state(), 'hidden')
})

test('epinglage attention : sans limite de temps', () => {
  const { fsm, clock } = setup()
  fsm.setPinned('attention')
  clock.advance(PIN_DONE_MS * 4)
  assert.equal(fsm.state(), 'compact')
})

test('Echap cache une ile dont l epinglage done a expire', () => {
  const { fsm, clock } = setup()
  fsm.setPinned('done')
  fsm.escape()
  assert.equal(fsm.state(), 'compact')
  clock.advance(PIN_DONE_MS)
  fsm.escape()
  assert.equal(fsm.state(), 'hidden')
})

test('forceHide cache une ile epinglee, hover et epinglage compris', () => {
  const { fsm } = setup()
  fsm.setPinned('attention')
  fsm.hover(true)
  fsm.forceHide()
  assert.equal(fsm.state(), 'hidden')
})

test('forceHide : l epinglage se rearme a la prochaine attente nouvelle', () => {
  const { fsm, clock } = setup()
  fsm.setPinned('attention')
  fsm.forceHide()
  clock.advance(PIN_DONE_MS * 2)
  assert.equal(fsm.state(), 'hidden')
  fsm.setPinned('attention')
  assert.equal(fsm.state(), 'compact')
})

test('Echap replie l ile ouverte puis cache l ile reduite', () => {
  const { fsm, changes } = setup()
  fsm.open()
  fsm.escape()
  assert.equal(fsm.state(), 'compact')
  fsm.escape()
  assert.equal(fsm.state(), 'hidden')
  assert.deepEqual(changes, ['hidden>open', 'open>compact', 'compact>hidden'])
})

test('Echap ne cache pas une ile epinglee', () => {
  const { fsm } = setup()
  fsm.setPinned(true)
  fsm.escape()
  assert.equal(fsm.state(), 'compact')
})

test('Echap sur une ile cachee ne fait rien', () => {
  const { fsm, changes } = setup()
  fsm.escape()
  assert.deepEqual(changes, [])
})

test('fold ne replie que l ile ouverte', () => {
  const { fsm } = setup()
  fsm.reveal()
  fsm.fold()
  assert.equal(fsm.state(), 'compact')
  fsm.open()
  fsm.fold()
  assert.equal(fsm.state(), 'compact')
})

test('aucune transition en double pour un meme etat', () => {
  const { fsm, changes } = setup()
  fsm.reveal()
  fsm.reveal()
  assert.deepEqual(changes, ['hidden>compact'])
})

test('dispose annule les minuteries', () => {
  const { fsm, clock } = setup()
  fsm.reveal()
  fsm.setPinned('done')
  fsm.edge(false)
  fsm.dispose()
  assert.equal(clock.pending(), 0)
})
