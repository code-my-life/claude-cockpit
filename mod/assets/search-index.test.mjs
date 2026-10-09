import test from 'node:test'
import assert from 'node:assert/strict'

import { MAX_RESULTS, extractTranscript, foldText, findMatches, hostsByEngineOf, isLocalHost, refreshSearchIndex, snippetOf } from './search-index.mjs'

const line = value => JSON.stringify(value)

const transcriptOf = lines => lines.map(line).join('\n')

const entryOf = (engineId, segments, extra = {}) => {
  const folded = segments.map(segment => foldText(segment.text))
  return { engineId, title: extra.title ?? null, cwd: extra.cwd ?? '', segments, folded }
}

const indexOf = entries => {
  const files = {}
  for (const entry of entries) files[`C:/projects/x/${entry.engineId}.jsonl`] = { mtimeMs: 1, size: 1, ...entry }
  return { files }
}

test('only your messages and the written replies of Claude are kept', () => {
  const text = transcriptOf([
    { type: 'custom-title', customTitle: 'Analyse du dock', sessionId: 'abc' },
    { type: 'user', timestamp: '2026-10-01T10:00:00.000Z', cwd: 'C:/repo', message: { role: 'user', content: 'Pourquoi le dock rame ?' } },
    { type: 'user', isMeta: true, timestamp: '2026-10-01T10:00:01.000Z', message: { role: 'user', content: 'caveat technique' } },
    { type: 'assistant', timestamp: '2026-10-01T10:00:02.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Le fond animé coûte cher.' }, { type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } },
    { type: 'user', timestamp: '2026-10-01T10:00:03.000Z', message: { role: 'user', content: [{ type: 'tool_result', content: 'sortie de commande dock' }] } },
    { type: 'attachment', attachment: { content: 'pièce jointe dock' } },
    { type: 'system', content: 'message système dock' },
    'pas du json',
  ])
  const transcript = extractTranscript(text)
  const texts = transcript.segments.map(segment => segment.text)
  const roles = transcript.segments.map(segment => segment.role)
  assert.deepEqual(texts, ['Pourquoi le dock rame ?', 'Le fond animé coûte cher.'])
  assert.deepEqual(roles, ['user', 'assistant'])
  assert.equal(transcript.title, 'Analyse du dock')
  assert.equal(transcript.cwd, 'C:/repo')
  assert.equal(transcript.segments[0].at, Date.parse('2026-10-01T10:00:00.000Z'))
})

test('a transcript without a title takes its first message as title', () => {
  const text = transcriptOf([
    { type: 'user', timestamp: '2026-10-01T10:00:00.000Z', message: { role: 'user', content: 'Corrige le bouton de la page facture' } },
  ])
  const transcript = extractTranscript(text)
  assert.equal(transcript.title, 'Corrige le bouton de la page facture')
})

test('folding removes accents and capitals', () => {
  const folded = foldText('Réponse ÉTÉ Garçon')
  assert.equal(folded, 'reponse ete garcon')
})

test('a conversation matches only when every word is in it, accents and capitals ignored', () => {
  const index = indexOf([
    entryOf('both', [{ role: 'user', at: 10, text: 'La Réponse arrive' }, { role: 'assistant', at: 20, text: 'le dock est prêt' }]),
    entryOf('one', [{ role: 'user', at: 30, text: 'seulement une reponse' }]),
  ])
  const found = findMatches(index, 'reponse DOCK', new Map())
  const engineIds = found.results.map(result => result.engineId)
  assert.deepEqual(engineIds, ['both'])
})

test('one line per conversation, most recent first, with the right passage count', () => {
  const index = indexOf([
    entryOf('old', [{ role: 'user', at: 10, text: 'dock un' }, { role: 'assistant', at: 11, text: 'dock deux' }, { role: 'user', at: 12, text: 'rien' }]),
    entryOf('new', [{ role: 'user', at: 50, text: 'le dock' }]),
  ])
  const found = findMatches(index, 'dock', new Map())
  const engineIds = found.results.map(result => result.engineId)
  const counts = found.results.map(result => result.count)
  assert.deepEqual(engineIds, ['new', 'old'])
  assert.deepEqual(counts, [1, 2])
  assert.equal(found.total, 2)
})

test('results stop at fifty conversations but the total stays exact', () => {
  const entries = Array.from({ length: MAX_RESULTS + 10 }, (unused, index) => entryOf(`s${index}`, [{ role: 'user', at: index, text: 'cockpit' }]))
  const index = indexOf(entries)
  const found = findMatches(index, 'cockpit', new Map())
  assert.equal(MAX_RESULTS, 50)
  assert.equal(found.results.length, MAX_RESULTS)
  assert.equal(found.total, MAX_RESULTS + 10)
  assert.equal(found.results[0].engineId, `s${MAX_RESULTS + 9}`)
})

test('an empty query finds nothing', () => {
  const index = indexOf([entryOf('a', [{ role: 'user', at: 1, text: 'texte' }])])
  const found = findMatches(index, '   ', new Map())
  assert.deepEqual(found, { results: [], total: 0 })
})

