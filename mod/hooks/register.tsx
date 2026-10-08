import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type {
  ConversationRow,
  HostSession,
  RowStatus,
  RowSummary,
  RowStats,
  StoredStats,
  ParkInfo,
  ParkKind,
  SummaryKind,
  ThreadMessage,
  SectionFilters,
  SectionId,
  SessionEntry,
  SessionStatus,
} from '../types'

const PANE = 'sessions'
const STORE_KEY = 'sessions'
const FILTERS_STORE_KEY = 'filters'
const SUMMARIES_STORE_KEY = 'summaries'
const ACKS_STORE_KEY = 'acks'
const PARKED_STORE_KEY = 'parked'
const STATS_STORE_KEY = 'stats'
const STATS_SCRIPT = 'assets/stats.mjs'
const STATS_BACKFILL_PER_RUN = 6
const STATS_VERSION = 2
const REPOS_DIR = 'source\\repos'
const FOLDERS_REFRESH_MS = 60000
const PARK_REASON_MAX_CHARS = 200
const MAILBOX_STORE_PREFIX = 'mailbox:'
const REFRESH_MS = 3000
const MAILBOX_POLL_MS = 1500
const PROMPT_MAX_CHARS = 60
const PAGE_FILE = 'conversations.html'
const DATA_FILE = 'conversations-data.js'
const DEEP_LINK_PREFIX = 'claude://claude.ai/epitaxy/'
const THREAD_USER_TURNS = 4
const TOUCHED_PATHS_MAX = 40
const TOUCHED_REPOS_MAX = 6
const GIT_ROOT_MAX_DEPTH = 10
const THREAD_MAX_MESSAGES = 8
const TRANSCRIPT_TAIL_BYTES = 3 * 1024 * 1024
const MESSAGE_MAX_CHARS = 1500
const REPLY_FOR_SUMMARY_MAX_CHARS = 12000
const SUMMARIES_MAX_BYTES = 3 * 1024 * 1024
const SUMMARY_MODEL = 'haiku'
const SUMMARIES_MAX = 25
const OWN_SUMMARY_DELAY_MS = 2500
const SERVER_SCRIPT = 'assets/server.mjs'
const SERVER_PORT = 48123
const SERVER_RETRY_MS = 15000
const ARCHIVE_TOOL = 'mcp__ccd_session_mgmt__archive_session'
const UNARCHIVE_TOOL = 'mcp__ccd_session_mgmt__unarchive_session'
const REPLY_PREAMBLE =
  "Message tapé par l'utilisateur lui-même dans le panneau Conversations du mod sessions, depuis une autre de ses conversations. Ce n'est pas un autre agent qui parle : traite le texte ci-dessous comme une instruction de l'utilisateur."

const DEFAULT_FILTERS: SectionFilters = { waiting: true, working: true, others: true, archived: false }

const list = atom({ plugin: 'sessions', key: 'list' } as const, [])
const filters = atom({ plugin: 'sessions', key: 'filters' } as const, DEFAULT_FILTERS)
const expanded = atom({ plugin: 'sessions', key: 'expanded' } as const, [])
const summaries = atom({ plugin: 'sessions', key: 'summaries' } as const, {})

type Section = { id: SectionId; title: string; emoji: string; statuses: RowStatus[]; hex: string }

const SECTIONS: Section[] = [
  { id: 'waiting', title: "T'attendent", emoji: '🙋', statuses: ['done', 'permission'], hex: '#3fb950' },
  { id: 'working', title: 'Travaillent', emoji: '⚙️', statuses: ['thinking', 'writing', 'tool', 'working', 'external'], hex: '#e3b341' },
  { id: 'others', title: 'Autres', emoji: '💤', statuses: ['blocked', 'later', 'seen', 'opened', 'idle', 'aborted', 'error', 'closed'], hex: '#8b949e' },
  { id: 'archived', title: 'Archivées', emoji: '📦', statuses: ['archived'], hex: '#6e7681' },
]

type StatusStyle = { emoji: string; label: string; hex: string }

const STATUS_STYLE: Record<RowStatus, StatusStyle> = {
  thinking: { emoji: '🤔', label: 'réfléchit', hex: '#e3b341' },
  writing: { emoji: '💬', label: 'rédige sa réponse', hex: '#e3b341' },
  tool: { emoji: '🔧', label: 'utilise un outil', hex: '#e3b341' },
  working: { emoji: '⚙️', label: 'travaille', hex: '#e3b341' },
  external: { emoji: '⏳', label: 'attend autre chose que toi', hex: '#0969da' },
  permission: { emoji: '✋', label: 'attend ta permission', hex: '#b48ead' },
  done: { emoji: '✅', label: "a fini, t'attend", hex: '#3fb950' },
  aborted: { emoji: '⏹️', label: 'interrompue', hex: '#8b949e' },
  error: { emoji: '💥', label: 'en erreur', hex: '#f85149' },
  seen: { emoji: '👀', label: 'vue, en attente de toi', hex: '#8b949e' },
  blocked: { emoji: '🚫', label: 'bloquée', hex: '#d1242f' },
  later: { emoji: '⏸️', label: 'mise de côté', hex: '#8b949e' },
  opened: { emoji: '📂', label: 'ouverte, rien de nouveau', hex: '#8b949e' },
  idle: { emoji: '😴', label: 'sans le mod', hex: '#8b949e' },
  closed: { emoji: '💤', label: 'fermée', hex: '#6e7681' },
  archived: { emoji: '📦', label: 'archivée', hex: '#6e7681' },
}

type ToolFlavor = { match: RegExp; emoji: string; label: string }

const TOOL_FLAVORS: ToolFlavor[] = [
  { match: /^(Read|Grep|Glob)$/, emoji: '🔎', label: 'fouille le code' },
  { match: /^(Edit|Write|NotebookEdit)$/, emoji: '📝', label: 'modifie des fichiers' },
  { match: /^Bash$/, emoji: '🖥️', label: 'lance une commande' },
  { match: /^Agent$/, emoji: '🤖', label: 'délègue à un agent' },
  { match: /^(WebFetch|WebSearch)$/, emoji: '🌐', label: 'va sur le web' },
  { match: /^AskUserQuestion$/, emoji: '❓', label: 'te pose une question' },
  { match: /^mcp__/, emoji: '🔌', label: 'interroge un service' },
]

const HOVER_HEX = '#58a6ff'

let ownEngineId = ''
let ownPhase: SessionStatus | null = null
let lastDataJson = ''
let isServing = false
let isStartingServer = false
let isCountingStats = false
let repoFolders: string[] = []
let repoFoldersReadAt = 0
const SEED_MARKER = '<!--SEED-->'
const hostCache = new Map<string, { mtimeMs: number; session: HostSession | null }>()
const transcriptCache = new Map<string, string>()

