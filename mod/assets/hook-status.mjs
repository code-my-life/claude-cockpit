import fs from 'node:fs'
import path from 'node:path'

// Where the conversations stand, from the files the cockpit hook writes
// (mod/assets/cockpit-hook.sh) in ~/.claude/cockpit/status, on Windows and in
// each running WSL distro. They give a live status to the conversations that do
// not load the mod: those run in WSL, or started before the mod was installed.

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value)

const SESSION_ID = /^[A-Za-z0-9_-]+$/
const SECOND_MS = 1000

// The status a hook event means; null for an event that says nothing about it.
export const statusOfEvent = (event, notification = '') => {
  switch (event) {
    case 'SessionStart':
      return 'opened'
    case 'UserPromptSubmit':
    case 'PostToolUse':
    case 'PostToolUseFailure':
      return 'working'
    case 'PreToolUse':
      return 'tool'
    case 'PermissionRequest':
      return 'permission'
    case 'Notification':
      if (notification === 'permission_prompt') return 'permission'
      if (notification === 'idle_prompt') return 'done'
      return null
    case 'Stop':
      return 'done'
    case 'StopFailure':
      return 'error'
    default:
      return null
  }
}

// One status file as a session entry (types: SessionEntry), or null.
export const hookEntryOf = text => {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(data) || typeof data.sessionId !== 'string' || !SESSION_ID.test(data.sessionId)) return null
  const status = statusOfEvent(data.event, typeof data.notification === 'string' ? data.notification : '')
  if (status === null || !Number.isFinite(data.at)) return null
  const entry = { id: data.sessionId, cwd: typeof data.cwd === 'string' ? data.cwd : '', prompt: '', status, updatedAt: data.at * SECOND_MS }
  if (status === 'tool' && typeof data.tool === 'string' && data.tool.length > 0) entry.tool = data.tool
  return entry
}

// Every status file of `dirs`, by session id; the newest wins if a session shows in two.
export const readHookStatuses = async dirs => {
  const entries = {}
  for (const dir of dirs) {
    let names
    try {
      names = await fs.promises.readdir(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      let entry
      try {
        entry = hookEntryOf(await fs.promises.readFile(path.join(dir, name), 'utf8'))
      } catch {
        continue
      }
      if (entry === null) continue
      const known = entries[entry.id]
      if (known === undefined || entry.updatedAt > known.updatedAt) entries[entry.id] = entry
    }
  }
  return entries
}
