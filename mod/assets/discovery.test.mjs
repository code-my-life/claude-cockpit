import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createLink, linkFileOf, readLink, removeLink, writeLink, LINK_PROTOCOL } from './discovery.mjs'

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-link-')), 'nested', 'link.json')
const alwaysAlive = () => true

test('on Windows the link lives in the local app data folder', () => {
  const file = linkFileOf('win32', { LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' }, 'C:\\Users\\x')
  assert.equal(file, path.join('C:\\Users\\x\\AppData\\Local', 'claude-cockpit', 'link.json'))
})

test('without LOCALAPPDATA the Windows link falls back under the home folder', () => {
  const file = linkFileOf('win32', {}, 'C:\\Users\\x')
  assert.equal(file, path.join('C:\\Users\\x', 'AppData', 'Local', 'claude-cockpit', 'link.json'))
})

test('a new link carries the protocol, the port and a fresh 32-byte secret', () => {
  const first = createLink({ port: 48123, appVersion: '1.2.3', pid: 42 })
  const second = createLink({ port: 48123, appVersion: '1.2.3', pid: 42 })
  assert.equal(first.protocol, LINK_PROTOCOL)
  assert.equal(first.port, 48123)
  assert.match(first.secret, /^[0-9a-f]{64}$/)
  assert.notEqual(first.secret, second.secret)
  assert.equal(typeof first.startedAt, 'number')
})

test('a written link is read back whole, its folder created on the way', () => {
  const file = tempFile()
  const link = createLink({ port: 48124, appVersion: '1.0.0', pid: 7 })
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
  const link = createLink({ port: 48123, appVersion: '1.0.0', pid: 7 })
  for (const broken of [{ ...link, protocol: 99 }, { ...link, port: 70000 }, { ...link, secret: 'short' }, { ...link, pid: -1 }]) {
    writeLink(file, broken)
    assert.equal(readLink(file, alwaysAlive), null)
  }
})

test('a link left by a process that is gone is stale', () => {
  const file = tempFile()
  writeLink(file, createLink({ port: 48123, appVersion: '1.0.0', pid: 7 }))
  assert.equal(readLink(file, () => false), null)
})

test('the live process check recognises the current process', () => {
  const file = tempFile()
  const link = createLink({ port: 48123, appVersion: '1.0.0', pid: process.pid })
  writeLink(file, link)
  assert.deepEqual(readLink(file), link)
})

test('an app only removes the link it wrote itself', () => {
  const file = tempFile()
  writeLink(file, createLink({ port: 48123, appVersion: '1.0.0', pid: 7 }))
  removeLink(file, 8)
  assert.ok(fs.existsSync(file))
  removeLink(file, 7)
  assert.ok(!fs.existsSync(file))
  removeLink(file, 7)
})
