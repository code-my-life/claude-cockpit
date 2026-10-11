import type { ConversationRow, RowStats, RowSummary, StoredStats } from '../types'

// What the cockpit page receives: the rows it shows and a version of its own
// code, so an open page knows when to reload. Pure.

export const rowStatsOf = (stored: StoredStats | undefined): RowStats | undefined => {
  if (stored === undefined) return undefined
  const acc = stored.acc
  return { messages: acc.messages, tools: acc.tools, files: acc.files.length, activeMs: acc.activeMs, lastAt: acc.lastAt, today: acc.today }
}

export const exportRows = (rows: ConversationRow[], shared: Record<string, RowSummary>, stats: Record<string, StoredStats>) =>
  rows.map(row => ({
    hostId: row.hostId,
    engineId: row.engineId,
    title: row.title,
    cwd: row.cwd,
    status: row.status,
    tool: row.tool,
    steps: row.steps,
    updatedAt: row.updatedAt,
    isLive: row.isLive,
    summary: shared[row.engineId],
    park: row.park,
    stats: rowStatsOf(stats[row.engineId]),
    context: row.context,
  }))

export const versionOf = (text: string) => {
  let hash = 0
  for (let index = 0; index < text.length; index++) hash = (hash * 31 + text.charCodeAt(index)) | 0
  return String(hash >>> 0)
}

const LINE_SEPARATOR = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)

// JSON safe inside a <script> element: no closing tag, no line separator.
export const inlineScriptSafe = (json: string) =>
  json
    .replace(/</g, '\\u003c')
    .split(LINE_SEPARATOR).join('\\u2028')
    .split(PARAGRAPH_SEPARATOR).join('\\u2029')

export const seedScriptOf = (version: string, payload: string) =>
  `<script>window.__PAGE_VERSION__ = ${inlineScriptSafe(JSON.stringify(version))}; window.__CONVERSATIONS__ = ${inlineScriptSafe(payload)};</script>`