const styleOf = (row: Pick<ConversationRow, 'status' | 'tool'>): StatusStyle => {
  const base = STATUS_STYLE[row.status]
  if (row.status !== 'tool' || row.tool === undefined) return base
  const flavor = TOOL_FLAVORS.find(candidate => candidate.match.test(row.tool as string))
  if (flavor === undefined) return base
  return { ...base, emoji: flavor.emoji, label: flavor.label }
}

const readAll = async ($: EngineInterface): Promise<Record<string, SessionEntry>> => {
  const stored = await $.store.get(STORE_KEY)
  return (stored ?? {}) as Record<string, SessionEntry>
}

const ACTIVE_STATUSES: SessionStatus[] = ['thinking', 'writing', 'tool', 'working']

const writeOwn = async ($: EngineInterface, patch: Partial<SessionEntry>, options: { keepUpdatedAt?: boolean } = {}) => {
  const id = await $.session.id()
  const cwd = await $.session.cwd()
  const all = await readAll($)
  const current = all[id] ?? { id, cwd, prompt: '', status: 'opened', updatedAt: Date.now() }
  const updatedAt = options.keepUpdatedAt === true ? current.updatedAt : Date.now()
  const merged: SessionEntry = { ...current, ...patch, updatedAt }
  if (patch.status !== undefined && patch.status !== 'tool') delete merged.tool
  all[id] = merged
  ownPhase = merged.status
  await $.store.set(STORE_KEY, all)
  return merged
}

const declareOwnStart = async ($: EngineInterface, cwd: string) => {
  const { value: wasBooted } = await $.state.get({ plugin: 'sessions', key: 'booted' } as const)
  if (wasBooted === true) {
    const all = await readAll($)
    ownPhase = all[ownEngineId]?.status ?? null
    return
  }
  await $.state.set({ plugin: 'sessions', key: 'booted' } as const, true)
  const all = await readAll($)
  const previous = all[ownEngineId]
  if (previous === undefined) {
    await writeOwn($, { status: 'opened', cwd })
    return
  }
  if (ACTIVE_STATUSES.includes(previous.status)) {
    await writeOwn($, { status: 'opened', cwd }, { keepUpdatedAt: true })
    return
  }
  ownPhase = previous.status
}

const removeOwn = async ($: EngineInterface, id: string) => {
  const all = await readAll($)
  delete all[id]
  await $.store.set(STORE_KEY, all)
}

const loadFilters = async ($: EngineInterface) => {
  const stored = await $.store.get(FILTERS_STORE_KEY)
  const saved = (stored ?? {}) as Partial<SectionFilters>
  await update($, filters, () => ({ ...DEFAULT_FILTERS, ...saved }))
}

const toggleFilter = async ($: EngineInterface, id: SectionId) => {
  const next = await update($, filters, current => ({ ...current, [id]: !current[id] }))
  await $.store.set(FILTERS_STORE_KEY, next)
}

const parseHostSession = (text: string): HostSession | null => {
  const data = JSON.parse(text) as Record<string, unknown>
  if (typeof data.sessionId !== 'string' || typeof data.cliSessionId !== 'string') return null
  return {
    hostId: data.sessionId,
    engineId: data.cliSessionId,
    title: typeof data.title === 'string' ? data.title : '(sans titre)',
    cwd: typeof data.cwd === 'string' ? data.cwd : '',
    lastActivityAt: typeof data.lastActivityAt === 'number' ? data.lastActivityAt : 0,
    isArchived: data.isArchived === true,
  }
}

const readHostSessionFile = async ($: EngineInterface, path: string, mtimeMs: number) => {
  const cached = hostCache.get(path)
  if (cached !== undefined && cached.mtimeMs === mtimeMs) return cached.session
  let session: HostSession | null = null
  try {
    const text = await $.fs.read(path)
    session = parseHostSession(text)
  } catch {
    session = null
  }
  hostCache.set(path, { mtimeMs, session })
  return session
}

const listSubdirs = async ($: EngineInterface, path: string) => {
  const exists = await $.fs.exists(path)
  if (!exists) return []
  const entries = await $.fs.list(path)
  const dirs = entries.filter(entry => entry.kind === 'dir')
  return dirs.map(dir => `${path}/${dir.name}`)
}

