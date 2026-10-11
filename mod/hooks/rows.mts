import type { ConversationContext, ConversationRow, HostSession, ParkInfo, ParkKind, RowStatus, RowSummary, SessionEntry } from '../types'
import { sectionRank, urgencyOf, WAITING_STATUSES } from './sections.mts'

// The panel's rows, built from what the store and the session index hold. Pure.

export type ParkEntry = { kind: ParkKind; reason: string; at: number; updatedAt: number }
export type Parked = Record<string, ParkEntry>
export type Acks = Record<string, number>

export const parkInfoOf = (entry: ParkEntry | undefined, updatedAt: number): ParkInfo | undefined => {
  if (entry === undefined) return undefined
  return { ...entry, hasMoved: updatedAt > entry.updatedAt }
}

const isAcknowledged = (acks: Acks, engineId: string, updatedAt: number) => acks[engineId] === updatedAt

const withAck = (status: RowStatus, acks: Acks, engineId: string, updatedAt: number): RowStatus => {
  if (!WAITING_STATUSES.includes(status)) return status
  return isAcknowledged(acks, engineId, updatedAt) ? 'seen' : status
}

const rowStatusOf = (host: HostSession, entry: SessionEntry | undefined, isLive: boolean): RowStatus => {
  if (host.isArchived) return 'archived'
  if (!isLive) return 'closed'
  return entry?.status ?? 'idle'
}

const withExternal = (status: RowStatus, summary: RowSummary | undefined, updatedAt: number): RowStatus => {
  if (status !== 'done' || summary === undefined || summary.isLoading) return status
  const isCurrentOrPending = summary.updatedAt <= updatedAt
  return isCurrentOrPending && summary.kind === 'external' ? 'external' : status
}

const contextOf = (host: HostSession): ConversationContext => ({
  repo: host.repo ?? null,
  branch: host.branch ?? null,
  ticket: host.ticket ?? null,
  prs: host.prs ?? [],
})

export type RowSources = {
  live: Record<string, SessionEntry>
  hosts: HostSession[]
  liveEngineIds: Set<string>
  acks: Acks
  shared: Record<string, RowSummary>
  parked: Parked
  ownEngineId: string
}

export const buildRows = ({ live, hosts, liveEngineIds, acks, shared, parked, ownEngineId }: RowSources): ConversationRow[] => {
  const statusOf = (engineId: string, status: RowStatus, updatedAt: number): RowStatus => {
    const park = parked[engineId]
    if (park !== undefined && status !== 'archived' && status !== 'closed') return park.kind
    const acknowledged = withAck(status, acks, engineId, updatedAt)
    return withExternal(acknowledged, shared[engineId], updatedAt)
  }
  const rows: ConversationRow[] = []
  const seen = new Set<string>()
  for (const host of hosts) {
    const entry = live[host.engineId]
    const isLive = liveEngineIds.has(host.engineId)
    const updatedAt = entry?.updatedAt ?? host.lastActivityAt
    seen.add(host.engineId)
    rows.push({
      hostId: host.hostId,
      engineId: host.engineId,
      title: host.title,
      cwd: host.cwd,
      status: statusOf(host.engineId, rowStatusOf(host, entry, isLive), updatedAt),
      tool: entry?.tool,
      steps: entry?.steps,
      updatedAt,
      isCurrent: host.engineId === ownEngineId,
      isLive,
      park: parkInfoOf(parked[host.engineId], updatedAt),
      context: contextOf(host),
    })
  }
  for (const entry of Object.values(live)) {
    if (seen.has(entry.id)) continue
    if (!liveEngineIds.has(entry.id)) continue
    rows.push({
      hostId: null,
      engineId: entry.id,
      title: entry.prompt || '(terminal)',
      cwd: entry.cwd,
      status: statusOf(entry.id, entry.status, entry.updatedAt),
      tool: entry.tool,
      steps: entry.steps,
      updatedAt: entry.updatedAt,
      isCurrent: entry.id === ownEngineId,
      isLive: true,
      park: parkInfoOf(parked[entry.id], entry.updatedAt),
      context: null,
    })
  }
  return rows.sort((a, b) => {
    const rankDelta = sectionRank(a.status) - sectionRank(b.status)
    if (rankDelta !== 0) return rankDelta
    const urgencyDelta = urgencyOf(a.status) - urgencyOf(b.status)
    return urgencyDelta !== 0 ? urgencyDelta : b.updatedAt - a.updatedAt
  })
}

// A summary being written here wins; otherwise the newer one, from here or shared.
export const mergeSummaries = (shared: Record<string, RowSummary>, local: Record<string, RowSummary>) => {
  const merged: Record<string, RowSummary> = { ...shared }
  for (const [engineId, entry] of Object.entries(local)) {
    const known = merged[engineId]
    if (entry.isLoading || known === undefined || entry.updatedAt > known.updatedAt) merged[engineId] = entry
  }
  return merged
}
