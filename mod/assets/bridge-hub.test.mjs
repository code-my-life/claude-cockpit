import test from 'node:test'
import assert from 'node:assert/strict'

import { createBridgeHub, BRIDGE_TIMEOUT_MS, REDELIVER_MS } from './bridge-hub.mjs'

const REPLY_TTL_MS = 60000

const clockAt = start => {
  const clock = { value: start }
  clock.now = () => clock.value
  clock.advance = ms => { clock.value += ms }
  return clock
}

const hubWith = () => {
  const clock = clockAt(1000)
  let next = 0
  const hub = createBridgeHub({ now: clock.now, newId: () => `id-${++next}` })
  return { hub, clock }
}

const typesOf = polled => polled.orders.map(entry => entry.type)

test('the first bridge to say hello is the hub, the next ones are peers', () => {
  const { hub } = hubWith()
  const first = hub.hello({ engineId: 'a' })
  const second = hub.hello({ engineId: 'b' })
  assert.equal(first.role, 'hub')
  assert.equal(second.role, 'peer')
  assert.notEqual(first.bridgeId, second.bridgeId)
})

test('without any bridge an order cannot be delivered', () => {
  const { hub } = hubWith()
  assert.equal(hub.dispatch({ type: 'reply', engineId: 'a', text: 'ok' }), false)
})

test('a reply goes to the bridge of its own conversation, else to the hub', () => {
  const { hub } = hubWith()
  const host = hub.hello({ engineId: 'a' })
  const peer = hub.hello({ engineId: 'b' })
  assert.equal(hub.dispatch({ type: 'reply', engineId: 'b', text: 'pour b' }), true)
  assert.equal(hub.dispatch({ type: 'reply', engineId: 'z', text: 'pour z' }), true)
  assert.deepEqual(hub.poll(peer.bridgeId).orders.map(entry => entry.text), ['pour b'])
  assert.deepEqual(hub.poll(host.bridgeId).orders.map(entry => entry.text), ['pour z'])
})

test('park, unpark and ack orders always go to the hub', () => {
  const { hub } = hubWith()
  const host = hub.hello({ engineId: 'a' })
  const peer = hub.hello({ engineId: 'b' })
  hub.dispatch({ type: 'park', engineId: 'b', kind: 'later', reason: '' })
  hub.dispatch({ type: 'ack', engineId: 'b', seen: true })
  assert.deepEqual(typesOf(hub.poll(host.bridgeId)), ['park', 'ack'])
  assert.deepEqual(hub.poll(peer.bridgeId).orders, [])
})

test('an order carries an id, is handed out once, then again only if not acknowledged in time', () => {
  const { hub, clock } = hubWith()
  const host = hub.hello({ engineId: 'a' })
  hub.dispatch({ type: 'summarize', engineId: 'a' })
  const [first] = hub.poll(host.bridgeId).orders
  assert.match(first.orderId, /^id-/)
  assert.deepEqual(hub.poll(host.bridgeId).orders, [])
  clock.advance(REDELIVER_MS)
  assert.deepEqual(hub.poll(host.bridgeId).orders.map(entry => entry.orderId), [first.orderId])
  hub.ack(host.bridgeId, [first.orderId])
  clock.advance(REDELIVER_MS)
  assert.deepEqual(hub.poll(host.bridgeId).orders, [])
})

test('a reply never acknowledged within a minute is dropped instead of handed out again', () => {
  const { hub, clock } = hubWith()
  const host = hub.hello({ engineId: 'a' })
  hub.dispatch({ type: 'reply', engineId: 'a', text: 'trop tard' })
  clock.advance(REPLY_TTL_MS / 2)
  assert.equal(hub.poll(host.bridgeId).orders.length, 1)
  clock.advance(REPLY_TTL_MS / 2 + 1)
  assert.deepEqual(hub.poll(host.bridgeId).orders, [])
})

test('when the hub leaves, the oldest peer takes over with the orders left behind', () => {
  const { hub } = hubWith()
  const host = hub.hello({ engineId: 'a' })
  const older = hub.hello({ engineId: 'b' })
  hub.hello({ engineId: 'c' })
  hub.dispatch({ type: 'park', engineId: 'c', kind: 'blocked', reason: 'attente' })
  hub.leave(host.bridgeId)
  assert.equal(hub.roleOf(older.bridgeId), 'hub')
  assert.deepEqual(typesOf(hub.poll(older.bridgeId)), ['park'])
})

test('a reply waiting for a conversation that closed goes to the hub instead', () => {
  const { hub } = hubWith()
  const host = hub.hello({ engineId: 'a' })
  const peer = hub.hello({ engineId: 'b' })
  hub.dispatch({ type: 'reply', engineId: 'b', text: 'pour b' })
  hub.leave(peer.bridgeId)
  assert.deepEqual(hub.poll(host.bridgeId).orders.map(entry => entry.text), ['pour b'])
})

test('a bridge silent for too long is forgotten and must say hello again', () => {
  const { hub, clock } = hubWith()
  const host = hub.hello({ engineId: 'a' })
  const peer = hub.hello({ engineId: 'b' })
  clock.advance(BRIDGE_TIMEOUT_MS / 2)
  hub.poll(peer.bridgeId)
  clock.advance(BRIDGE_TIMEOUT_MS / 2 + 1)
  assert.equal(hub.poll(host.bridgeId), null)
  assert.equal(hub.roleOf(peer.bridgeId), 'hub')
})

test('a waiting bridge is woken as soon as an order arrives for it', async () => {
  const hub = createBridgeHub()
  const host = hub.hello({ engineId: 'a' })
  const waiting = hub.waitForOrders(host.bridgeId, 5000)
  hub.dispatch({ type: 'summarize', engineId: 'a' })
  const polled = await waiting
  assert.deepEqual(typesOf(polled), ['summarize'])
  assert.equal(polled.role, 'hub')
})

test('a wait with nothing to deliver ends empty after its delay', async () => {
  const hub = createBridgeHub()
  const host = hub.hello({ engineId: 'a' })
  const polled = await hub.waitForOrders(host.bridgeId, 30)
  assert.deepEqual(polled.orders, [])
})

test('a waiting peer learns at once that it became the hub', async () => {
  const hub = createBridgeHub()
  const host = hub.hello({ engineId: 'a' })
  const peer = hub.hello({ engineId: 'b' })
  const waiting = hub.waitForOrders(peer.bridgeId, 5000)
  hub.leave(host.bridgeId)
  assert.equal((await waiting).role, 'hub')
})

test('a bridge waiting on the line is never forgotten for silence', () => {
  const { hub, clock } = hubWith()
  const host = hub.hello({ engineId: 'a' })
  const waiting = hub.waitForOrders(host.bridgeId, BRIDGE_TIMEOUT_MS * 3)
  clock.advance(BRIDGE_TIMEOUT_MS * 2)
  assert.equal(hub.roleOf(host.bridgeId), 'hub')
  hub.leave(host.bridgeId)
  return waiting
})