const toBackslashes = (path: string) => path.replace(/\//g, '\\')

const readRepoFolders = async ($: EngineInterface) => {
  if (Date.now() - repoFoldersReadAt < FOLDERS_REFRESH_MS) return repoFolders
  repoFoldersReadAt = Date.now()
  const home = await $.env.get('USERPROFILE')
  if (home === undefined) return repoFolders
  const dirs = await listSubdirs($, `${home}\\${REPOS_DIR}`)
  const repos: string[] = []
  for (const dir of dirs) {
    const isRepo = await $.fs.exists(`${dir}/.git`)
    if (isRepo) repos.push(toBackslashes(dir))
  }
  repoFolders = repos
  return repoFolders
}

const knownFoldersOf = async ($: EngineInterface, rows: ConversationRow[]) => {
  const byRecency = [...rows].sort((a, b) => b.updatedAt - a.updatedAt)
  const recent = byRecency.map(row => toBackslashes(row.cwd)).filter(cwd => cwd.length > 0)
  const repos = await readRepoFolders($)
  return [...new Set([...recent, ...repos])]
}

const readHostSessions = async ($: EngineInterface): Promise<HostSession[]> => {
  const appData = await $.env.get('APPDATA')
  if (appData === undefined) return []
  const root = `${appData}/Claude/claude-code-sessions`
  const accountDirs = await listSubdirs($, root)
  const sessions: HostSession[] = []
  for (const accountDir of accountDirs) {
    const orgDirs = await listSubdirs($, accountDir)
    for (const orgDir of orgDirs) {
      const entries = await $.fs.list(orgDir)
      const files = entries.filter(entry => entry.kind === 'file' && entry.name.endsWith('.json'))
      for (const file of files) {
        const session = await readHostSessionFile($, `${orgDir}/${file.name}`, file.mtimeMs)
        if (session !== null) sessions.push(session)
      }
    }
  }
  return sessions
}

const readLiveEngineIds = async ($: EngineInterface): Promise<Set<string>> => {
  const home = await $.env.get('USERPROFILE')
  if (home === undefined) return new Set()
  const dir = `${home}/.claude/sessions`
  const exists = await $.fs.exists(dir)
  if (!exists) return new Set()
  const entries = await $.fs.list(dir)
  const files = entries.filter(entry => entry.kind === 'file' && entry.name.endsWith('.json'))
  const ids = new Set<string>()
  for (const file of files) {
    try {
      const text = await $.fs.read(`${dir}/${file.name}`)
      const data = JSON.parse(text) as Record<string, unknown>
      if (typeof data.sessionId === 'string') ids.add(data.sessionId)
    } catch {
      continue
    }
  }
  return ids
}

type ParkEntry = { kind: ParkKind; reason: string; at: number; updatedAt: number }
type Parked = Record<string, ParkEntry>

const readParked = async ($: EngineInterface): Promise<Parked> => {
  const stored = await $.store.get(PARKED_STORE_KEY)
  return (stored ?? {}) as Parked
}

const parkConversation = async ($: EngineInterface, row: ConversationRow, kind: ParkKind, reason: string) => {
  const parked = await readParked($)
  const cleanReason = reason.trim().slice(0, PARK_REASON_MAX_CHARS)
  parked[row.engineId] = { kind, reason: cleanReason, at: Date.now(), updatedAt: row.updatedAt }
  await $.store.set(PARKED_STORE_KEY, parked)
  await refresh($)
}

const unparkConversation = async ($: EngineInterface, row: ConversationRow) => {
  const parked = await readParked($)
  delete parked[row.engineId]
  await $.store.set(PARKED_STORE_KEY, parked)
  await refresh($)
}

const parkInfoOf = (entry: ParkEntry | undefined, updatedAt: number): ParkInfo | undefined => {
  if (entry === undefined) return undefined
  return { ...entry, hasMoved: updatedAt > entry.updatedAt }
}

type Acks = Record<string, number>

const readAcks = async ($: EngineInterface): Promise<Acks> => {
  const stored = await $.store.get(ACKS_STORE_KEY)
  return (stored ?? {}) as Acks
}

const setSeen = async ($: EngineInterface, row: ConversationRow, isSeen: boolean) => {
  const acks = await readAcks($)
  if (isSeen) acks[row.engineId] = row.updatedAt
  else delete acks[row.engineId]
  await $.store.set(ACKS_STORE_KEY, acks)
  await refresh($)
}

const isAcknowledged = (acks: Acks, engineId: string, updatedAt: number) => acks[engineId] === updatedAt

const sectionOf = (status: RowStatus) => SECTIONS.find(section => section.statuses.includes(status)) ?? SECTIONS[2]

const sectionRank = (status: RowStatus) => SECTIONS.indexOf(sectionOf(status))

const WAITING_STATUSES: RowStatus[] = ['done', 'permission']

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

const buildRows = (
  live: Record<string, SessionEntry>,
  hosts: HostSession[],
  liveEngineIds: Set<string>,
  acks: Acks,
  shared: Record<string, RowSummary>,
  parked: Parked,
): ConversationRow[] => {
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
      updatedAt,
      isCurrent: host.engineId === ownEngineId,
      isLive,
      park: parkInfoOf(parked[host.engineId], updatedAt),
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
      updatedAt: entry.updatedAt,
      isCurrent: entry.id === ownEngineId,
      isLive: true,
      park: parkInfoOf(parked[entry.id], entry.updatedAt),
    })
  }
  return rows.sort((a, b) => {
    const rankDelta = sectionRank(a.status) - sectionRank(b.status)
    if (rankDelta !== 0) return rankDelta
    const urgencyDelta = urgencyOf(a.status) - urgencyOf(b.status)
    return urgencyDelta !== 0 ? urgencyDelta : b.updatedAt - a.updatedAt
  })
}

const urgencyOf = (status: RowStatus) => (status === 'permission' ? 0 : 1)

const refresh = async ($: EngineInterface) => {
  const live = await readAll($)
  const hosts = await readHostSessions($)
  const liveEngineIds = await readLiveEngineIds($)
  const acks = await readAcks($)
  const shared = await readSharedSummaries($)
  const parked = await readParked($)
  const stats = await readStoredStats($)
  const rows = buildRows(live, hosts, liveEngineIds, acks, shared, parked)
  await update($, list, () => rows)
  await update($, summaries, current => mergeSummaries(shared, current))
  await writeDataFile($, rows, shared, stats)
}

const mergeSummaries = (shared: Record<string, RowSummary>, local: Record<string, RowSummary>) => {
  const merged: Record<string, RowSummary> = { ...shared }
  for (const [engineId, entry] of Object.entries(local)) {
    const known = merged[engineId]
    if (entry.isLoading || known === undefined || entry.updatedAt > known.updatedAt) merged[engineId] = entry
  }
  return merged
}

const openConversation = ($: EngineInterface, hostId: string) => {
  const url = `${DEEP_LINK_PREFIX}${hostId}`
  const running = $.process.run(['rundll32', 'url.dll,FileProtocolHandler', url], { timeoutMs: 10000 })
  void running.then(ran => {
    if (ran.exitCode !== 0) $.ui.toast(`Ouverture impossible : ${ran.stderr.slice(0, 80)}`)
  })
}

const markWorking = async ($: EngineInterface, engineId: string) => {
  const all = await readAll($)
  const entry = all[engineId]
  if (entry === undefined) return
  all[engineId] = { ...entry, status: 'working', updatedAt: Date.now() }
  delete all[engineId].tool
  await $.store.set(STORE_KEY, all)
}

type MailboxLetter = { at: number; text: string }

const mailboxKey = (engineId: string) => `${MAILBOX_STORE_PREFIX}${engineId}`

const readMailbox = async ($: EngineInterface, engineId: string): Promise<MailboxLetter[]> => {
  const stored = await $.store.get(mailboxKey(engineId))
  return Array.isArray(stored) ? (stored as MailboxLetter[]) : []
}

const depositInMailbox = async ($: EngineInterface, engineId: string, text: string) => {
  const letters = await readMailbox($, engineId)
  letters.push({ at: Date.now(), text })
  await $.store.set(mailboxKey(engineId), letters)
  return { isDelivered: true, reason: undefined as string | undefined }
}

const collectOwnMail = async ($: EngineInterface) => {
  if (ownEngineId === '') return
  const letters = await readMailbox($, ownEngineId)
  if (letters.length === 0) return
  await $.store.delete(mailboxKey(ownEngineId))
  for (const letter of letters) void $.prompt.submit({ text: letter.text, asUser: true })
}

const sendReply = async ($: EngineInterface, row: ConversationRow, text: string) => {
  const message = text.trim()
  if (message.length === 0) return
  const sessionId = row.engineId
  const framed = `${REPLY_PREAMBLE}\n\n${message}`
  const live = await readAll($)
  const hasMailbox = live[sessionId] !== undefined
  const sent = hasMailbox ? await depositInMailbox($, sessionId, message) : await $.session.send({ to: { sessionId }, text: framed })
  await collapseRow($, row.engineId)
  if (sent.isDelivered) {
    await markWorking($, row.engineId)
    await refresh($)
    $.ui.toast(`✉️ Envoyé à « ${row.title} »`)
  } else {
    $.ui.toast(`Non envoyé : ${sent.reason ?? 'raison inconnue'}`)
  }
}

