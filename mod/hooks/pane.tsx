import type { ElementTable } from 'claude-code'
import type { ConversationRow, RowSummary, SectionFilters, SectionId } from '../types'
import { HOVER_HEX, SECTIONS, sectionOf, styleOf, WAITING_STATUSES } from './sections.mts'
import type { Section } from './sections.mts'
import { firstLineOf } from './summary-text.mts'

// The Conversations pane in Claude Code, drawn from what it shows and what a
// press does: the hooks module hands both in, this file never reaches the engine.

export type PaneData = {
  rows: ConversationRow[]
  visible: SectionFilters
  expandedIds: string[]
  known: Record<string, RowSummary>
  now: number
}

export type PaneActions = {
  toggleFilter: (id: SectionId) => unknown
  toggleExpanded: (row: ConversationRow) => unknown
  collapse: (row: ConversationRow) => unknown
  regenerate: (row: ConversationRow) => unknown
  reply: (row: ConversationRow, text: string) => unknown
  open: (hostId: string) => unknown
  setSeen: (row: ConversationRow, isSeen: boolean) => unknown
  unpark: (row: ConversationRow) => unknown
  archive: (row: ConversationRow) => unknown
  unarchive: (row: ConversationRow) => unknown
}

export const formatAge = (updatedAt: number, now: number) => {
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h`
  const days = Math.round(hours / 24)
  return `${days} j`
}

export const formatCwd = (cwd: string) => {
  const parts = cwd.split(/[\\/]/)
  const last = parts.filter(Boolean).at(-1)
  return last ?? cwd
}

const awaitingOf = (entry: RowSummary) => entry.awaiting ?? firstLineOf(entry.text)

export const paneTree = (table: ElementTable, data: PaneData, act: PaneActions) => {
  const { Box, Text, Button, Markdown } = table
  // The mobile app draws no field yet: there the reply goes through the island.
  const Input = 'Input' in table ? table.Input : null
  const { rows, visible, expandedIds, known, now } = data

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
        <Button plain dimColor={!isOn} onPress={() => act.toggleFilter(section.id)}>
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
    if (sectionOf(row.status).id === 'working') return null
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
    const hostId = row.hostId
    return (
      <Box flexDirection="column" gap={1} marginTop={1} paddingLeft={3}>
        {renderSummaryText(row)}
        {!row.isLive && !isArchived && (
          <Text dimColor>Conversation fermée : « Ouvrir » la relance, la réponse redevient possible ensuite.</Text>
        )}
        {canReply && Input !== null && (
          <Input
            key={`reply-${row.engineId}`}
            placeholder={`Répondre à « ${row.title} »…`}
            submitLabel="Envoyer"
            autoFocus
            onSubmit={(value: string) => act.reply(row, value)}
          />
        )}
        <Box flexDirection="row" gap={1}>
          {!row.isCurrent && !isArchived && hostId !== null && (
            <Button variant="secondary" onPress={() => act.open(hostId)}>
              Ouvrir
            </Button>
          )}
          <Button variant="secondary" onPress={() => act.regenerate(row)}>
            Rafraîchir le résumé
          </Button>
          <Button variant="secondary" onPress={() => act.collapse(row)}>
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
    const hostId = row.hostId
    return (
      <Box flexDirection="row" gap={1}>
        {isParked && (
          <Button plain onPress={() => act.unpark(row)}>
            Reprendre
          </Button>
        )}
        {isWaiting && (
          <Button plain onPress={() => act.setSeen(row, true)}>
            Vu
          </Button>
        )}
        {isSeen && (
          <Button plain onPress={() => act.setSeen(row, false)}>
            À traiter
          </Button>
        )}
        {canAct && !isArchived && hostId !== null && (
          <Button plain onPress={() => act.open(hostId)}>
            Ouvrir
          </Button>
        )}
        {canAct && !isArchived && hostId !== null && (
          <Button plain dimColor onPress={() => act.archive(row)}>
            Archiver
          </Button>
        )}
        {isArchived && hostId !== null && (
          <Button plain onPress={() => act.unarchive(row)}>
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
          <Button plain onPress={() => act.toggleExpanded(row)}>
            {isExpanded ? '▾' : '▸'}
          </Button>
          <Button plain onPress={() => act.toggleExpanded(row)}>
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
}
