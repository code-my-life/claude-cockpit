import test from 'node:test'
import assert from 'node:assert/strict'

import { buildRows, mergeSummaries } from './rows.mts'
import { sectionOf, styleOf } from './sections.mts'

const host = (engineId, overrides = {}) => ({
  hostId: `host-${engineId}`,
  engineId,
  title: `Titre ${engineId}`,
  cwd: 'C:\\repo',
  lastActivityAt: 1000,
  isArchived: false,
  ...overrides,
})

const entry = (id, status, updatedAt, overrides = {}) => ({ id, cwd: 'C:\\repo', prompt: `prompt ${id}`, status, updatedAt, ...overrides })

const sources = overrides => ({
  live: {},
  hosts: [],
  liveEngineIds: new Set(),
  acks: {},
  shared: {},
  parked: {},
  ownEngineId: '',
  ...overrides,
})

const statusOf = (rows, engineId) => rows.find(row => row.engineId === engineId)?.status

test('a host conversation takes its status from the store, closed or archived when it is', () => {
  const rows = buildRows(sources({
    hosts: [host('a'), host('b'), host('c', { isArchived: true }), host('d')],
    live: { a: entry('a', 'thinking', 2000) },
    liveEngineIds: new Set(['a', 'c', 'd']),
  }))
  assert.equal(statusOf(rows, 'a'), 'thinking')
  assert.equal(statusOf(rows, 'b'), 'closed')
  assert.equal(statusOf(rows, 'c'), 'archived')
  assert.equal(statusOf(rows, 'd'), 'idle')
})

test('a done conversation the person saw at that moment reads seen, and done again once it moves', () => {
  const live = { a: entry('a', 'done', 2000) }
  const seenNow = buildRows(sources({ hosts: [host('a')], live, liveEngineIds: new Set(['a']), acks: { a: 2000 } }))
  const movedSince = buildRows(sources({ hosts: [host('a')], live, liveEngineIds: new Set(['a']), acks: { a: 1500 } }))
  assert.equal(statusOf(seenNow, 'a'), 'seen')
  assert.equal(statusOf(movedSince, 'a'), 'done')
})

test('a parked conversation reads as its park, and says when it moved since', () => {
  const rows = buildRows(sources({
    hosts: [host('a')],
    live: { a: entry('a', 'done', 3000) },
    liveEngineIds: new Set(['a']),
    parked: { a: { kind: 'blocked', reason: 'attend la CI', at: 1000, updatedAt: 2000 } },
  }))
  assert.equal(statusOf(rows, 'a'), 'blocked')
  assert.deepEqual(rows[0].park, { kind: 'blocked', reason: 'attend la CI', at: 1000, updatedAt: 2000, hasMoved: true })
})

test('a done conversation whose summary waits on something else reads external', () => {
  const rows = buildRows(sources({
    hosts: [host('a')],
    live: { a: entry('a', 'done', 2000) },
    liveEngineIds: new Set(['a']),
    shared: { a: { updatedAt: 2000, text: '', kind: 'external', isLoading: false } },
  }))
  assert.equal(statusOf(rows, 'a'), 'external')
})

test('a live terminal conversation with no host still gets a row, titled by its prompt', () => {
  const rows = buildRows(sources({ live: { t: entry('t', 'working', 2000) }, liveEngineIds: new Set(['t']), ownEngineId: 't' }))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].hostId, null)
  assert.equal(rows[0].title, 'prompt t')
  assert.equal(rows[0].isCurrent, true)
})

test('rows come waiting first, permission asks before the rest, then the most recent', () => {
  const rows = buildRows(sources({
    hosts: [host('old'), host('ask'), host('new'), host('busy')],
    live: {
      old: entry('old', 'done', 1000),
      ask: entry('ask', 'permission', 500),
      new: entry('new', 'done', 3000),
      busy: entry('busy', 'tool', 9000),
    },
    liveEngineIds: new Set(['old', 'ask', 'new', 'busy']),
  }))
  assert.deepEqual(rows.map(row => row.engineId), ['ask', 'new', 'old', 'busy'])
})

test('a summary being written here wins over the shared one, otherwise the newer', () => {
  const shared = { a: { updatedAt: 2000, text: 'partagé', isLoading: false }, b: { updatedAt: 2000, text: 'partagé', isLoading: false } }
  const local = { a: { updatedAt: 1000, text: '', isLoading: true }, b: { updatedAt: 1000, text: 'ancien', isLoading: false } }
  const merged = mergeSummaries(shared, local)
  assert.equal(merged.a.isLoading, true)
  assert.equal(merged.b.text, 'partagé')
})

test('a status no section lists falls in Autres, and a tool shows what it does', () => {
  assert.equal(sectionOf('inconnu').id, 'others')
  assert.equal(styleOf({ status: 'tool', tool: 'Bash' }).label, 'lance une commande')
  assert.equal(styleOf({ status: 'tool', tool: 'Inconnu' }).label, 'utilise un outil')
})

test('a conversation without the mod takes its status from the cockpit hook', () => {
  const rows = buildRows(sources({
    hosts: [host('wsl')],
    hooked: { wsl: entry('wsl', 'permission', 3000, { prompt: '' }) },
    liveEngineIds: new Set(['wsl']),
  }))
  assert.equal(statusOf(rows, 'wsl'), 'permission')
  assert.equal(rows.find(row => row.engineId === 'wsl').title, 'Titre wsl')
})

test('the newer of the mod and the hook gives the status; the mod keeps its activity feed', () => {
  const steps = [{ at: 1, kind: 'read', label: 'Lu' }]
  const rows = buildRows(sources({
    hosts: [host('a'), host('b')],
    live: { a: entry('a', 'thinking', 5000, { steps }), b: entry('b', 'thinking', 1000, { steps }) },
    hooked: { a: entry('a', 'done', 4000), b: entry('b', 'tool', 2000, { tool: 'Bash' }) },
    liveEngineIds: new Set(['a', 'b']),
  }))
  const [a, b] = ['a', 'b'].map(id => rows.find(row => row.engineId === id))
  assert.equal(a.status, 'thinking')
  assert.equal(b.status, 'tool')
  assert.equal(b.tool, 'Bash')
  assert.deepEqual(b.steps, steps)
  assert.equal(b.updatedAt, 2000)
})

test('a terminal conversation seen only by the hook is listed while it is live', () => {
  const rows = buildRows(sources({
    hooked: { term: entry('term', 'done', 3000, { prompt: '' }), gone: entry('gone', 'done', 3000) },
    liveEngineIds: new Set(['term']),
  }))
  assert.deepEqual(rows.map(row => row.engineId), ['term'])
  assert.equal(rows[0].title, '(terminal)')
})
