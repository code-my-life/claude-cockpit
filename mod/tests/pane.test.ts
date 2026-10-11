import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import type { ConversationRow, RowSummary } from '../types'

// The Conversations pane, drawn by the engine on each surface from the mod's
// state alone: nothing here reaches the store, the app or another conversation.

const PANE = { plugin: 'sessions', component: 'Pane', requestId: 'sessions' } as const
const PANE_PROPS = { title: 'Conversations', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const
const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

const row = (engineId: string, overrides: Partial<ConversationRow> = {}): ConversationRow => ({
  hostId: `host-${engineId}`,
  engineId,
  title: `Conversation ${engineId}`,
  cwd: 'C:\\Users\\moi\\source\\repos\\projet',
  status: 'done',
  updatedAt: Date.now() - 120000,
  isCurrent: false,
  isLive: true,
  context: null,
  ...overrides,
})

const ROWS = [
  row('attend'),
  row('travaille', { status: 'tool', tool: 'Bash' }),
  row('ici', { status: 'working', isCurrent: true }),
]

const SUMMARY: RowSummary = { updatedAt: ROWS[0]!.updatedAt, text: 'La PR est prête.', awaiting: 'Valider la PR.', isLoading: false }

// The mod's state as the pane reads it, answered from beneath the mod.
const answerState = (on: On, values: Record<string, unknown>) =>
  on('state.get', ($, e, next) => (e.plugin === 'sessions' && e.key in values ? { value: { value: values[e.key], version: 1 } } : next(e)))

describe('the Conversations pane', () => {
  for (const surface of SURFACES) {
    test(`draws every conversation by section on ${surface}`, async ($, on) => {
      answerState(on, { list: ROWS, summaries: { attend: SUMMARY } })
      const ui = await $.ui.mount({ ...PANE, surface, props: PANE_PROPS })

      expect(await ui.find({ text: /Conversation attend/ })).toBeDefined()
      expect(await ui.find({ text: /lance une commande/ })).toBeDefined()
      expect(await ui.find({ text: /Valider la PR\./ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'ici' })).toBeDefined()
    })

    test(`opens a conversation's details, with a reply field where ${surface} draws one`, async ($, on) => {
      answerState(on, { list: ROWS, summaries: { attend: SUMMARY }, expanded: ['attend'] })
      const ui = await $.ui.mount({ ...PANE, surface, props: PANE_PROPS })

      expect(await ui.find({ text: /La PR est prête\./ })).toBeDefined()
      expect(await ui.findAll({ type: 'Input' })).toHaveLength(surface === 'mobile' ? 0 : 1)
    })
  }
})
