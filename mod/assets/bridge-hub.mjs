// The bridges the open conversations keep with the cockpit app: one of them is
// the hub (it writes the page and keeps the shared state), the others are
// peers. Orders from the page wait here until the right bridge picks them up.
import crypto from 'node:crypto'

export const BRIDGE_TIMEOUT_MS = 35000
export const REDELIVER_MS = 10000
export const MAX_WAIT_MS = 25000
const ORDER_TTL_MS = { reply: 60000, summarize: 60000 }
const DEFAULT_ORDER_TTL_MS = 600000
const ENGINE_ROUTED = new Set(['reply', 'summarize'])

export const createBridgeHub = ({ now = Date.now, newId = () => crypto.randomUUID() } = {}) => {
  const bridges = new Map()
  let hubId = null
  let pending = []

  const isAlive = bridge => bridge.waiters.size > 0 || now() - bridge.lastSeenAt <= BRIDGE_TIMEOUT_MS

  // Waiters run on a microtask so no wake ever re-enters the caller.
  const wake = id => queueMicrotask(() => {
    const bridge = bridges.get(id)
    if (bridge !== undefined) for (const waiter of [...bridge.waiters]) waiter()
  })

  const electHub = () => {
    if (hubId !== null && bridges.has(hubId)) return
    const oldest = bridges.values().next().value
    hubId = oldest === undefined ? null : oldest.id
    if (hubId !== null) wake(hubId)
  }

  const removeBridge = id => {
    const bridge = bridges.get(id)
    if (bridge === undefined) return
    bridges.delete(id)
    for (const waiter of [...bridge.waiters]) waiter(null)
    pending = pending.map(entry => (entry.target === id ? { ...entry, target: null, deliveredAt: null } : entry))
    if (hubId === id) hubId = null
    electHub()
  }

  const prune = () => {
    for (const bridge of [...bridges.values()]) if (!isAlive(bridge)) removeBridge(bridge.id)
    const time = now()
    pending = pending.filter(entry => entry.expiresAt > time)
  }

  const roleOf = id => {
    prune()
    if (!bridges.has(id)) return null
    return id === hubId ? 'hub' : 'peer'
  }

  const hello = ({ engineId }) => {
    prune()
    const bridge = { id: newId(), engineId, lastSeenAt: now(), waiters: new Set() }
    bridges.set(bridge.id, bridge)
    electHub()
    return { bridgeId: bridge.id, role: roleOf(bridge.id) }
  }

  const isDeliverable = (entry, id) => {
    const isMine = entry.target === id || (entry.target === null && id === hubId)
    const isDue = entry.deliveredAt === null || now() - entry.deliveredAt >= REDELIVER_MS
    return isMine && isDue
  }

  // The orders due for this bridge, marked as handed out; null for a bridge
  // the hub does not know (it must say hello again).
  const poll = id => {
    prune()
    const bridge = bridges.get(id)
    if (bridge === undefined) return null
    bridge.lastSeenAt = now()
    const handed = []
    pending = pending.map(entry => {
      if (!isDeliverable(entry, id)) return entry
      handed.push({ orderId: entry.orderId, ...entry.order })
      return { ...entry, deliveredAt: now() }
    })
    return { role: roleOf(id), orders: handed }
  }

  const ownBridgeOf = engineId => [...bridges.values()].find(bridge => bridge.engineId === engineId)

  // Queues an order; false when no conversation with the mod is connected.
  const dispatch = order => {
    prune()
    if (bridges.size === 0) return false
    const target = ENGINE_ROUTED.has(order.type) ? (ownBridgeOf(order.engineId)?.id ?? null) : null
    const ttl = ORDER_TTL_MS[order.type] ?? DEFAULT_ORDER_TTL_MS
    pending = [...pending, { orderId: newId(), order, target, expiresAt: now() + ttl, deliveredAt: null }]
    wake(target ?? hubId)
    return true
  }

  const ack = (id, orderIds) => {
    const bridge = bridges.get(id)
    if (bridge !== undefined) bridge.lastSeenAt = now()
    const acknowledged = new Set(orderIds)
    pending = pending.filter(entry => !acknowledged.has(entry.orderId))
  }

  // Resolves with the bridge's orders as soon as it has some or its role
  // changes, at the latest after `waitMs`; null once the bridge is gone.
  const waitForOrders = (id, waitMs, signal) => {
    const first = poll(id)
    if (first === null || first.orders.length > 0) return Promise.resolve(first)
    const bridge = bridges.get(id)
    return new Promise(resolve => {
      let timer = null
      const finish = result => {
        clearTimeout(timer)
        bridge.waiters.delete(waiter)
        resolve(result)
      }
      const waiter = gone => {
        if (gone === null) return finish(null)
        const polled = poll(id)
        if (polled === null || polled.orders.length > 0 || polled.role !== first.role) finish(polled)
      }
      bridge.waiters.add(waiter)
      timer = setTimeout(() => finish(poll(id)), Math.min(waitMs, MAX_WAIT_MS))
      signal?.addEventListener('abort', () => finish(null), { once: true })
    })
  }

  const bridgeCount = () => {
    prune()
    return bridges.size
  }

  return { hello, poll, dispatch, ack, waitForOrders, leave: removeBridge, roleOf, bridgeCount }
}