const callHostTool = async ($: EngineInterface, tool: string, args: Record<string, unknown>, okText: string) => {
  try {
    const ran = await $.tool.call({ tool, ...args })
    if (ran.deny !== undefined) {
      $.ui.toast(`Refusé : ${ran.deny.slice(0, 120)}`)
    } else if (ran.isError === true) {
      $.ui.toast(`Échec : ${ran.text.slice(0, 120)}`)
    } else {
      $.ui.toast(okText)
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    $.ui.toast(`Échec : ${reason.slice(0, 120)}`)
  }
  await refresh($)
}

const archiveConversation = ($: EngineInterface, row: ConversationRow) =>
  callHostTool($, ARCHIVE_TOOL, { session_id: row.hostId, reason: 'Depuis le panneau Conversations' }, `📦 « ${row.title} » archivée`)

const unarchiveConversation = ($: EngineInterface, row: ConversationRow) =>
  callHostTool($, UNARCHIVE_TOOL, { session_id: row.hostId }, `📂 « ${row.title} » restaurée`)

type BridgeMessage = {
  type: string
  engineId?: string
  text?: string
  images?: string[]
  message?: string
  seen?: boolean
  kind?: string
  reason?: string
}

const formatImagesNote = (images: string[]) => {
  if (images.length === 0) return ''
  const lines = images.map(path => `- ${path}`)
  return `\n\nImages jointes par l'utilisateur, à ouvrir avec l'outil Read :\n${lines.join('\n')}`
}

const handleBridgeMessage = async ($: EngineInterface, message: BridgeMessage) => {
  if (message.type === 'listening') {
    isServing = true
    return
  }
  if (message.type === 'error') {
    $.ui.toast(`Serveur cockpit : ${String(message.message ?? '').slice(0, 100)}`)
    return
  }
  const rows = await read($, list)
  const row = rows.find(candidate => candidate.engineId === message.engineId)
  if (row === undefined) return
  if (message.type === 'summarize') {
    await regenerateSummary($, row)
    await refresh($)
    return
  }
  if (message.type === 'ack') {
    await setSeen($, row, message.seen === true)
    return
  }
  if (message.type === 'park' && (message.kind === 'blocked' || message.kind === 'later')) {
    await parkConversation($, row, message.kind, message.reason ?? '')
    return
  }
  if (message.type === 'unpark') {
    await unparkConversation($, row)
    return
  }
  if (message.type === 'reply') {
    const images = Array.isArray(message.images) ? message.images : []
    const text = `${message.text ?? ''}${formatImagesNote(images)}`
    await sendReply($, row, text)
  }
}

const handleBridgeLine = async ($: EngineInterface, line: string) => {
  try {
    const message = JSON.parse(line) as BridgeMessage
    await handleBridgeMessage($, message)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    $.ui.log(`sessions: message du serveur ignoré (${reason})`, { to: 'debug' })
  }
}

type BridgeStream = ReturnType<EngineInterface['process']['spawn']>

const consumeBridge = async ($: EngineInterface, stream: BridgeStream) => {
  let buffer = ''
  for await (const chunk of stream) {
    if (chunk.stream !== 'stdout') continue
    buffer += chunk.text
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line.length > 0) await handleBridgeLine($, line)
      newline = buffer.indexOf('\n')
    }
  }
  return stream.result
}

