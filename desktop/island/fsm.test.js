const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createIslandFsm, HIDE_DELAY_MS, POINTER_HIDE_DELAY_MS, FOLD_DELAY_MS, HOVER_GRACE_MS, INTENT_DELAY_MS, PIN_DONE_MS, PIN_ATTENTION_MS } = require('./fsm')

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

test('epinglee (attention) : ni repli ni disparition pendant le plafond de 110 s, la pastille ne se cache jamais ensuite', () => {
  const { fsm, clock } = setup()
  fsm.setPinned(true)
  assert.equal(fsm.state(), 'compact')
  clock.advance(HIDE_DELAY_MS * 5)
  assert.equal(fsm.state(), 'compact')
  const other = setup()
  other.fsm.setPinned(true)
  other.fsm.open()
  other.clock.advance(PIN_ATTENTION_MS - 1)
  assert.equal(other.fsm.state(), 'open')
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

test('un toast visible retient l ile ouverte : pas de repli apres 15 s, ni apres dix minutes', () => {
  const { clock, changes, fsm } = setup()
  fsm.open()
  fsm.hold(true)
  clock.advance(FOLD_DELAY_MS + 10 * 60 * 1000)
  assert.equal(fsm.state(), 'open')
  assert.deepEqual(changes, ['hidden>open'])
})

test('un toast visible retient aussi l ile reduite : elle ne se cache pas', () => {
  const { clock, fsm } = setup()
  fsm.reveal()
  fsm.hold(true)
  clock.advance(HIDE_DELAY_MS * 3)
  assert.equal(fsm.state(), 'compact')
})

test('quand le dernier toast disparait, le compte a rebours reprend et l ile se replie', () => {
  const { clock, fsm } = setup()
  fsm.open()
  fsm.hold(true)
  clock.advance(60 * 1000)
  fsm.hold(false)
  clock.advance(FOLD_DELAY_MS + HOVER_GRACE_MS - 1)
  assert.equal(fsm.state(), 'open')
  clock.advance(1)
  assert.equal(fsm.state(), 'compact')
})

test('retenir une ile cachee ne la montre pas', () => {
  const { fsm } = setup()
  fsm.hold(true)
  assert.equal(fsm.state(), 'hidden')
})

test('ouverte au survol : repli 0,6 s apres le depart du pointeur, pas 15 s', () => {
  const { clock, fsm } = setup()
  fsm.reveal()
  fsm.hover(true)
  fsm.open(true)
  fsm.hover(false)
  clock.advance(HOVER_GRACE_MS - 1)
  assert.equal(fsm.state(), 'open')
  clock.advance(1)
  assert.equal(fsm.state(), 'compact')
})

test('ouverte au survol puis touchee : elle devient ordinaire et garde 15 s', () => {
  const { clock, fsm } = setup()
  fsm.reveal()
  fsm.hover(true)
  fsm.open(true)
  fsm.activity()
  fsm.hover(false)
  clock.advance(HOVER_GRACE_MS + 1000)
  assert.equal(fsm.state(), 'open')
  clock.advance(FOLD_DELAY_MS)
  assert.equal(fsm.state(), 'compact')
})

test('ouverte au survol : tant que le pointeur reste dessus, elle ne se replie pas', () => {
  const { clock, fsm } = setup()
  fsm.reveal()
  fsm.hover(true)
  fsm.open(true)
  clock.advance(FOLD_DELAY_MS * 2)
  assert.equal(fsm.state(), 'open')
})

test('ouverte au clic : le comportement reste celui de 15 s apres le depart', () => {
  const { clock, fsm } = setup()
  fsm.reveal()
  fsm.open()
  fsm.hover(true)
  fsm.hover(false)
  clock.advance(HOVER_GRACE_MS + 1000)
  assert.equal(fsm.state(), 'open')
})

test('ouverte au survol alors que quelqu un t attend : elle se replie quand meme 0,6 s apres le depart, la pastille garde le signal', () => {
  const { clock, fsm } = setup()
  fsm.setPinned('attention')
  fsm.hover(true)
  fsm.open(true)
  fsm.hover(false)
  clock.advance(HOVER_GRACE_MS)
  assert.equal(fsm.state(), 'compact')
  clock.advance(HIDE_DELAY_MS * 2)
  assert.equal(fsm.state(), 'compact')
})

test('ouverte par une arrivee alors que quelqu un t attend : elle reste ouverte, meme sans le pointeur', () => {
  const { clock, fsm } = setup()
  fsm.setPinned('attention')
  fsm.open()
  clock.advance(FOLD_DELAY_MS * 4)
  assert.equal(fsm.state(), 'open')
})

test('l epinglage d attente est plafonne a 110 s, comme coucou', () => {
  assert.equal(PIN_ATTENTION_MS, 110000)
})

test('une attente epinglee laisse l ile ouverte 110 s, puis elle se replie en reduit', () => {
  const { clock, fsm } = setup()
  fsm.setPinned('attention')
  fsm.open()
  clock.advance(PIN_ATTENTION_MS - 1)
  assert.equal(fsm.state(), 'open')
  clock.advance(1 + FOLD_DELAY_MS)
  assert.equal(fsm.state(), 'compact')
})

test('apres le plafond, la pastille garde le signal : elle ne se cache jamais tant que quelqu un attend', () => {
  const { clock, fsm } = setup()
  fsm.setPinned('attention')
  fsm.reveal()
  clock.advance(PIN_ATTENTION_MS + HIDE_DELAY_MS * 5)
  assert.equal(fsm.state(), 'compact')
})

test('Echap en reduit ne cache pas une pastille qui garde le signal, meme apres le plafond', () => {
  const { clock, fsm } = setup()
  fsm.setPinned('attention')
  fsm.reveal()
  clock.advance(PIN_ATTENTION_MS + 1)
  fsm.escape()
  assert.equal(fsm.state(), 'compact')
})

test('une nouvelle attente apres le plafond epingle de nouveau pour 110 s', () => {
  const { clock, fsm } = setup()
  fsm.setPinned('attention')
  fsm.open()
  clock.advance(PIN_ATTENTION_MS + FOLD_DELAY_MS)
  assert.equal(fsm.state(), 'compact')
  fsm.setPinned('attention')
  fsm.open()
  clock.advance(PIN_ATTENTION_MS - 1)
  assert.equal(fsm.state(), 'open')
})

test('quand plus personne n attend, la pastille se cache de nouveau apres 60 s', () => {
  const { clock, fsm } = setup()
  fsm.setPinned('attention')
  fsm.reveal()
  clock.advance(PIN_ATTENTION_MS + 1000)
  fsm.setPinned('none')
  clock.advance(HIDE_DELAY_MS)
  assert.equal(fsm.state(), 'hidden')
})

test('blur() — OPEN → COMPACT ; COMPACT ou HIDDEN → inchangé', () => {
  const { clock, fsm } = setup()
  fsm.open()
  fsm.blur()
  assert.equal(fsm.state(), 'compact')
  fsm.blur()
  assert.equal(fsm.state(), 'compact')
  fsm.forceHide()
  fsm.blur()
  assert.equal(fsm.state(), 'hidden')
})

test('blur() réarme le minuteur de masquage : une île ouverte se replie puis se cache apres 60 s', () => {
  const { clock, fsm } = setup()
  fsm.open()
  fsm.blur()
  assert.equal(fsm.state(), 'compact')
  clock.advance(HIDE_DELAY_MS - 1)
  assert.equal(fsm.state(), 'compact')
  clock.advance(1)
  assert.equal(fsm.state(), 'hidden')
})

test('blur() — OPEN + pin attention → COMPACT ; la pastille garde le signal', () => {
  const { clock, fsm } = setup()
  fsm.setPinned('attention')
  fsm.open()
  assert.equal(fsm.state(), 'open')
  fsm.blur()
  assert.equal(fsm.state(), 'compact')
  // Après le repli, la pastille garde le signal : l'île ne se cache pas toute seule
  clock.advance(HIDE_DELAY_MS)
  assert.equal(fsm.state(), 'compact', 'l ile reste compacte tant que le signal est garde')
})
