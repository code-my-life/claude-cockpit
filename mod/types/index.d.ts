export type SessionStatus =
  | 'thinking'
  | 'writing'
  | 'tool'
  | 'working'
  | 'permission'
  | 'done'
  | 'aborted'
  | 'error'
  | 'opened'

export type RowStatus = SessionStatus | 'idle' | 'closed' | 'archived' | 'seen' | 'external' | 'blocked' | 'later'

export type ParkKind = 'blocked' | 'later'

export type ParkInfo = { kind: ParkKind; reason: string; at: number; updatedAt: number; hasMoved: boolean }

export type SectionId = 'waiting' | 'working' | 'others' | 'archived'

export type SectionFilters = Record<SectionId, boolean>

// One step of a conversation's activity feed (mod/hooks/activity.mjs).
export type ActivityStep = {
  at: number
  kind: 'edit' | 'read' | 'command' | 'search' | 'web' | 'agent' | 'tool'
  label: string
  file?: string
  added?: number
  removed?: number
  diff?: { before: string; after: string }
}

export type SessionEntry = {
  id: string
  cwd: string
  prompt: string
  status: SessionStatus
  tool?: string
  steps?: ActivityStep[]
  updatedAt: number
}

export type PullRequest = { number: number; repo: string | null; url: string; state: string }

export type ConversationContext = { repo: string | null; branch: string | null; ticket: string | null; prs: PullRequest[] }

export type HostSession = {
  hostId: string
  engineId: string
  title: string
  cwd: string
  lastActivityAt: number
  isArchived: boolean
  branch?: string | null
  ticket?: string | null
  repo?: string | null
  prs?: PullRequest[]
}

export type ConversationRow = {
  hostId: string | null
  engineId: string
  title: string
  cwd: string
  status: RowStatus
  tool?: string
  steps?: ActivityStep[]
  updatedAt: number
  isCurrent: boolean
  isLive: boolean
  park?: ParkInfo
  context: ConversationContext | null
}

export type DayStats = { day: string; prompts: number; delays: number[] }

export type StatsAcc = {
  version: number
  messages: number
  tools: number
  files: string[]
  firstAt: number | null
  lastAt: number | null
  activeMs: number
  lastTextMessageId: string | null
  lastAssistantAt: number | null
  today: DayStats
}

export type StoredStats = { offset: number; acc: StatsAcc }

export type RowStats = { messages: number; tools: number; files: number; activeMs: number; lastAt: number | null; today?: DayStats }

export type SummaryKind = 'question' | 'delivered' | 'external'

export type ThreadMessage = { role: 'user' | 'assistant'; text: string }

export type RowSummary = {
  updatedAt: number
  text: string
  awaiting?: string
  kind?: SummaryKind
  plain?: string
  thread?: ThreadMessage[]
  repos?: string[]
  isLoading: boolean
}

declare module 'claude-code' {
  interface PluginState {
    sessions: {
      list: ConversationRow[]
      filters: SectionFilters
      expanded: string[]
      booted: boolean
      summaries: Record<string, RowSummary>
    }
  }
}
