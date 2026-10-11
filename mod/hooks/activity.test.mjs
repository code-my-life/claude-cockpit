import test from 'node:test'
import assert from 'node:assert/strict'

import { DIFF_MAX_CHARS, MAX_STEPS, pushStep, stepOf } from './activity.mjs'

test('an edit names its file and counts the lines it adds and removes', () => {
  const step = stepOf('Edit', { file_path: 'C:/repo/src/app.js', old_string: 'a\nb', new_string: 'a\nb\nc\nd' }, 1000)
  assert.deepEqual(step, { at: 1000, kind: 'edit', label: 'Modifie app.js', file: 'C:/repo/src/app.js', added: 4, removed: 2, diff: { before: 'a\nb', after: 'a\nb\nc\nd' } })
})

test('a multi edit adds up its edits', () => {
  const step = stepOf('MultiEdit', { file_path: '/r/x.ts', edits: [{ old_string: 'a', new_string: 'b\nc' }, { old_string: 'd\ne', new_string: '' }] }, 1)
  assert.equal(step.added, 2)
  assert.equal(step.removed, 3)
  assert.equal(step.diff.before, 'a\n…\nd\ne')
})

test('a new file counts its lines as added', () => {
  const step = stepOf('Write', { file_path: '/r/README.md', content: 'un\ndeux\ntrois\n' }, 1)
  assert.equal(step.label, 'Écrit README.md')
  assert.equal(step.added, 3)
  assert.equal(step.removed, 0)
})

test('reads, commands, searches and web calls get their own words', () => {
  assert.equal(stepOf('Read', { file_path: '/r/a.js' }, 1).label, 'Lit a.js')
  assert.equal(stepOf('Bash', { command: 'npm test\nnpm run build' }, 1).label, 'Lance npm test')
  assert.equal(stepOf('PowerShell', { command: 'git status' }, 1).kind, 'command')
  assert.equal(stepOf('Grep', { pattern: 'TODO' }, 1).label, 'Cherche « TODO »')
  assert.equal(stepOf('WebFetch', { url: 'https://example.com/a' }, 1).label, 'Consulte example.com')
  assert.equal(stepOf('Agent', { description: 'Audit' }, 1).label, 'Délègue : Audit')
})

test('an unknown tool keeps its name, a strange input never breaks', () => {
  assert.equal(stepOf('Mystery', {}, 1).label, 'Utilise Mystery')
  assert.equal(stepOf('Edit', null, 1).label, 'Modifie ')
  assert.equal(stepOf('Bash', { command: 42 }, 1).label, 'Lance 42')
})

test('a long diff is cut so the shared store stays small', () => {
  const step = stepOf('Write', { file_path: '/r/big.txt', content: 'x'.repeat(DIFF_MAX_CHARS * 3) }, 1)
  assert.ok(step.diff.after.length <= DIFF_MAX_CHARS + 1)
  assert.ok(step.diff.after.endsWith('…'))
})

test('the list keeps the last steps, and diffs only for the last edits', () => {
  let list = []
  for (let index = 0; index < 8; index += 1) list = pushStep(list, stepOf('Edit', { file_path: `/r/f${index}.js`, old_string: 'a', new_string: 'b' }, index))
  assert.equal(list.length, MAX_STEPS)
  assert.deepEqual(list.map(step => step.file), ['/r/f3.js', '/r/f4.js', '/r/f5.js', '/r/f6.js', '/r/f7.js'])
  assert.deepEqual(list.map(step => step.diff !== undefined), [false, false, true, true, true])
})

test('the same read twice in a row is one step', () => {
  let list = pushStep([], stepOf('Read', { file_path: '/r/a.js' }, 1))
  list = pushStep(list, stepOf('Read', { file_path: '/r/a.js' }, 2))
  assert.equal(list.length, 1)
  assert.equal(list[0].at, 2)
})

test('pushing nothing keeps the list', () => {
  const list = pushStep([], stepOf('Read', { file_path: '/r/a.js' }, 1))
  assert.equal(pushStep(list, null), list)
})
