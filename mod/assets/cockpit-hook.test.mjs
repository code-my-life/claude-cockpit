import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { hookEntryOf } from './hook-status.mjs'

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cockpit-hook.sh')
const hasSh = spawnSync('sh', ['-c', 'exit 0']).status === 0

// Runs the hook as Claude Code does: the event as JSON on stdin, in a home of its own.
const withHome = run => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-hook-'))
  const fire = payload => spawnSync('sh', [SCRIPT], { input: JSON.stringify(payload), env: { ...process.env, HOME: home }, encoding: 'utf8' })
  const statusOf = id => {
    const file = path.join(home, '.claude', 'cockpit', 'status', `${id}.json`)
    return fs.existsSync(file) ? hookEntryOf(fs.readFileSync(file, 'utf8')) : null
  }
  try {
    run({ fire, statusOf, home })
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
}

test('the hook writes where the conversation stands, silently, and never fails', { skip: !hasSh && 'no sh here' }, () => {
  withHome(({ fire, statusOf }) => {
    const ran = fire({ session_id: 'abc-1', transcript_path: '/t', cwd: 'C:\\Users\\ana\\repo', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo "session_id": "evil"' } })
    assert.equal(ran.status, 0)
    assert.equal(ran.stdout, '')
    assert.deepEqual({ ...statusOf('abc-1'), updatedAt: 0 }, { id: 'abc-1', cwd: 'C:\\Users\\ana\\repo', prompt: '', status: 'tool', tool: 'Bash', updatedAt: 0 })
  })
})

test('a notice about something else leaves the status; the end of the session removes it', { skip: !hasSh && 'no sh here' }, () => {
  withHome(({ fire, statusOf }) => {
    fire({ session_id: 's', hook_event_name: 'Notification', notification_type: 'permission_prompt' })
    fire({ session_id: 's', hook_event_name: 'Notification', notification_type: 'auth_success' })
    assert.equal(statusOf('s').status, 'permission')
    fire({ session_id: 's', hook_event_name: 'SessionEnd', reason: 'exit' })
    assert.equal(statusOf('s'), null)
  })
})

test('a late tool hook does not undo the end of the turn; a new prompt does', { skip: !hasSh && 'no sh here' }, () => {
  withHome(({ fire, statusOf }) => {
    fire({ session_id: 's', hook_event_name: 'Stop' })
    fire({ session_id: 's', hook_event_name: 'PostToolUse', tool_name: 'Read' })
    assert.equal(statusOf('s').status, 'done')
    fire({ session_id: 's', hook_event_name: 'UserPromptSubmit', prompt: 'suite' })
    assert.equal(statusOf('s').status, 'working')
  })
})

test('a session id that would leave the status folder is refused', { skip: !hasSh && 'no sh here' }, () => {
  withHome(({ fire, home }) => {
    assert.equal(fire({ session_id: '../../evil', hook_event_name: 'Stop' }).status, 0)
    assert.equal(fs.existsSync(path.join(home, '.claude', 'evil.json')), false)
    assert.deepEqual(fs.existsSync(path.join(home, '.claude', 'cockpit', 'status')) ? fs.readdirSync(path.join(home, '.claude', 'cockpit', 'status')) : [], [])
  })
})
