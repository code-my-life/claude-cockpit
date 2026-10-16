const { test } = require('node:test')
const assert = require('node:assert/strict')
const { create } = require('./island-ui.js')

// ---------------------------------------------------------------- Fake DOM (minimal)
const makeEl = id => {
  const obj = { id, tagName: 'DIV', dataset: {}, classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false }, style: {}, value: '', hidden: false, offsetHeight: 44, offsetWidth: 320 }
  obj.textContent = ''
  obj.innerHTML = ''
  obj.querySelector = q => { if (!q) return null; if (q === `#${id}`) return obj; if (q === '.compact') return obj; return null }
  obj.querySelectorAll = () => []
  obj.appendChild = () => {}
  obj.setAttribute = (k, v) => { obj[k] = v; obj.dataset[k] = v }
  obj.toggleAttribute = () => {}
  obj.addEventListener = () => {}
  obj.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 })
  obj.focus = () => {}
  obj.blur = () => {}
  obj.matches = () => false
  obj.closest = () => null
  return obj
}

const makeHost = () => {
  const els = new Map()
  return {
    innerHTML: '',
    querySelector: selector => {
      if (!selector) return null
      if (selector.startsWith('#')) {
        const id = selector.slice(1)
        if (!els.has(id)) els.set(id, makeEl(id))
        return els.get(id)
      }
      return null
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
    getAttribute: () => null,
    contains: () => true,
  }
}

const makeWin = () => ({
  matchMedia: () => ({ matches: false }),
  performance: { now: () => 0 },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: id => clearTimeout(id),
  setInterval: () => 0,
  clearInterval: () => {},
  requestAnimationFrame: () => 0,
})

const isWait = row => row.status === 'permission' || row.status === 'external'

const makeModel = () => ({
  createFeed: () => ({ observe: () => {}, linesOf: () => [] }),
  focusOf: (rows, id) => rows.find(r => r.engineId === id) || null,
  byUrgency: rows => rows.slice().sort((a, b) => isWait(b) - isWait(a)),
  waitOrderOf: (rows, _perms) => rows.filter(isWait),
  newWaitOf: (prev, rows) => {
    const prevIds = prev || new Set()
    for (const row of rows) {
      if (isWait(row) && !prevIds.has(row.engineId)) return row
    }
    return null
  },
  waitingIdsOf: rows => new Set(rows.filter(isWait).map(r => r.engineId)),
  createHoverIntent: () => ({ enter: () => {}, leave: () => {} }),
  springEase: (_spring, t) => t,
  KIND_WAIT: 'wait', KIND_DONE: 'done', KIND_WORK: 'work', KIND_STUCK: 'stuck',
  kindOf: row => isWait(row) ? 'wait' : row.status === 'done' ? 'done' : 'work',
  signalOf: row => ({ kind: 'wait', word: 'attend', icon: 'alert', tone: 'warning' }),
  compactWordOf: rows => rows.some(isWait) ? "T'attend" : 'Personne au travail',
  entityStateOf: () => 'working',
  othersOf: (rows, id, n) => rows.filter(r => r.engineId !== id).slice(0, n),
  holdNoteOf: () => '',
  permissionOf: () => null,
  isDecisionArmed: () => false,
  canReply: (row, _opts) => row && isWait(row),
})

const makeEntities = () => ({
  mount: () => ({ destroy: () => {}, setSeed: () => {}, setState: () => {} }),
  pause: () => {},
  resume: () => {},
})

const setup = () => {
  const announceCalls = []
  const host = makeHost()
  const win = makeWin()
  const model = makeModel()
  const island = create({
    doc: { activeElement: null, querySelector: () => null, body: { style: { setProperty: () => {} } } },
    win,
    host,
    model,
    entities: makeEntities(),
    helpers: { isServer: true, ageOf: () => '0', folderOf: () => null, esc: s => s, icon: () => '', markdown: () => '', activityOf: () => ['', ''], awaitingOf: () => '', statsLineOf: () => '', openUrlOf: () => '#', quickReplies: [], tintOf: () => '' },
    actions: { reply: async () => true },
    desktop: null,
    announce: msg => announceCalls.push(msg),
  })
  // Initialisation avec une ligne non-attendante pour que S.waitIds ne contienne pas la nouvelle attente.
  island.update([{ engineId: 'x', title: 'X', status: 'tool', updatedAt: 0 }])
  return { island, announceCalls, host }
}

// ---------------------------------------------------------------- Tests

test('onFreshWait : pas d ouverture de l ile sur un evenement', () => {
  const { island, announceCalls } = setup()
  const row = { engineId: 'a', title: 'Titre A', status: 'permission', updatedAt: 1000 }
  island.update([row])
  // Sur la base, openWith('wait','event') est appele par onFreshWait ce qui ouvre l'île.
  // Le fix supprime cet appel : la phase doit rester 'hidden'.
  assert.equal(island.stateOf().phase, 'hidden', "l ile ne doit pas s ouvrir par un evenement")
  // announce et focusId conserves meme si l'ile ne s'ouvre pas.
  assert.deepEqual(announceCalls, ["Titre A t'attend"])
  assert.equal(island.stateOf().focusId, 'a')
})

test('onFreshWait : mutation — remise de openWith ouvre l ile', () => {
  // Capture la regression si openWith('wait','event') etait remis dans onFreshWait.
  const { island, announceCalls } = setup()
  const row = { engineId: 'c', title: 'C', status: 'permission', updatedAt: 1 }
  island.update([row])
  // Si openWith('wait','event') est present, phase devient 'open' (et le test echoue).
  assert.equal(island.stateOf().phase, 'hidden', "l ile ne doit pas s ouvrir par un evenement")
  assert.equal(announceCalls[0], "C t'attend")
  assert.equal(island.stateOf().focusId, 'c')
})