const startServer = async ($: EngineInterface) => {
  if (isServing || isStartingServer) return
  isStartingServer = true
  const script = `${$.plugin.root}/${SERVER_SCRIPT}`
  try {
    const stream = $.process.spawn({ argv: ['node', script, pageDir($), String(SERVER_PORT)] })
    const ended = await consumeBridge($, stream)
    if (ended.code !== 0 && ended.code !== 3) {
      $.ui.log(`sessions: serveur cockpit arrêté (code ${ended.code})`, { to: 'debug' })
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    $.ui.log(`sessions: serveur cockpit non démarré (${reason})`, { to: 'debug' })
  }
  isServing = false
  isStartingServer = false
}

const findTranscript = async ($: EngineInterface, engineId: string) => {
  const cached = transcriptCache.get(engineId)
  if (cached !== undefined) return cached
  const home = await $.env.get('USERPROFILE')
  if (home === undefined) return null
  const projectDirs = await listSubdirs($, `${home}/.claude/projects`)
  for (const projectDir of projectDirs) {
    const candidate = `${projectDir}/${engineId}.jsonl`
    const exists = await $.fs.exists(candidate)
    if (exists) {
      transcriptCache.set(engineId, candidate)
      return candidate
    }
  }
  return null
}

const readStoredStats = async ($: EngineInterface): Promise<Record<string, StoredStats>> => {
  const stored = await $.store.get(STATS_STORE_KEY)
  return (stored ?? {}) as Record<string, StoredStats>
}

const rowStatsOf = (stored: StoredStats | undefined): RowStats | undefined => {
  if (stored === undefined) return undefined
  const acc = stored.acc
  return { messages: acc.messages, tools: acc.tools, files: acc.files.length, activeMs: acc.activeMs, lastAt: acc.lastAt, today: acc.today }
}

type StatsJob = { id: string; path: string; offset: number; acc: StoredStats['acc'] | null }
type StatsResult = { id: string; offset?: number; acc?: StoredStats['acc']; error?: string }

const statsTargets = async ($: EngineInterface, known: Record<string, StoredStats>) => {
  const rows = await read($, list)
  const missing = rows
    .filter(row => row.status !== 'archived' && row.engineId !== ownEngineId && known[row.engineId]?.acc.version !== STATS_VERSION)
    .slice(0, STATS_BACKFILL_PER_RUN)
    .map(row => row.engineId)
  return [ownEngineId, ...missing]
}

const buildStatsJobs = async ($: EngineInterface, ids: string[], known: Record<string, StoredStats>) => {
  const jobs: StatsJob[] = []
  for (const id of ids) {
    const path = await findTranscript($, id)
    if (path === null) continue
    const previous = known[id]
    jobs.push({ id, path, offset: previous?.offset ?? 0, acc: previous?.acc ?? null })
  }
  return jobs
}

const runStatsJobs = async ($: EngineInterface, jobs: StatsJob[]): Promise<StatsResult[]> => {
  const jobFile = `${pageDir($)}/stats-job-${ownEngineId}.json`
  await $.fs.write(jobFile, JSON.stringify(jobs))
  const script = `${$.plugin.root}/${STATS_SCRIPT}`
  const ran = await $.process.run(['node', script, jobFile], { timeoutMs: 60000 })
  if (ran.exitCode !== 0) throw new Error(ran.stderr.slice(0, 200))
  return JSON.parse(ran.stdout || '[]') as StatsResult[]
}

const refreshStats = async ($: EngineInterface) => {
  if (isCountingStats || ownEngineId === '') return
  isCountingStats = true
  try {
    const known = await readStoredStats($)
    const ids = await statsTargets($, known)
    const jobs = await buildStatsJobs($, ids, known)
    if (jobs.length === 0) return
    const results = await runStatsJobs($, jobs)
    const latest = await readStoredStats($)
    for (const result of results) {
      if (result.offset === undefined || result.acc === undefined) continue
      latest[result.id] = { offset: result.offset, acc: result.acc }
    }
    await $.store.set(STATS_STORE_KEY, latest)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    $.ui.log(`sessions: chiffres non calculés (${reason})`, { to: 'debug' })
  } finally {
    isCountingStats = false
  }
}

const buildTailScript = (path: string) => `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$stream = [System.IO.File]::Open('${path}', 'Open', 'Read', 'ReadWrite')
try {
  $size = $stream.Length
  $window = [Math]::Min($size, ${TRANSCRIPT_TAIL_BYTES})
  $null = $stream.Seek($size - $window, 'Begin')
  $bytes = New-Object byte[] $window
  $read = $stream.Read($bytes, 0, $window)
  $text = [Text.Encoding]::UTF8.GetString($bytes, 0, $read)
} finally { $stream.Dispose() }
$lines = $text -split "\`n"
if ($window -lt $size -and $lines.Count -gt 1) { $lines = $lines[1..($lines.Count - 1)] }
$entries = New-Object System.Collections.ArrayList
$users = 0
for ($i = $lines.Count - 1; $i -ge 0 -and $users -lt ${THREAD_USER_TURNS}; $i--) {
  try { $o = $lines[$i] | ConvertFrom-Json } catch { continue }
  if ($o.type -ne 'user' -and $o.type -ne 'assistant') { continue }
  $isPeer = $o.isMeta -eq $true -and $null -ne $o.origin -and $o.origin.kind -eq 'peer' -and $o.origin.plugin -eq 'sessions'
  if ($o.isMeta -eq $true -and -not $isPeer) { continue }
  if ($isPeer) { $text = [string]$o.origin.body } else {
    $c = $o.message.content
    if ($c -is [string]) { $text = $c } else { $text = (($c | Where-Object { $_.type -eq 'text' } | ForEach-Object { $_.text }) -join "\`n") }
  }
  if ([string]::IsNullOrWhiteSpace($text)) { continue }
  $null = $entries.Add(@{ r = $o.type; t = $text })
  if ($o.type -eq 'user') { $users++ }
}
$entries.Reverse()
$paths = New-Object System.Collections.ArrayList
for ($i = $lines.Count - 1; $i -ge 0 -and $paths.Count -lt ${TOUCHED_PATHS_MAX}; $i--) {
  if ($lines[$i] -notmatch '"tool_use"') { continue }
  try { $o = $lines[$i] | ConvertFrom-Json } catch { continue }
  if ($o.type -ne 'assistant' -or $o.message.content -is [string]) { continue }
  foreach ($block in $o.message.content) {
    if ($block.type -ne 'tool_use' -or $null -eq $block.input) { continue }
    foreach ($key in @('file_path', 'path', 'notebook_path')) {
      $value = $block.input.$key
      if ($value -is [string] -and $value.Length -gt 2) { $null = $paths.Add($value) }
    }
    $command = $block.input.command
    if ($command -is [string]) {
      foreach ($match in [regex]::Matches($command, '(?:^|[;&|]\s*)cd\s+("([^"]+)"|''([^'']+)''|(\S+))')) {
        $target = @($match.Groups[2].Value, $match.Groups[3].Value, $match.Groups[4].Value) | Where-Object { $_ } | Select-Object -First 1
        if ($target) { $null = $paths.Add($target) }
      }
      foreach ($match in [regex]::Matches($command, 'git\s+-C\s+("([^"]+)"|(\S+))')) {
        $target = @($match.Groups[2].Value, $match.Groups[3].Value) | Where-Object { $_ } | Select-Object -First 1
        if ($target) { $null = $paths.Add($target) }
      }
    }
  }
}
ConvertTo-Json -Compress -Depth 4 -InputObject @{ entries = @($entries); paths = @($paths) }
`

type LastMessages = { user: string | null; assistant: string | null; thread: ThreadMessage[]; paths: string[] }

type RawEntry = { r: string; t: string }

const cleanUserText = (text: string) => {
  const withoutReminders = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
  const preambleAt = withoutReminders.indexOf(REPLY_PREAMBLE)
  const body = preambleAt >= 0 ? withoutReminders.slice(preambleAt + REPLY_PREAMBLE.length) : withoutReminders
  return body.replace(/<\/?cross-session-message[^>]*>/g, '').trim()
}

const isCommandNoise = (text: string) => /^<(local-command|command-)/.test(text.trim())

const buildThread = (raw: RawEntry[]): ThreadMessage[] => {
  const thread: ThreadMessage[] = []
  for (const entry of raw) {
    const role: ThreadMessage['role'] = entry.r === 'user' ? 'user' : 'assistant'
    const text = role === 'user' ? cleanUserText(entry.t) : entry.t.trim()
    if (text.length === 0 || isCommandNoise(text)) continue
    const last = thread.at(-1)
    if (last !== undefined && last.role === role && role === 'assistant') {
      last.text = text
      continue
    }
    thread.push({ role, text })
  }
  return thread.slice(-THREAD_MAX_MESSAGES)
}

const readLastMessages = async ($: EngineInterface, path: string): Promise<LastMessages> => {
  const script = buildTailScript(path)
  const ran = await $.process.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', script], {
    timeoutMs: 20000,
  })
  if (ran.exitCode !== 0) throw new Error(ran.stderr.slice(0, 200))
  const parsed = JSON.parse(ran.stdout || '{}') as { entries?: RawEntry[] | RawEntry; paths?: string[] | string }
  const raw = parsed.entries === undefined ? [] : Array.isArray(parsed.entries) ? parsed.entries : [parsed.entries]
  const paths = parsed.paths === undefined ? [] : Array.isArray(parsed.paths) ? parsed.paths : [parsed.paths]
  const thread = buildThread(raw)
  const lastUser = [...thread].reverse().find(message => message.role === 'user')
  const lastAssistant = [...thread].reverse().find(message => message.role === 'assistant')
  return { user: lastUser?.text ?? null, assistant: lastAssistant?.text ?? null, thread, paths }
}

const buildSummaryPrompt = (messages: LastMessages) => {
  const user = (messages.user ?? '(aucun)').slice(0, MESSAGE_MAX_CHARS)
  const assistant = (messages.assistant ?? '(aucune)').slice(0, REPLY_FOR_SUMMARY_MAX_CHARS)
  return `Dernier message de l'utilisateur :\n${user}\n\nDernière réponse de Claude :\n${assistant}`
}

