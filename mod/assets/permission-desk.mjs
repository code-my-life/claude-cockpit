// The permission requests the conversations hand to the cockpit app, waiting
// for an answer from the island. A conversation asks, then waits; the island
// lists and decides; a request answered elsewhere (another hook, the terminal)
// is withdrawn. Everything lives in memory and expires.
import crypto from 'node:crypto'

export const PERMISSION_TTL_MS = 10 * 60 * 1000
export const MAX_PENDING_PERMISSIONS = 50
const MAX_SUMMARY_CHARS = 300
const MAX_DETAIL_CHARS = 4000
const MAX_TOOL_CHARS = 100
// Combien de temps la conversation attend l'île avant que Claude n'affiche sa propre demande.
const DEFAULT_HOLD_MS = 110000
const MIN_HOLD_MS = 5000
const MAX_HOLD_MS = 120000
// 'defer' rend la demande à Claude (sa propre fenêtre décide).
const DECISIONS = new Set(['allow', 'deny', 'always', 'defer'])

const textOf = (value, max) => String(value ?? '').slice(0, max)
const holdOf = value => (Number.isFinite(value) ? Math.min(MAX_HOLD_MS, Math.max(MIN_HOLD_MS, value)) : DEFAULT_HOLD_MS)

export const createPermissionDesk = ({ now = Date.now, newId = () => crypto.randomUUID(), onChange = () => {} } = {}) => {
  const requests = new Map()

  const settle = (entry, outcome) => {
    for (const waiter of [...entry.waiters]) waiter(outcome)
    entry.waiters.clear()
  }

  const drop = (requestId, outcome) => {
    const entry = requests.get(requestId)
    if (entry === undefined) return false
    requests.delete(requestId)
    settle(entry, outcome)
    onChange()
    return true
  }

  const prune = () => {
    const time = now()
    for (const entry of [...requests.values()]) {
      if (entry.decision === null && time - entry.askedAt > PERMISSION_TTL_MS) drop(entry.requestId, 'gone')
    }
  }

  const ask = ({ engineId, tool, summary, detail, canAlways, holdMs }) => {
    prune()
    for (const entry of [...requests.values()]) if (entry.engineId === engineId) drop(entry.requestId, 'gone')
    if (requests.size >= MAX_PENDING_PERMISSIONS) return null
    const entry = {
      requestId: newId(),
      engineId,
      tool: textOf(tool, MAX_TOOL_CHARS),
      summary: textOf(summary, MAX_SUMMARY_CHARS),
      detail: textOf(detail, MAX_DETAIL_CHARS),
      canAlways: canAlways === true,
      askedAt: now(),
      deadlineAt: now() + holdOf(holdMs),
      decision: null,
      waiters: new Set(),
    }
    requests.set(entry.requestId, entry)
    onChange()
    return { requestId: entry.requestId }
  }

  // A decided request leaves the list at once; its answer stays until read.
  const decide = (requestId, decision) => {
    prune()
    const entry = requests.get(requestId)
    if (entry === undefined || entry.decision !== null || !DECISIONS.has(decision)) return false
    if (decision === 'always' && !entry.canAlways) return false
    entry.decision = decision
    if (entry.waiters.size > 0) drop(requestId, decision)
    else onChange()
    return true
  }

  // Resolves with the decision, null when `waitMs` passes first (ask again),
  // or 'gone' when the request no longer exists.
  const waitDecision = (requestId, waitMs, signal) => {
    prune()
    const entry = requests.get(requestId)
    if (entry === undefined) return Promise.resolve('gone')
    if (entry.decision !== null) {
      const { decision } = entry
      drop(requestId, decision)
      return Promise.resolve(decision)
    }
    return new Promise(resolve => {
      let timer = null
      const waiter = outcome => {
        clearTimeout(timer)
        entry.waiters.delete(waiter)
        resolve(outcome)
      }
      entry.waiters.add(waiter)
      timer = setTimeout(() => waiter(null), waitMs)
      signal?.addEventListener('abort', () => waiter(null), { once: true })
    })
  }

  const withdraw = requestId => drop(requestId, 'gone')

  const list = () => {
    prune()
    return [...requests.values()]
      .filter(entry => entry.decision === null)
      .map(({ requestId, engineId, tool, summary, detail, canAlways, askedAt, deadlineAt }) => ({ requestId, engineId, tool, summary, detail, canAlways, askedAt, deadlineAt }))
  }

  return { ask, decide, waitDecision, withdraw, list }
}