test('a snippet is centred on the word and its marks point at the original accented text', () => {
  const before = 'mot '.repeat(60)
  const after = ' fin'.repeat(60)
  const text = `${before}la Réponse du serveur${after}`
  const snippet = snippetOf(text, ['reponse'])
  const [start, end] = snippet.marks[0]
  const marked = snippet.text.slice(start, end)
  assert.equal(marked, 'Réponse')
  assert.ok(snippet.text.startsWith('…'))
  assert.ok(snippet.text.endsWith('…'))
  assert.ok(snippet.text.length < 260, `length ${snippet.text.length}`)
})

test('an older transcript is shown under its conversation and a terminal session is flagged', () => {
  const sessions = [{ hostId: 'local_1', engineId: 'current', priorEngineIds: ['previous'], title: 'Cockpit', lastActivityAt: 500, cwd: 'C:/repo' }]
  const hosts = hostsByEngineOf(sessions)
  const index = indexOf([
    entryOf('current', [{ role: 'user', at: 40, text: 'dock' }]),
    entryOf('previous', [{ role: 'user', at: 20, text: 'dock' }, { role: 'assistant', at: 21, text: 'dock' }]),
    entryOf('lonely', [{ role: 'user', at: 30, text: 'dock' }], { title: 'Session terminal' }),
  ])
  const found = findMatches(index, 'dock', hosts)
  const merged = found.results.find(result => result.hostId === 'local_1')
  const lonely = found.results.find(result => result.engineId === 'lonely')
  assert.equal(found.results.length, 2)
  assert.equal(merged.count, 3)
  assert.equal(merged.title, 'Cockpit')
  assert.equal(merged.isTerminal, false)
  assert.equal(lonely.isTerminal, true)
  assert.equal(lonely.hostId, null)
  assert.equal(lonely.title, 'Session terminal')
})

test('only changed transcripts are read again', async () => {
  const previous = { files: { 'a.jsonl': { mtimeMs: 1, size: 10, engineId: 'a', title: 'A', cwd: '', segments: [], folded: [] } } }
  const scanned = [{ path: 'a.jsonl', mtimeMs: 1, size: 10 }, { path: 'b.jsonl', mtimeMs: 5, size: 20 }]
  const reads = []
  const read = async file => {
    reads.push(file)
    return line({ type: 'user', timestamp: '2026-10-01T10:00:00.000Z', message: { role: 'user', content: 'bonjour' } })
  }
  const refreshed = await refreshSearchIndex(previous, scanned, read)
  const files = Object.keys(refreshed.index.files).sort()
  assert.deepEqual(reads, ['b.jsonl'])
  assert.deepEqual(files, ['a.jsonl', 'b.jsonl'])
  assert.equal(refreshed.index.files['b.jsonl'].engineId, 'b')
  assert.equal(refreshed.changed, true)
})

test('nothing is read again and nothing changes when no transcript moved', async () => {
  const previous = { files: { 'a.jsonl': { mtimeMs: 1, size: 10, engineId: 'a', title: 'A', cwd: '', segments: [], folded: [] } } }
  const scanned = [{ path: 'a.jsonl', mtimeMs: 1, size: 10 }]
  const reads = []
  const read = async file => {
    reads.push(file)
    return ''
  }
  const refreshed = await refreshSearchIndex(previous, scanned, read)
  assert.deepEqual(reads, [])
  assert.equal(refreshed.changed, false)
})

test('the search only answers requests addressed to this machine', () => {
  assert.equal(isLocalHost('127.0.0.1:48123', 48123), true)
  assert.equal(isLocalHost('localhost:48123', 48123), true)
  assert.equal(isLocalHost('evil.example:48123', 48123), false)
  assert.equal(isLocalHost('evil.example', 48123), false)
  assert.equal(isLocalHost('127.0.0.1:9999', 48123), false)
  assert.equal(isLocalHost(undefined, 48123), false)
})

test('a transcript that cannot be read is left out and read again on the next refresh', async () => {
  const scanned = [{ path: 'a.jsonl', mtimeMs: 1, size: 10 }]
  const failing = async () => {
    throw new Error('EBUSY')
  }
  const working = async () => line({ type: 'user', timestamp: '2026-10-01T10:00:00.000Z', message: { role: 'user', content: 'bonjour' } })
  const first = await refreshSearchIndex({ files: {} }, scanned, failing)
  const second = await refreshSearchIndex(first.index, scanned, working)
  assert.deepEqual(Object.keys(first.index.files), [])
  assert.equal(second.index.files['a.jsonl'].segments.length, 1)
  assert.equal(second.changed, true)
})

test('a changed transcript that cannot be read keeps its previous entry', async () => {
  const previous = { files: { 'a.jsonl': { mtimeMs: 1, size: 10, engineId: 'a', title: 'A', cwd: '', segments: [{ role: 'user', at: 1, text: 'avant' }], folded: ['avant'] } } }
  const scanned = [{ path: 'a.jsonl', mtimeMs: 2, size: 20 }]
  const failing = async () => {
    throw new Error('EBUSY')
  }
  const refreshed = await refreshSearchIndex(previous, scanned, failing)
  assert.equal(refreshed.index.files['a.jsonl'].segments[0].text, 'avant')
})