const SUMMARY_SYSTEM =
  "Tu lis le dernier échange entre un développeur et Claude. Réponds uniquement par un objet JSON, sans texte autour, avec trois champs. \"type\" : \"Q\" si Claude pose une question, propose des options ou attend une validation ou une réponse du développeur, \"E\" uniquement si la suite arrivera toute seule, sans que le développeur ait rien à faire ni à transmettre : Claude surveille lui-même une revue de PR, une CI, un déploiement, une tâche en arrière-plan ou une boucle qu'il a lancée, et reviendra de lui-même. Si la suite demande une action humaine (du développeur, ou d'une autre personne que le développeur doit prévenir ou relancer, comme lancer un outil, fusionner, tester, répondre), ce n'est jamais \"E\" : c'est \"Q\". \"L\" s'il a seulement livré ou constaté quelque chose sans rien demander ni attendre. \"attend\" : une phrase de 20 mots maximum, ce que Claude attend du développeur, ou ce qu'il vient de livrer. \"clair\" : la dernière réponse de Claude reformulée en français simple pour quelqu'un de pressé et fatigué, en Markdown, 3 à 8 lignes : phrases courtes, aucun jargon, une idée par ligne, listes à puces pour les éléments parallèles, options numérotées si Claude en propose, et termine par la question posée en gras s'il y en a une. Garde tous les faits et chiffres importants, n'invente rien, n'ajoute aucun avis. Reprends tels quels les liens, numéros de ticket ou de PR et noms de fichier. Pas de tiret cadratin."

type SummaryParts = { awaiting: string; text: string; kind?: SummaryKind; plain?: string; thread?: ThreadMessage[]; repos?: string[] }

const parentOf = (path: string) => {
  const trimmed = path.replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  return cut > 2 ? trimmed.slice(0, cut) : null
}

