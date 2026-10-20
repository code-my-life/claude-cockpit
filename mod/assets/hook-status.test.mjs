import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { hookEntryOf, readHookStatuses, statusOfEvent } from './hook-status.mjs'

const fileOf = fields => JSON.stringify({ sessionId: 's1', event: 'Stop', notification: '', tool: '', cwd: '/home/ana/app', at: 100, ...fields })

test('each hook event gives the status the cockpit shows', () => {
  assert.equal(statusOfEvent('SessionStart'), 'opened')
  assert.equal(statusOfEvent('UserPromptSubmit'), 'working')
  assert.equal(statusOfEvent('PreToolUse'), 'tool')
  assert.equal(statusOfEvent('PostToolUse'), 'working')
  assert.equal(statusOfEvent('PostToolUseFailure'), 'working')
  assert.equal(statusOfEvent('PermissionRequest'), 'permission')
  assert.equal(statusOfEvent('Notification', 'permission_prompt'), 'permission')
  assert.equal(statusOfEvent('Notification', 'idle_prompt'), 'done')
  assert.equal(statusOfEvent('Notification', 'auth_success'), null)
  assert.equal(statusOfEvent('Stop'), 'done')
  assert.equal(statusOfEvent('StopFailure'), 'error')
  assert.equal(statusOfEvent('SubagentStop'), null)
})

test('a status file becomes a session entry, its time in milliseconds, the tool only while it runs', () => {
  assert.deepEqual(hookEntryOf(fileOf({ event: 'PreToolUse', tool: 'Bash' })), { id: 's1', cwd: '/home/ana/app', prompt: '', status: 'tool', tool: 'Bash', updatedAt: 100000 })
  assert.equal(hookEntryOf(fileOf({ event: 'Stop', tool: 'Bash' })).tool, undefined)
})

test('a broken, unknown or unsafe status file is ignored', () => {
  assert.equal(hookEntryOf('{ broken'), null)
  assert.equal(hookEntryOf(fileOf({ event: 'SubagentStart' })), null)
  assert.equal(hookEntryOf(fileOf({ sessionId: '../x' })), null)
  assert.equal(hookEntryOf(fileOf({ at: 'soon' })), null)
})

test('the status files of every folder are read, the newest wins, a missing folder is skipped', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-hooks-'))
  const [windows, wsl] = ['windows', 'wsl'].map(name => { const dir = path.join(root, name); fs.mkdirSync(dir); return dir })
  fs.writeFileSync(path.join(windows, 's1.json'), fileOf({ event: 'Stop', at: 100 }))
  fs.writeFileSync(path.join(wsl, 's1.json'), fileOf({ event: 'PreToolUse', tool: 'Read', at: 200 }))
  fs.writeFileSync(path.join(wsl, 's2.json'), fileOf({ sessionId: 's2', event: 'StopFailure', at: 50 }))
  fs.writeFileSync(path.join(wsl, 'notes.txt'), 'x')
  const statuses = await readHookStatuses([windows, wsl, path.join(root, 'missing')])
  assert.deepEqual(Object.keys(statuses).sort(), ['s1', 's2'])
  assert.equal(statuses.s1.status, 'tool')
  assert.equal(statuses.s2.status, 'error')
  fs.rmSync(root, { recursive: true, force: true })
})
