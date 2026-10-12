// Every part of the mod that calls the engine lives in this file: the engine
// follows `$` only into functions of the module it loaded, never across an
// import. What needs no `$` (rows, sections, summary text, page data, the
// pane's tree) lives in its own module, with its tests.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { decisionFor, describePermission, isIslandAsk, verdictFor } from './permission-text.mjs'
import { pushStep, stepOf } from './activity.mjs'
import { exportRows, seedScriptOf, ticketTemplateOf, versionOf } from './page-data.mts'
import { paneTree } from './pane.tsx'
import { buildRows, mergeSummaries } from './rows.mts'
import type { Acks, Parked } from './rows.mts'
import {
  ancestorsOf,
  buildSummaryPrompt,
  buildTailScript,
  firstLineOf,
  lastMessagesOf,
  parseAwaiting,
  parseSummaryJson,
  REPLY_PREAMBLE,
  SUMMARY_SYSTEM,
} from './summary-text.mts'
import type { LastMessages } from './summary-text.mts'

import type {
  ConversationRow,
  HostSession,
  RowSummary,
  StoredStats,
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
const TOUCHED_REPOS_MAX = 6
const GIT_ROOT_MAX_DEPTH = 10
const SUMMARIES_MAX_BYTES = 3 * 1024 * 1024
const SUMMARY_MODEL = 'haiku'
const SUMMARIES_MAX = 25
const OWN_SUMMARY_DELAY_MS = 2500
const SERVER_SCRIPT = 'assets/server.mjs'
const SERVER_PORT = 48123
const SERVER_RETRY_MS = 15000
const ARCHIVE_TOOL = 'mcp__ccd_session_mgmt__archive_session'
const UNARCHIVE_TOOL = 'mcp__ccd_session_mgmt__unarchive_session'
// Claude Desktop's own session tools, called by name: not in the MCP types of a terminal session.
type HostTool = `mcp__${string}__${string}`
const DEFAULT_FILTERS: SectionFilters = { waiting: true, working: true, others: true, archived: false }

const list = atom({ plugin: 'sessions', key: 'list' } as const, [])
const filters = atom({ plugin: 'sessions', key: 'filters' } as const, DEFAULT_FILTERS)
const expanded = atom({ plugin: 'sessions', key: 'expanded' } as const, [])
const summaries = atom({ plugin: 'sessions', key: 'summaries' } as const, {})

let ownEngineId = ''
let ownPhase: SessionStatus | null = null
let lastDataJson = ''
// The ticket link of the mod's options; changing it reloads the module.
let ticketTemplate: string | null = null
let isServing = false
let isStartingServer = false
let isCountingStats = false
let repoFolders: string[] = []
let repoFoldersReadAt = 0
const SEED_MARKER = '<!--SEED-->'
const INDEX_FILE = 'session-index.json'
const transcriptCache = new Map<string, string>()

// Bridge to the cockpit app: when the app runs, this conversation talks to it
// over HTTP instead of starting its own server.
type AppLink = { port: number; secret: string; proof: string; dataDir: string }
type BridgeOrder = BridgeMessage & { orderId: string }
type BridgeReply = { status: number; body: { role?: string; bridgeId?: string; proof?: string; orders?: BridgeOrder[]; requestId?: string; decision?: string | null } | null }
type JoinOutcome = 'joined' | 'unreachable' | 'refused'
const APP_LINK_PROTOCOL = 1
const ORDERS_WAIT_MS = 20000
// Like coucou: the island answers within this time, or the request goes back to Claude.
const PERMISSION_DEADLINE_MS = 110000
// In Claude Desktop nothing shows that the conversation waits for the island: its own dialog comes sooner.
const DESKTOP_HOLD_MS = 30000
const MIN_WAIT_SLICE_MS = 1000
const PERMISSION_WAIT_MS = 20000
const RECONNECT_MS = 1000
const MAX_HANDLED_ORDERS = 500
const LINK_SECRET_PATTERN = /^[0-9a-f]{64}$/
const MOD_VERSION = '0.2.0'
const MAX_PORT = 65535
const EXIT_APP_TOOK_OVER = 4
const ORDER_TYPES = new Set(['reply', 'park', 'unpark', 'ack', 'summarize'])
let mode: 'none' | 'local' | 'app' = 'none'
let appLink: AppLink | null = null
let isConnecting = false
let hasWarnedVersion = false
const handledOrders = new Set<string>()

// The page, its data and the session index live with the app when it runs.
const dataDirOf = ($: EngineInterface) => appLink?.dataDir ?? pageDir($)

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

type SessionIndexFile = { live?: string[]; hosts?: HostSession[] }
type SessionIndex = { mtimeMs: number; hosts: HostSession[]; liveEngineIds: Set<string> }

const EMPTY_INDEX: SessionIndex = { mtimeMs: 0, hosts: [], liveEngineIds: new Set() }
let sessionIndex: SessionIndex = EMPTY_INDEX

const parseSessionIndex = (text: string, mtimeMs: number): SessionIndex => {
  const data = JSON.parse(text) as SessionIndexFile
  const hosts = data.hosts ?? []
  const liveEngineIds = new Set(data.live ?? [])
  return { mtimeMs, hosts, liveEngineIds }
}

const readSessionIndex = async ($: EngineInterface): Promise<SessionIndex> => {
  const file = `${dataDirOf($)}/${INDEX_FILE}`
  try {
    const stat = await $.fs.stat(file)
    if (stat.mtimeMs === sessionIndex.mtimeMs) return sessionIndex
    const text = await $.fs.read(file)
    sessionIndex = parseSessionIndex(text, stat.mtimeMs)
  } catch {
    return sessionIndex
  }
  return sessionIndex
}

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

const refresh = async ($: EngineInterface) => {
  const { hosts } = await readSessionIndex($)
  const liveEngineIds = new Set(
    Object.entries(live).filter(([_, entry]) => 
      ACTIVE_STATUSES.includes(entry.status)
    ).map(([id]) => id)
  )
  const rows = buildRows({ live, hosts, liveEngineIds, acks, shared, parked, ownEngineId })
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

const callHostTool = async ($: EngineInterface, tool: HostTool, args: Record<string, unknown>, okText: string) => {
  try {
    const ran = await $.tool.call({ tool, ...args })
    if (ran.deny !== undefined) {
      $.ui.toast(`Refusé : ${ran.deny.slice(0, 120)}`)
    } else if (ran.isError === true) {
      $.ui.toast(`Échec : ${(ran.text ?? '').slice(0, 120)}`)
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

// Without the app, the conversation that gets the port runs the server itself.
const startServer = async ($: EngineInterface) => {
  if (mode !== 'none' || isStartingServer) return
  isStartingServer = true
  mode = 'local'
  const script = `${$.plugin.root}/${SERVER_SCRIPT}`
  try {
    const stream = $.process.spawn({ argv: ['node', script, pageDir($), String(SERVER_PORT)] })
    const ended = await consumeBridge($, stream)
    if (ended.code === EXIT_APP_TOOK_OVER) $.clock.after(RECONNECT_MS, () => connect($))
    else if (ended.code !== 0 && ended.code !== 3) {
      $.ui.log(`sessions: serveur cockpit arrêté (code ${ended.code})`, { to: 'debug' })
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    $.ui.log(`sessions: serveur cockpit non démarré (${reason})`, { to: 'debug' })
  }
  if (mode === 'local') {
    mode = 'none'
    isServing = false
  }
  isStartingServer = false
}

const appFolder = async ($: EngineInterface) => {
  const localAppData = await $.env.get('LOCALAPPDATA')
  return localAppData === undefined ? null : `${localAppData}/claude-cockpit`
}

const isUsableLink = (link: Partial<AppLink> & { protocol?: number }) =>
  link.protocol === APP_LINK_PROTOCOL &&
  Number.isInteger(link.port) && (link.port as number) > 0 && (link.port as number) <= MAX_PORT &&
  typeof link.secret === 'string' && LINK_SECRET_PATTERN.test(link.secret) &&
  typeof link.proof === 'string' && LINK_SECRET_PATTERN.test(link.proof)

// The running app's link, or null: no file (the app is not running) is the
// normal case, and so is a file this mod cannot use. The data folder is always
// the one next to the link, whatever the file says.
const readAppLink = async ($: EngineInterface): Promise<AppLink | null> => {
  try {
    const folder = await appFolder($)
    if (folder === null) return null
    const file = `${folder}/link.json`
    if (!(await $.fs.exists(file))) return null
    const link = JSON.parse(await $.fs.read(file)) as Partial<AppLink> & { protocol?: number }
    if (!isUsableLink(link)) return null
    return { port: link.port as number, secret: link.secret as string, proof: link.proof as string, dataDir: `${folder}/data` }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    $.ui.log(`sessions: lien vers l'app illisible (${reason})`, { to: 'debug' })
    return null
  }
}

const bridgeRequest = async ($: EngineInterface, link: AppLink, method: 'GET' | 'POST', route: string, body?: object): Promise<BridgeReply | null> => {
  const headers: Record<string, string> = { authorization: `Bearer ${link.secret}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  try {
    const response = await $.http.fetch(`http://127.0.0.1:${link.port}/bridge/v1${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, body: response.text ? JSON.parse(response.text) : null }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    $.ui.log(`sessions: app du cockpit injoignable (${reason})`, { to: 'debug' })
    return null
  }
}

// The hub writes the page; a conversation that becomes hub writes it afresh.
const applyRole = (role: unknown) => {
  const isHub = role === 'hub'
  if (isHub && !isServing) lastDataJson = ''
  isServing = isHub
}

const handleOrder = async ($: EngineInterface, order: BridgeOrder) => {
  if (handledOrders.has(order.orderId) || !ORDER_TYPES.has(order.type)) return
  handledOrders.add(order.orderId)
  if (handledOrders.size > MAX_HANDLED_ORDERS) handledOrders.delete(handledOrders.values().next().value as string)
  try {
    await handleBridgeMessage($, order)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    $.ui.log(`sessions: ordre de l'app non exécuté (${reason})`, { to: 'debug' })
  }
}

const followOrders = async ($: EngineInterface, link: AppLink, bridgeId: string) => {
  const route = `/orders?bridgeId=${encodeURIComponent(bridgeId)}&wait=${ORDERS_WAIT_MS}`
  for (;;) {
    const polled = await bridgeRequest($, link, 'GET', route)
    if (polled === null || polled.status !== 200 || polled.body === null) return
    applyRole(polled.body.role)
    const orders = Array.isArray(polled.body.orders) ? polled.body.orders : []
    // Acknowledged before they run: an order is carried out at most once, never twice.
    if (orders.length > 0) await bridgeRequest($, link, 'POST', '/ack', { bridgeId, orderIds: orders.map(order => order.orderId) })
    for (const order of orders) await handleOrder($, order)
  }
}

// 'unreachable': nothing usable answers, run the server locally. 'refused':
// the app answers but will not take this conversation, so no local server.
const joinApp = async ($: EngineInterface, link: AppLink): Promise<JoinOutcome> => {
  const hello = await bridgeRequest($, link, 'POST', '/hello', { protocol: APP_LINK_PROTOCOL, engineId: ownEngineId, modVersion: MOD_VERSION })
  if (hello === null) return 'unreachable'
  if (hello.status === 426) {
    if (!hasWarnedVersion) $.ui.toast('Cockpit : le mod et l’app ne sont pas à la même version, redémarre Claude Desktop')
    hasWarnedVersion = true
    return 'refused'
  }
  const bridgeId = hello.body?.bridgeId
  if (hello.status !== 200 || typeof bridgeId !== 'string') return 'refused'
  if (hello.body?.proof !== link.proof) {
    $.ui.log('sessions: le port du cockpit répond sans la preuve de l’app, ordres ignorés', { to: 'debug' })
    return 'unreachable'
  }
  mode = 'app'
  appLink = link
  applyRole(hello.body?.role)
  void followOrders($, link, bridgeId).finally(() => {
    mode = 'none'
    appLink = null
    isServing = false
    $.clock.after(RECONNECT_MS, () => connect($))
  })
  return 'joined'
}

// Joins the app when it runs, else runs the server locally. A local server
// steps aside by itself (exit code 4) once the app answers.
// The permission request this conversation has open on the island, if any.
let openPermission: string | null = null
// Claude Desktop decides permission asks itself (no PermissionRequest hook): the island answers at tool.check there.
let isDesktopSession = false

const withdrawPermission = async ($: EngineInterface) => {
  const requestId = openPermission
  const link = appLink
  openPermission = null
  if (requestId !== null && link !== null) await bridgeRequest($, link, 'POST', '/permission/withdraw', { requestId })
}

// Waits for the island's choice; null when the deadline passes, the request
// disappears or another answer came first (`isSettled`).
const waitIslandChoice = async ($: EngineInterface, link: AppLink, requestId: string, holdMs: number, isSettled: () => boolean) => {
  const deadline = Date.now() + holdMs
  while (!isSettled() && Date.now() < deadline) {
    const slice = Math.max(MIN_WAIT_SLICE_MS, Math.min(PERMISSION_WAIT_MS, deadline - Date.now()))
    const route = `/permission/wait?requestId=${encodeURIComponent(requestId)}&wait=${slice}`
    const waited = await bridgeRequest($, link, 'GET', route)
    if (waited === null || waited.status !== 200) return null
    const choice = waited.body?.decision
    if (choice === 'gone') return null
    if (typeof choice === 'string') return choice
  }
  return null
}

const askIsland = async ($: EngineInterface, link: AppLink, toolName: string, input: unknown, canAlways: boolean, holdMs: number) => {
  const described = describePermission(toolName, input)
  const asked = await bridgeRequest($, link, 'POST', '/permission/ask', { engineId: ownEngineId, ...described, canAlways, holdMs })
  const requestId = asked?.status === 200 ? asked.body?.requestId : undefined
  return typeof requestId === 'string' ? requestId : null
}

const connect = async ($: EngineInterface) => {
  if (isConnecting || mode !== 'none') return
  isConnecting = true
  try {
    const link = await readAppLink($)
    const outcome = link === null ? 'unreachable' : await joinApp($, link)
    if (outcome === 'unreachable') void startServer($)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    $.ui.log(`sessions: liaison avec l'app impossible (${reason})`, { to: 'debug' })
    void startServer($)
  } finally {
    isConnecting = false
  }
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

const readLastMessages = async ($: EngineInterface, path: string): Promise<LastMessages> => {
  const script = buildTailScript(path)
  const ran = await $.process.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', script], {
    timeoutMs: 20000,
  })
  if (ran.exitCode !== 0) throw new Error(ran.stderr.slice(0, 200))
  return lastMessagesOf(ran.stdout)
}

type SummaryParts = { awaiting: string; text: string; kind?: SummaryKind; plain?: string; thread?: ThreadMessage[]; repos?: string[] }

const gitRootOf = async ($: EngineInterface, rawPath: string, cwd: string) => {
  for (const folder of ancestorsOf(rawPath, cwd, GIT_ROOT_MAX_DEPTH)) {
    const hasGit = await $.fs.exists(`${folder}\\.git`)
    if (hasGit) return folder
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

const pageDir = ($: EngineInterface) => $.plugin.root.replace(/[\\/][^\\/]+$/, '')

const readPageTemplate = ($: EngineInterface) => $.fs.read(`${$.plugin.root}/assets/${PAGE_FILE}`)

const PAGE_ASSETS = ['identity.js', 'dock.js', 'liquid-paper/theme.css', 'liquid-paper/bundle.css', 'liquid-paper/bundle.js']

let pageAssets: string | null = null

const readPageAssets = async ($: EngineInterface) => {
  if (pageAssets !== null) return pageAssets
  const reads = PAGE_ASSETS.map(name => $.fs.read(`${$.plugin.root}/assets/${name}`).catch(() => ''))
  const contents = await Promise.all(reads)
  pageAssets = contents.join('\n')
  return pageAssets
}

const writePage = async ($: EngineInterface, payload: string, template: string, version: string) => {
  const seed = seedScriptOf(version, payload)
  const page = template.replace(SEED_MARKER, () => seed)
  await $.fs.write(`${dataDirOf($)}/${PAGE_FILE}`, page)
}

const writeDataFile = async ($: EngineInterface, rows: ConversationRow[], shared: Record<string, RowSummary>, stats: Record<string, StoredStats>) => {
  const shown = rows.filter(row => row.status !== 'archived')
  const exported = exportRows(shown, shared, stats)
  const template = await readPageTemplate($)
  const assets = await readPageAssets($)
  const versionSource = `${template}\n${assets}`
  const pageVersion = versionOf(versionSource)
  const exportedJson = JSON.stringify(exported)
  const folders = await knownFoldersOf($, shown)
  const json = `${pageVersion}:${exportedJson}:${folders.join('|')}:${ticketTemplate ?? ''}`
  if (json === lastDataJson) return
  lastDataJson = json
  const payload = JSON.stringify({ generatedAt: Date.now(), pageVersion, rows: exported, folders, ticketUrl: ticketTemplate })
  await $.fs.write(`${dataDirOf($)}/${DATA_FILE}`, `window.__CONVERSATIONS__ = ${payload};`)
  await writePage($, payload, template, pageVersion)
}

export const register: Register = (on, options) => {
  ticketTemplate = ticketTemplateOf(options.ticketUrl)
  on('session.start', async ($, e, next) => {
    ownEngineId = await $.session.id()
    isDesktopSession = (await $.env.get('CLAUDE_CODE_ENTRYPOINT')) === 'claude-desktop'
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
    void connect($)
    $.clock.every(SERVER_RETRY_MS, () => connect($))
    void refreshStats($)

    return next(e)
  })

  on('command.run', { command: 'sessions' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Conversations' })

    return { text: 'Panneau des conversations ouvert.' }
  })

  on('turn.start', async ($, e, next) => {
    const prompt = e.text.slice(0, PROMPT_MAX_CHARS)
    // A new turn starts a new activity feed.
    await writeOwn($, { status: 'working', prompt, steps: [] })

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
    const link = appLink
    if (!isDesktopSession || mode !== 'app' || link === null || !isIslandAsk(verdict, e)) return verdict
    // Desktop shows its own dialog only once this verdict is given: the island answers first, or hands back to it.
    const requestId = await askIsland($, link, e.tool, e.input, false, DESKTOP_HOLD_MS)
    if (requestId === null) return verdict
    openPermission = requestId
    const choice = await waitIslandChoice($, link, requestId, DESKTOP_HOLD_MS, () => false)
    if (choice === null) await withdrawPermission($)
    else openPermission = null
    return verdictFor(choice) ?? verdict
  })

  // The island answers permission requests next to the other hooks (coucou):
  // the first answer wins, and the other side is told to drop the request.
  on('classic.PermissionRequest', async ($, e, next) => {
    const link = appLink
    if (mode !== 'app' || link === null) return next(e)
    const suggestions = e.permission_suggestions
    const canAlways = Array.isArray(suggestions) && suggestions.length > 0
    const requestId = await askIsland($, link, e.tool_name, e.tool_input, canAlways, PERMISSION_DEADLINE_MS)
    if (requestId === null) return next(e)
    openPermission = requestId
    let isSettled = false
    const fromIsland = waitIslandChoice($, link, requestId, PERMISSION_DEADLINE_MS, () => isSettled)
    const fromOthers = next(e)
    const first = await Promise.race([
      fromIsland.then(choice => ({ kind: 'island' as const, choice })),
      fromOthers.then(result => ({ kind: 'others' as const, result })),
    ])
    const islandChoice = first.kind === 'island' ? first.choice : (first.result.decision === undefined ? await fromIsland : null)
    isSettled = true
    const decision = decisionFor(islandChoice, suggestions)
    if (decision === null) await withdrawPermission($)
    else openPermission = null
    if (decision !== null) return { decision }
    return first.kind === 'others' ? first.result : fromOthers
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined && openPermission !== null) await withdrawPermission($)
    if (e.agentId === undefined) {
      const current = (await readAll($))[ownEngineId]
      // The tool's arguments sit beside its name in the event (e.command, e.file_path).
      const call = e as unknown as { tool: string } & Record<string, unknown>
      await writeOwn($, { status: 'tool', tool: call.tool, steps: pushStep(current?.steps ?? [], stepOf(call.tool, call, Date.now())) })
    }

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
    const data = {
      rows: await read($, list),
      visible: await read($, filters),
      expandedIds: await read($, expanded),
      known: await read($, summaries),
      now: Date.now(),
    }
    return paneTree($.ui.resolve(e), data, {
      toggleFilter: id => toggleFilter($, id),
      toggleExpanded: row => toggleExpanded($, row),
      collapse: row => collapseRow($, row.engineId),
      regenerate: row => regenerateSummary($, row),
      reply: (row, text) => sendReply($, row, text),
      open: hostId => openConversation($, hostId),
      setSeen: (row, isSeen) => setSeen($, row, isSeen),
      unpark: row => unparkConversation($, row),
      archive: row => archiveConversation($, row),
      unarchive: row => unarchiveConversation($, row),
    })
  })
}
