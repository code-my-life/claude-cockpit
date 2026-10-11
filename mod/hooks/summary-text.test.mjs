import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ancestorsOf,
  buildTailScript,
  buildThread,
  cleanUserText,
  lastMessagesOf,
  parseAwaiting,
  parseSummaryJson,
  REPLY_PREAMBLE,
} from './summary-text.mts'
import { exportRows, inlineScriptSafe, rowStatsOf, seedScriptOf, versionOf } from './page-data.mts'

test('the model JSON reply gives what Claude waits for, its kind and the plain version', () => {
  const reply = 'Voici : {"type": "q", "attend": "« Valider la PR. »", "clair": "  - Une ligne  "}'
  assert.deepEqual(parseSummaryJson(reply), { awaiting: 'Valider la PR.', kind: 'question', plain: '- Une ligne' })
  assert.equal(parseSummaryJson('pas de json'), null)
  assert.equal(parseSummaryJson('{ cassé }'), null)
})

test('the one-line reply reads its letter, and a line without one keeps no kind', () => {
  assert.deepEqual(parseAwaiting('E: la CI tourne'), { awaiting: 'la CI tourne.', kind: 'external' })
  assert.deepEqual(parseAwaiting('**Tu valides ?**'), { awaiting: 'Tu valides ?', kind: undefined })
  assert.deepEqual(parseAwaiting(''), { awaiting: '', kind: undefined })
})

test('a reply typed from the panel reads as the person wrote it, without the preamble or reminders', () => {
  const text = `<system-reminder>bruit</system-reminder>${REPLY_PREAMBLE}\n\n<cross-session-message from="x">fais le point</cross-session-message>`
  assert.equal(cleanUserText(text), 'fais le point')
})

test('the thread keeps Claude last reply of a run and drops command noise', () => {
  const thread = buildThread([
    { r: 'user', t: 'question' },
    { r: 'assistant', t: 'je cherche' },
    { r: 'assistant', t: 'voilà la réponse' },
    { r: 'user', t: '<command-name>/clear</command-name>' },
  ])
  assert.deepEqual(thread, [{ role: 'user', text: 'question' }, { role: 'assistant', text: 'voilà la réponse' }])
})

test('PowerShell single objects read as lists of one', () => {
  const messages = lastMessagesOf(JSON.stringify({ entries: { r: 'user', t: 'seul' }, paths: 'C:/repo/a.ts' }))
  assert.equal(messages.user, 'seul')
  assert.equal(messages.assistant, null)
  assert.deepEqual(messages.paths, ['C:/repo/a.ts'])
  assert.deepEqual(lastMessagesOf('').thread, [])
})

test('the folders searched for .git go up from the path, a /c/ path read as C:', () => {
  assert.deepEqual(ancestorsOf('/c/repo/src/a.ts', 'D:\\ailleurs', 3), ['C:\\repo\\src\\a.ts', 'C:\\repo\\src', 'C:\\repo'])
  assert.deepEqual(ancestorsOf('src', 'C:\\repo', 10), ['C:\\repo\\src', 'C:\\repo'])
})

test('the tail script quotes the transcript path for PowerShell', () => {
  assert.match(buildTailScript("C:\\l'ami\\x.jsonl"), /Open\('C:\\l''ami\\x\.jsonl'/)
})

test('page data stays inert inside a script element', () => {
  const separators = String.fromCharCode(0x2028) + String.fromCharCode(0x2029)
  const safe = inlineScriptSafe(JSON.stringify({ text: `</script>${separators}` }))
  assert.equal(safe.includes('<'), false)
  assert.equal(safe.includes(separators[0]), false)
  assert.equal(safe.includes(separators[1]), false)
  assert.deepEqual(JSON.parse(safe), { text: `</script>${separators}` })
  assert.match(seedScriptOf('42', '{}'), /^<script>window\.__PAGE_VERSION__ = "42"; window\.__CONVERSATIONS__ = \{\};<\/script>$/)
})

test('the page version follows its code', () => {
  assert.equal(versionOf('abc'), versionOf('abc'))
  assert.notEqual(versionOf('abc'), versionOf('abd'))
})

test('exported rows carry their summary and figures', () => {
  const acc = { messages: 3, tools: 2, files: ['a', 'b'], activeMs: 10, lastAt: 5, today: 1 }
  const row = { hostId: 'h', engineId: 'e', title: 't', cwd: 'c', status: 'done', updatedAt: 1, isLive: true, isCurrent: false, context: null }
  const [exported] = exportRows([row], { e: { updatedAt: 1, text: 'r', isLoading: false } }, { e: { offset: 0, acc } })
  assert.equal(exported.summary.text, 'r')
  assert.deepEqual(exported.stats, { messages: 3, tools: 2, files: 2, activeMs: 10, lastAt: 5, today: 1 })
  assert.equal('isCurrent' in exported, false)
  assert.equal(rowStatsOf(undefined), undefined)
})
