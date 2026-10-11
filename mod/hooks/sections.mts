import type { ConversationRow, RowStatus, SectionId } from '../types'

// How the panel sorts and shows a conversation: its section, its colour, its emoji.

export type Section = { id: SectionId; title: string; emoji: string; statuses: RowStatus[]; hex: string }

const WAITING: Section = { id: 'waiting', title: "T'attendent", emoji: '🙋', statuses: ['done', 'permission', 'external'], hex: '#3fb950' }
const WORKING: Section = { id: 'working', title: 'Travaillent', emoji: '⚙️', statuses: ['thinking', 'writing', 'tool', 'working'], hex: '#e3b341' }
const OTHERS: Section = { id: 'others', title: 'Autres', emoji: '💤', statuses: ['blocked', 'later', 'seen', 'opened', 'idle', 'aborted', 'error'], hex: '#8b949e' }
const ARCHIVED: Section = { id: 'archived', title: 'Fermées et archivées', emoji: '📦', statuses: ['closed', 'archived'], hex: '#6e7681' }

export const SECTIONS: Section[] = [WAITING, WORKING, OTHERS, ARCHIVED]

export type StatusStyle = { emoji: string; label: string; hex: string }

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

export const HOVER_HEX = '#58a6ff'

export const WAITING_STATUSES: RowStatus[] = ['done', 'permission', 'external']

const URGENCY: Partial<Record<RowStatus, number>> = { permission: 0, external: 2 }

export const styleOf = (row: Pick<ConversationRow, 'status' | 'tool'>): StatusStyle => {
  const base = STATUS_STYLE[row.status]
  if (row.status !== 'tool' || row.tool === undefined) return base
  const tool = row.tool
  const flavor = TOOL_FLAVORS.find(candidate => candidate.match.test(tool))
  if (flavor === undefined) return base
  return { ...base, emoji: flavor.emoji, label: flavor.label }
}

export const sectionOf = (status: RowStatus) => SECTIONS.find(section => section.statuses.includes(status)) ?? OTHERS

export const sectionRank = (status: RowStatus) => SECTIONS.indexOf(sectionOf(status))

export const urgencyOf = (status: RowStatus) => URGENCY[status] ?? 1
