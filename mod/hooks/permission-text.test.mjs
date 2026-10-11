import test from 'node:test'
import assert from 'node:assert/strict'

import { decisionFor, describePermission } from './permission-text.mjs'

test('a command shows its first line, and the whole command in detail', () => {
  const described = describePermission('Bash', { command: 'npm test\nnpm run build', description: 'Lance les tests' })
  assert.equal(described.tool, 'Commande')
  assert.equal(described.summary, 'npm test')
  assert.equal(described.detail, 'npm test\nnpm run build')
})

test('a file edit names the file', () => {
  assert.equal(describePermission('Edit', { file_path: 'C:/repo/src/app.js' }).summary, 'Modifie app.js')
  assert.equal(describePermission('Write', { file_path: '/repo/README.md' }).summary, 'Écrit README.md')
  assert.equal(describePermission('Edit', { file_path: 'C:/repo/src/app.js' }).detail, 'C:/repo/src/app.js')
})

test('a web call shows its address or its search', () => {
  assert.equal(describePermission('WebFetch', { url: 'https://example.com/a' }).summary, 'https://example.com/a')
  assert.equal(describePermission('WebSearch', { query: 'electron acrylic' }).summary, 'electron acrylic')
})

test('an MCP tool shows its server and tool, and its input in detail', () => {
  const described = describePermission('mcp__github__create_issue', { title: 'Bug' })
  assert.equal(described.tool, 'github')
  assert.equal(described.summary, 'create_issue')
  assert.match(described.detail, /"title": "Bug"/)
})

test('an unknown tool keeps its name and its input', () => {
  const described = describePermission('Mystery', { a: 1 })
  assert.equal(described.tool, 'Mystery')
  assert.match(described.detail, /"a": 1/)
})

test('a strange input never breaks the description', () => {
  assert.equal(describePermission('Bash', null).summary, '')
  assert.equal(describePermission('Bash', { command: 42 }).summary, '42')
})

test('allow and deny become the hook answer', () => {
  assert.deepEqual(decisionFor('allow', []), { behavior: 'allow' })
  assert.deepEqual(decisionFor('deny', []), { behavior: 'deny', message: 'Refusé depuis le cockpit.' })
})

test('always allows and keeps the rules Claude suggested', () => {
  const suggestions = [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npm test' }], behavior: 'allow', destination: 'localSettings' }]
  assert.deepEqual(decisionFor('always', suggestions), { behavior: 'allow', updatedPermissions: suggestions })
})

test('always without a suggestion is a plain allow', () => {
  assert.deepEqual(decisionFor('always', undefined), { behavior: 'allow' })
})

test('anything else gives no answer', () => {
  assert.equal(decisionFor(null, []), null)
  assert.equal(decisionFor('gone', []), null)
})
