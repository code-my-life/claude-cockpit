import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { knownRootsOf, isKnownFolder } from './known-folders.mjs'

const base = path.join(path.sep, 'work')

test('knownRootsOf keeps the Desktop session folders', () => {
  const sessions = [
    { cwd: path.join(base, 'desktop-project') },
    { cwd: path.join(base, 'another-project') },
  ]
  const roots = knownRootsOf(sessions, { files: {} })
  assert.deepEqual(roots.sort(), [
    path.join(base, 'another-project'),
    path.join(base, 'desktop-project'),
  ])
})

test('knownRootsOf adds the folders of the search index entries without duplicates', () => {
  const sessions = [
    { cwd: path.join(base, 'desktop-project') },
  ]
  const searchIndex = {
    files: {
      'transcript1.jsonl': { cwd: path.join(base, 'terminal-project') },
      'transcript2.jsonl': { cwd: path.join(base, 'desktop-project') }, // duplicate
      'transcript3.jsonl': { cwd: path.join(base, 'another-terminal') },
    },
  }
  const roots = knownRootsOf(sessions, searchIndex)
  assert.deepEqual(roots.sort(), [
    path.join(base, 'another-terminal'),
    path.join(base, 'desktop-project'),
    path.join(base, 'terminal-project'),
  ])
})

test('knownRootsOf ignores empty or missing cwd in search index', () => {
  const sessions = [
    { cwd: path.join(base, 'desktop-project') },
  ]
  const searchIndex = {
    files: {
      'transcript1.jsonl': { cwd: '' },
      'transcript2.jsonl': { cwd: path.join(base, 'valid-project') },
      'transcript3.jsonl': { title: 'no cwd' },
    },
  }
  const roots = knownRootsOf(sessions, searchIndex)
  assert.deepEqual(roots.sort(), [
    path.join(base, 'desktop-project'),
    path.join(base, 'valid-project'),
  ])
})

test('knownRootsOf with undefined searchIndex returns only session folders', () => {
  const sessions = [
    { cwd: path.join(base, 'desktop-project') },
  ]
  const roots = knownRootsOf(sessions, undefined)
  assert.deepEqual(roots, [path.join(base, 'desktop-project')])
})

test('knownRootsOf with empty searchIndex returns only session folders', () => {
  const sessions = [
    { cwd: path.join(base, 'desktop-project') },
  ]
  const roots = knownRootsOf(sessions, {})
  assert.deepEqual(roots, [path.join(base, 'desktop-project')])
})

test('isKnownFolder accepts a folder known only from a search index entry', () => {
  const roots = [path.join(base, 'terminal-project')]
  const folder = path.join(base, 'terminal-project')
  assert.equal(isKnownFolder(roots, folder, path.join(path.sep, 'home', 'user')), true)
})

test('isKnownFolder accepts a sub-folder of a known root', () => {
  const roots = [path.join(base, 'project')]
  const folder = path.join(base, 'project', 'subfolder')
  assert.equal(isKnownFolder(roots, folder, path.join(path.sep, 'home', 'user')), true)
})

test('isKnownFolder refuses an unrelated folder', () => {
  const roots = [path.join(base, 'project')]
  const folder = path.join(path.sep, 'other-root', 'folder')
  assert.equal(isKnownFolder(roots, folder, path.join(path.sep, 'home', 'user')), false)
})

test('isKnownFolder accepts a sibling of a root', () => {
  const roots = [path.join(base, 'project', 'sub')]
  const folder = path.join(base, 'project', 'sibling')
  const homeDir = path.join(path.sep, 'home', 'user')
  assert.equal(isKnownFolder(roots, folder, homeDir), true)
})

test('isKnownFolder refuses a sibling when the parent is the home folder', () => {
  const homeDir = path.join(path.sep, 'home', 'user')
  const roots = [path.join(homeDir, 'project')]
  const folder = path.join(homeDir, 'other')
  assert.equal(isKnownFolder(roots, folder, homeDir), false)
})
