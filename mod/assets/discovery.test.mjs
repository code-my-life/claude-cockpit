import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createLink, dataDirOf, linkFileOf, readLink, removeLink, writeLink, LINK_PROTOCOL } from './discovery.mjs'

const DATA_DIR = path.join(os.tmpdir(), 'cockpit-data')
const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-link-')), 'nested', 'link.json')
const alwaysAlive = () => true
const linkFor = overrides => createLink({ port: 48123, appVersion: '1.0.0', pid: 7, dataDir: DATA_DIR, ...overrides })

test('on Windows the link lives in the local app data folder', () => {
  const file = linkFileOf('win32', { LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' }, 'C:\\Users\\x')
  assert.equal(file, path.join('C:\\Users\\x\\AppData\\Local', 'claude-cockpit', 'link.json'))
})

test('without LOCALAPPDATA the Windows link falls back under the home folder', () => {
  const file = linkFileOf('win32', {}, 'C:\\Users\\x')
  assert.equal(file, path.join('C:\\Users\\x', 'AppData', 'Local', 'claude-cockpit', 'link.json'))
})

test('the app data folder sits next to the link', () => {
  const file = linkFileOf('win32', { LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' }, 'C:\\Users\\x')
  assert.equal(dataDirOf(file), path.join('C:\\Users\\x\\AppData\\Local', 'claude-cockpit', 'data'))
})

test('a new link carries the protocol, the port, the data folder and a fresh 32-byte secret', () => {
  const first = linkFor({ port: 48124 })
  const second = linkFor({})
  assert.equal(first.protocol, LINK_PROTOCOL)
  assert.equal(first.port, 48124)
  assert.equal(first.dataDir, DATA_DIR)
  assert.match(first.secret, /^[0-9a-f]{64}$/)
  assert.match(first.proof, /^[0-9a-f]{64}$/)
  assert.notEqual(first.proof, first.secret)
  assert.notEqual(first.secret, second.secret)
  assert.equal(typeof first.startedAt, 'number')
})

test('a secret chosen before the port is known is kept', () => {
  const secret = 'a'.repeat(64)
  assert.equal(linkFor({ secret }).secret, secret)
})

test('a written link is read back whole, its folder created on the way', () => {
  const file = tempFile()
  const link = linkFor({ port: 48124 })
  writeLink(file, link)
  assert.deepEqual(readLink(file, alwaysAlive), link)
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['link.json'])
})

test('a missing or unreadable link reads as no app', () => {
  const file = tempFile()
  assert.equal(readLink(file, alwaysAlive), null)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '{not json')
  assert.equal(readLink(file, alwaysAlive), null)
})

test('a link from another protocol or with a malformed field is ignored', () => {
  const file = tempFile()
  const link = linkFor({})
  const brokenLinks = [
    { ...link, protocol: 99 },
    { ...link, port: 70000 },
    { ...link, secret: 'short' },
    { ...link, proof: undefined },
    { ...link, pid: -1 },
    { ...link, dataDir: '' },
    { ...link, dataDir: 'relative/folder' },
  ]
  for (const broken of brokenLinks) {
    writeLink(file, broken)
    assert.equal(readLink(file, alwaysAlive), null, JSON.stringify(broken))
  }
})

test('a link left by a process that is gone is stale', () => {
  const file = tempFile()
  writeLink(file, linkFor({}))
  assert.equal(readLink(file, () => false), null)
})

test('the live process check recognises the current process', () => {
  const file = tempFile()
  const link = linkFor({ pid: process.pid })
  writeLink(file, link)
  assert.deepEqual(readLink(file), link)
})

test('an app only removes the link it wrote itself', () => {
  const file = tempFile()
  writeLink(file, linkFor({ pid: 7 }))
  removeLink(file, 8)
  assert.ok(fs.existsSync(file))
  removeLink(file, 7)
  assert.ok(!fs.existsSync(file))
  removeLink(file, 7)
})
