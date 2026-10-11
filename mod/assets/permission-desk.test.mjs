import test from 'node:test'
import assert from 'node:assert/strict'

import { createPermissionDesk, MAX_PENDING_PERMISSIONS, PERMISSION_TTL_MS } from './permission-desk.mjs'

const clockAt = start => {
  const clock = { value: start }
  clock.now = () => clock.value
  clock.advance = ms => { clock.value += ms }
  return clock
}

const deskWith = (options = {}) => {
  const clock = clockAt(1000)
  let next = 0
  const changes = []
  const desk = createPermissionDesk({ now: clock.now, newId: () => `p-${++next}`, onChange: () => changes.push(clock.value), ...options })
  return { desk, clock, changes }
}

const request = { engineId: 'conv-a', tool: 'Bash', summary: 'npm test', detail: 'npm test -- --watch', canAlways: true }

test('a request is listed for the island with what it asks', () => {
  const { desk } = deskWith()
  const { requestId } = desk.ask(request)
  assert.deepEqual(desk.list(), [{ requestId, engineId: 'conv-a', tool: 'Bash', summary: 'npm test', detail: 'npm test -- --watch', canAlways: true, askedAt: 1000 }])
})

test('the decision reaches the conversation that waits for it', async () => {
  const { desk } = deskWith()
  const { requestId } = desk.ask(request)
  const waiting = desk.waitDecision(requestId, 5000)
  assert.equal(desk.decide(requestId, 'allow'), true)
  assert.equal(await waiting, 'allow')
  assert.deepEqual(desk.list(), [])
})

test('a decision taken before the wait is kept for it', async () => {
  const { desk } = deskWith()
  const { requestId } = desk.ask(request)
  desk.decide(requestId, 'deny')
  assert.equal(await desk.waitDecision(requestId, 5000), 'deny')
})

test('a wait without decision ends with null and the request stays open', async () => {
  const { desk } = deskWith()
  const { requestId } = desk.ask(request)
  assert.equal(await desk.waitDecision(requestId, 10), null)
  assert.equal(desk.list().length, 1)
})

test('always is refused when the request cannot be remembered', () => {
  const { desk } = deskWith()
  const { requestId } = desk.ask({ ...request, canAlways: false })
  assert.equal(desk.decide(requestId, 'always'), false)
  assert.equal(desk.list().length, 1)
})

test('an unknown decision or request is refused', () => {
  const { desk } = deskWith()
  const { requestId } = desk.ask(request)
  assert.equal(desk.decide(requestId, 'maybe'), false)
  assert.equal(desk.decide('nope', 'allow'), false)
})

test('a request answered elsewhere leaves the island and its waiter gets gone', async () => {
  const { desk } = deskWith()
  const { requestId } = desk.ask(request)
  const waiting = desk.waitDecision(requestId, 5000)
  desk.withdraw(requestId)
  assert.equal(await waiting, 'gone')
  assert.deepEqual(desk.list(), [])
  assert.equal(desk.decide(requestId, 'allow'), false)
})

test('a request nobody answers expires', async () => {
  const { desk, clock } = deskWith()
  const { requestId } = desk.ask(request)
  clock.advance(PERMISSION_TTL_MS + 1)
  assert.deepEqual(desk.list(), [])
  assert.equal(await desk.waitDecision(requestId, 10), 'gone')
})

test('too many open requests are refused', () => {
  const { desk } = deskWith()
  for (let index = 0; index < MAX_PENDING_PERMISSIONS; index += 1) desk.ask({ ...request, engineId: `c-${index}` })
  assert.equal(desk.ask(request), null)
})

test('a conversation asking again replaces its previous request', async () => {
  const { desk } = deskWith()
  const first = desk.ask(request)
  const waiting = desk.waitDecision(first.requestId, 5000)
  const second = desk.ask({ ...request, summary: 'npm run build' })
  assert.equal(await waiting, 'gone')
  assert.deepEqual(desk.list().map(entry => entry.requestId), [second.requestId])
})

test('an aborted wait ends with null', async () => {
  const { desk } = deskWith()
  const { requestId } = desk.ask(request)
  const hangUp = new AbortController()
  const waiting = desk.waitDecision(requestId, 5000, hangUp.signal)
  hangUp.abort()
  assert.equal(await waiting, null)
})

test('every change of the open requests is announced', () => {
  const { desk, changes } = deskWith()
  const { requestId } = desk.ask(request)
  desk.decide(requestId, 'allow')
  assert.equal(changes.length, 2)
})

test('texts are cut to a bounded size', () => {
  const { desk } = deskWith()
  desk.ask({ ...request, summary: 'x'.repeat(5000), detail: 'y'.repeat(50000) })
  const [entry] = desk.list()
  assert.ok(entry.summary.length <= 300)
  assert.ok(entry.detail.length <= 4000)
})

test('a request can be handed back to Claude', async () => {
  const { desk } = deskWith()
  const { requestId } = desk.ask(request)
  const waiting = desk.waitDecision(requestId, 5000)
  assert.equal(desk.decide(requestId, 'defer'), true)
  assert.equal(await waiting, 'defer')
})