const toWindowsPath = (path: string) => path.replace(/^\/([a-zA-Z])\//, (match, drive: string) => `${drive.toUpperCase()}:/`)

const gitRootOf = async ($: EngineInterface, rawPath: string, cwd: string) => {
  const path = toWindowsPath(rawPath)
  const isAbsolute = /^[A-Za-z]:[\\/]/.test(path)
  let current: string | null = (isAbsolute ? path : `${cwd}\\${path}`).replace(/\//g, '\\')
  for (let depth = 0; current !== null && depth < GIT_ROOT_MAX_DEPTH; depth++) {
    const hasGit = await $.fs.exists(`${current}\\.git`)
    if (hasGit) return current
    current = parentOf(current)
  }
  return null
}

const touchedRepos = async ($: EngineInterface, cwd: string, paths: string[]) => {
  const cwdRoot = cwd.length > 0 ? await gitRootOf($, cwd, cwd) : null
  if (cwdRoot !== null) return [cwdRoot]
  const repos: string[] = []
  for (const path of paths) {
    const root = await gitRootOf($, path, cwd)
    const isKnown = root === null || repos.some(repo => repo.toLowerCase() === root.toLowerCase())
    if (!isKnown) repos.push(root as string)
    if (repos.length >= TOUCHED_REPOS_MAX) break
  }
  return repos
}

const cwdOf = async ($: EngineInterface, engineId: string) => {
  const rows = await read($, list)
  const row = rows.find(candidate => candidate.engineId === engineId)
  if (row !== undefined) return row.cwd
  const live = await readAll($)
  return live[engineId]?.cwd ?? ''
}

const parseSummaryJson = (reply: string): { awaiting: string; kind?: SummaryKind; plain?: string } | null => {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const data = JSON.parse(reply.slice(start, end + 1)) as Record<string, unknown>
    const type = typeof data.type === 'string' ? data.type.trim().toUpperCase() : ''
    const kind: SummaryKind | undefined = type === 'Q' ? 'question' : type === 'L' ? 'delivered' : type === 'E' ? 'external' : undefined
    const attend = typeof data.attend === 'string' ? data.attend.trim().replace(/^["«\s]+|["»\s.]+$/g, '') : ''
    const plain = typeof data.clair === 'string' && data.clair.trim().length > 0 ? data.clair.trim() : undefined
    return { awaiting: endSentence(attend), kind, plain }
  } catch {
    return null
  }
}

const firstLineOf = (text: string) => {
  const line = text.split(/\r?\n/).find(candidate => candidate.trim().length > 0) ?? ''
  return line.replace(/^[-*#>\s]+/, '').replace(/\*\*/g, '').slice(0, 160)
}

const endSentence = (line: string) => {
  if (line.length === 0) return ''
  return /[?!]$/.test(line) ? line : `${line}.`
}

const parseAwaiting = (reply: string): { awaiting: string; kind?: SummaryKind } => {
  const raw = firstLineOf(reply)
  const prefix = raw.match(/^\s*([QLE])\s*:\s*/i)
  const letter = prefix === null ? '' : prefix[1].toUpperCase()
  const kind: SummaryKind | undefined = letter === 'Q' ? 'question' : letter === 'L' ? 'delivered' : letter === 'E' ? 'external' : undefined
  const body = prefix === null ? raw : raw.slice(prefix[0].length)
  const line = body.replace(/^["«\s]+|["»\s.]+$/g, '')
  const awaiting = endSentence(line)
  return { awaiting, kind }
}

const readSharedSummaries = async ($: EngineInterface): Promise<Record<string, RowSummary>> => {
  const stored = await $.store.get(SUMMARIES_STORE_KEY)
  return (stored ?? {}) as Record<string, RowSummary>
}

const trimToStoreBudget = (shared: Record<string, RowSummary>, keepId: string) => {
  const oldestFirst = Object.keys(shared).filter(key => key !== keepId)
  let size = JSON.stringify(shared).length
  while (size > SUMMARIES_MAX_BYTES && oldestFirst.length > 0) {
    const dropped = oldestFirst.shift() as string
    delete shared[dropped]
    size = JSON.stringify(shared).length
  }
}

const rememberSummary = async ($: EngineInterface, engineId: string, entry: RowSummary) => {
  await update($, summaries, current => ({ ...current, [engineId]: entry }))
  if (entry.isLoading) return
  const shared = await readSharedSummaries($)
  shared[engineId] = entry
  const keys = Object.keys(shared)
  const overflow = keys.slice(0, Math.max(0, keys.length - SUMMARIES_MAX))
  for (const key of overflow) delete shared[key]
  trimToStoreBudget(shared, engineId)
  await $.store.set(SUMMARIES_STORE_KEY, shared)
}

const produceSummary = async ($: EngineInterface, row: SummaryTarget): Promise<SummaryParts> => {
  try {
    const path = await findTranscript($, row.engineId)
    if (path === null) throw new Error('transcript introuvable')
    const messages = await readLastMessages($, path)
    const text = (messages.assistant ?? '').trim()
    const prompt = buildSummaryPrompt(messages)
    const reply = await $.model.complete({ model: SUMMARY_MODEL, prompt, system: SUMMARY_SYSTEM, maxTokens: 900, effort: 'low' })
    const thread = messages.thread
    const cwd = await cwdOf($, row.engineId)
    const repos = await touchedRepos($, cwd, messages.paths)
    if (!reply.isAnswered) return { awaiting: `Résumé indisponible (${reply.reason})`, text, thread, repos }
    const structured = parseSummaryJson(reply.text)
    const parsed = structured ?? parseAwaiting(reply.text)
    const plain = structured?.plain
    return { awaiting: parsed.awaiting || firstLineOf(text), text, kind: parsed.kind, plain, thread, repos }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const text = `Résumé indisponible : ${reason}`
    return { awaiting: text, text }
  }
}

const ensureSummary = async ($: EngineInterface, row: ConversationRow) => {
  const local = await read($, summaries)
  const known = local[row.engineId]
  if (known !== undefined && known.updatedAt === row.updatedAt) return
  const shared = await readSharedSummaries($)
  const remembered = shared[row.engineId]
  if (remembered !== undefined && remembered.updatedAt === row.updatedAt && !remembered.isLoading) {
    await update($, summaries, current => ({ ...current, [row.engineId]: remembered }))
    return
  }
  await regenerateSummary($, row)
}

type SummaryTarget = Pick<ConversationRow, 'engineId' | 'updatedAt'>

const regenerateSummary = async ($: EngineInterface, row: SummaryTarget) => {
  await rememberSummary($, row.engineId, { updatedAt: row.updatedAt, text: '', isLoading: true })
  const parts = await produceSummary($, row)
  await rememberSummary($, row.engineId, { updatedAt: row.updatedAt, text: parts.text, awaiting: parts.awaiting, kind: parts.kind, plain: parts.plain, thread: parts.thread, repos: parts.repos, isLoading: false })
}

const summarizeOwnTurn = ($: EngineInterface, entry: SessionEntry) => {
  const target: SummaryTarget = { engineId: entry.id, updatedAt: entry.updatedAt }
  $.clock.after(OWN_SUMMARY_DELAY_MS, async () => {
    await regenerateSummary($, target)
    await refresh($)
  })
}

const collapseRow = ($: EngineInterface, engineId: string) =>
  update($, expanded, current => current.filter(id => id !== engineId))

const toggleExpanded = async ($: EngineInterface, row: ConversationRow) => {
  const current = await read($, expanded)
  if (current.includes(row.engineId)) {
    await collapseRow($, row.engineId)
    return
  }
  await update($, expanded, list => [...list, row.engineId])
  await ensureSummary($, row)
}

const formatAge = (updatedAt: number, now: number) => {
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h`
  const days = Math.round(hours / 24)
  return `${days} j`
}

const formatCwd = (cwd: string) => {
  const parts = cwd.split(/[\\/]/)
  const last = parts.filter(Boolean).at(-1)
  return last ?? cwd
}

const pageDir = ($: EngineInterface) => $.plugin.root.replace(/[\\/][^\\/]+$/, '')

const readPageTemplate = ($: EngineInterface) => $.fs.read(`${$.plugin.root}/assets/${PAGE_FILE}`)

const versionOf = (text: string) => {
  let hash = 0
  for (let index = 0; index < text.length; index++) hash = (hash * 31 + text.charCodeAt(index)) | 0
  return String(hash >>> 0)
}

const writePage = async ($: EngineInterface, payload: string, template: string, version: string) => {
  const seed = `<script>window.__PAGE_VERSION__ = ${JSON.stringify(version)}; window.__CONVERSATIONS__ = ${payload};</script>`
  const page = template.replace(SEED_MARKER, () => seed)
  await $.fs.write(`${pageDir($)}/${PAGE_FILE}`, page)
}

const writeDataFile = async ($: EngineInterface, rows: ConversationRow[], shared: Record<string, RowSummary>, stats: Record<string, StoredStats>) => {
  const shown = rows.filter(row => row.status !== 'archived')
  const exported = shown.map(row => ({
    hostId: row.hostId,
    engineId: row.engineId,
    title: row.title,
    cwd: row.cwd,
    status: row.status,
    tool: row.tool,
    updatedAt: row.updatedAt,
    isLive: row.isLive,
    summary: shared[row.engineId],
    park: row.park,
    stats: rowStatsOf(stats[row.engineId]),
  }))
  const template = await readPageTemplate($)
  const pageVersion = versionOf(template)
  const exportedJson = JSON.stringify(exported)
  const folders = await knownFoldersOf($, shown)
  const json = `${pageVersion}:${exportedJson}:${folders.join('|')}`
  if (json === lastDataJson) return
  lastDataJson = json
  const payload = JSON.stringify({ generatedAt: Date.now(), pageVersion, rows: exported, folders })
  await $.fs.write(`${pageDir($)}/${DATA_FILE}`, `window.__CONVERSATIONS__ = ${payload};`)
  await writePage($, payload, template, pageVersion)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    ownEngineId = await $.session.id()
    await $.command.register({
      name: 'sessions',
      description: 'Ouvre le panneau des conversations et de leur statut',
    })
    await loadFilters($)
    await declareOwnStart($, e.cwd)
    await refresh($)
    void $.ui.open({ id: PANE, title: 'Conversations' })
    $.clock.every(REFRESH_MS, () => refresh($))
    $.clock.every(MAILBOX_POLL_MS, () => collectOwnMail($))
    void startServer($)
    $.clock.every(SERVER_RETRY_MS, () => startServer($))
    void refreshStats($)

    return next(e)
  })

  on('command.run', { command: 'sessions' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Conversations' })

    return { text: 'Panneau des conversations ouvert.' }
  })

  on('turn.start', async ($, e, next) => {
    const prompt = e.text.slice(0, PROMPT_MAX_CHARS)
    await writeOwn($, { status: 'working', prompt })

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const stream = next(e)
    for await (const chunk of stream) {
      if (chunk.kind === 'thinking' && ownPhase !== 'thinking') await writeOwn($, { status: 'thinking' })
      if (chunk.kind === 'text' && ownPhase !== 'writing') await writeOwn($, { status: 'writing' })
      yield chunk
    }

    return stream.result
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'ask' && e.tool_use_id !== undefined) {
      await writeOwn($, { status: 'permission' })
    }

    return verdict
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) await writeOwn($, { status: 'tool', tool: e.tool })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const status: SessionStatus =
        e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'aborted' : 'error'
      const entry = await writeOwn($, { status })
      if (status === 'done') summarizeOwnTurn($, entry)
      void refreshStats($)
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await removeOwn($, e.sessionId)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input, Markdown } = $.ui.resolve(e)
    const rows = await read($, list)
    const visible = await read($, filters)
    const expandedIds = await read($, expanded)
    const known = await read($, summaries)
    const now = Date.now()

    const countOf = (section: Section) => rows.filter(row => section.statuses.includes(row.status)).length

    const renderChip = (section: Section) => {
      const isOn = visible[section.id]
      return (
        <Box
          key={`chip-${section.id}`}
          borderStyle="round"
          borderColor={isOn ? section.hex : undefined}
          borderDimColor={!isOn}
          paddingX={1}
          hover={{ borderColor: HOVER_HEX }}
        >
          <Button plain dimColor={!isOn} onPress={() => toggleFilter($, section.id)}>
            {`${section.emoji} ${section.title} ${countOf(section)}`}
          </Button>
        </Box>
      )
    }

    const renderHeader = () => (
      <Box flexDirection="row" gap={1} alignItems="center" marginBottom={1} flexWrap="wrap">
        {SECTIONS.map(renderChip)}
      </Box>
    )

    const awaitingOf = (entry: RowSummary) => entry.awaiting ?? firstLineOf(entry.text)

    const renderSummaryText = (row: ConversationRow) => {
      const entry = known[row.engineId]
      if (entry === undefined || entry.isLoading) return <Text dimColor>🧠 Résumé en cours…</Text>
      const isStale = entry.updatedAt !== row.updatedAt
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold dimColor={isStale}>👉 {awaitingOf(entry)}</Text>
          <Text dimColor>{entry.plain !== undefined ? 'En clair :' : 'Réponse de Claude :'}</Text>
          <Markdown text={entry.plain ?? entry.text} dimColor={isStale} />
        </Box>
      )
    }

    const renderCollapsedSummary = (row: ConversationRow) => {
      if (row.park !== undefined) {
        const parkLabel = row.park.kind === 'blocked' ? '🚫 Bloquée' : '⏸️ Plus tard'
        const parkReason = row.park.reason.length > 0 ? ` : ${row.park.reason}` : ''
        const moved = row.park.hasMoved ? ' · a bougé' : ''
        return (
          <Box paddingLeft={3}>
            <Text color={row.park.kind === 'blocked' ? '#d1242f' : undefined} dimColor={row.park.kind === 'later'} wrap="truncate">{`${parkLabel}${parkReason}${moved}`}</Text>
          </Box>
        )
      }
      if (row.status !== 'external' && sectionOf(row.status).id === 'working') return null
      const entry = known[row.engineId]
      if (entry === undefined || entry.isLoading) return null
      const awaiting = awaitingOf(entry)
      if (awaiting.length === 0) return null
      const isStale = entry.updatedAt !== row.updatedAt
      return (
        <Box paddingLeft={3}>
          <Text dimColor={isStale} wrap="truncate">👉 {awaiting}</Text>
        </Box>
      )
    }

    const renderDetails = (row: ConversationRow) => {
      const isArchived = row.status === 'archived'
      const canReply = !row.isCurrent && row.isLive
      return (
        <Box flexDirection="column" gap={1} marginTop={1} paddingLeft={3}>
          {renderSummaryText(row)}
          {!row.isLive && !isArchived && (
            <Text dimColor>Conversation fermée : « Ouvrir » la relance, la réponse redevient possible ensuite.</Text>
          )}
          {canReply && (
            <Input
              key={`reply-${row.engineId}`}
              placeholder={`Répondre à « ${row.title} »…`}
              submitLabel="Envoyer"
              autoFocus
              onSubmit={value => sendReply($, row, value)}
            />
          )}
          <Box flexDirection="row" gap={1}>
            {!row.isCurrent && !isArchived && row.hostId !== null && (
              <Button variant="secondary" onPress={() => openConversation($, row.hostId as string)}>
                Ouvrir
              </Button>
            )}
            <Button variant="secondary" onPress={() => regenerateSummary($, row)}>
              Rafraîchir le résumé
            </Button>
            <Button variant="secondary" onPress={() => collapseRow($, row.engineId)}>
              Replier
            </Button>
          </Box>
        </Box>
      )
    }

    const renderActions = (row: ConversationRow) => {
      const canAct = !row.isCurrent
      const isArchived = row.status === 'archived'
      const isWaiting = WAITING_STATUSES.includes(row.status)
      const isSeen = row.status === 'seen'
      const isParked = row.park !== undefined
      return (
        <Box flexDirection="row" gap={1}>
          {isParked && (
            <Button plain onPress={() => unparkConversation($, row)}>
              Reprendre
            </Button>
          )}
          {isWaiting && (
            <Button plain onPress={() => setSeen($, row, true)}>
              Vu
            </Button>
          )}
          {isSeen && (
            <Button plain onPress={() => setSeen($, row, false)}>
              À traiter
            </Button>
          )}
          {canAct && !isArchived && row.hostId !== null && (
            <Button plain onPress={() => openConversation($, row.hostId as string)}>
              Ouvrir
            </Button>
          )}
          {canAct && !isArchived && row.hostId !== null && (
            <Button plain dimColor onPress={() => archiveConversation($, row)}>
              Archiver
            </Button>
          )}
          {isArchived && row.hostId !== null && (
            <Button plain onPress={() => unarchiveConversation($, row)}>
              Restaurer
            </Button>
          )}
        </Box>
      )
    }

    const renderCard = (row: ConversationRow) => {
      const style = styleOf(row)
      const isExpanded = expandedIds.includes(row.engineId)
      const isFaded = !row.isLive
      return (
        <Box
          key={row.engineId}
          flexDirection="column"
          borderStyle="round"
          borderColor={style.hex}
          borderDimColor={isFaded}
          paddingX={1}
          hover={{ borderColor: HOVER_HEX }}
        >
          <Box flexDirection="row" gap={1} alignItems="center">
            <Button plain onPress={() => toggleExpanded($, row)}>
              {isExpanded ? '▾' : '▸'}
            </Button>
            <Button plain onPress={() => toggleExpanded($, row)}>
              {`${style.emoji} ${row.title}`}
            </Button>
            {row.isCurrent && <Text dimColor>ici</Text>}
          </Box>
          <Box flexDirection="row" gap={1} alignItems="center" justifyContent="space-between">
            <Text dimColor>
              {style.label} · {formatCwd(row.cwd)} · {formatAge(row.updatedAt, now)}
            </Text>
            {renderActions(row)}
          </Box>
          {!isExpanded && renderCollapsedSummary(row)}
          {isExpanded && renderDetails(row)}
        </Box>
      )
    }

    const renderSection = (section: Section) => {
      if (!visible[section.id]) return null
      const sectionRows = rows.filter(row => section.statuses.includes(row.status))
      if (sectionRows.length === 0) return null
      return (
        <Box flexDirection="column" marginBottom={1} key={section.id}>
          <Box flexDirection="row" gap={1}>
            <Text color={section.hex} bold>
              {section.emoji} {section.title}
            </Text>
            <Text dimColor>{sectionRows.length}</Text>
          </Box>
          {sectionRows.map(renderCard)}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" paddingX={1}>
        {renderHeader()}
        {rows.length === 0 && <Text dimColor>Aucune conversation connue.</Text>}
        {SECTIONS.map(renderSection)}
      </Box>
    )
  })
}
