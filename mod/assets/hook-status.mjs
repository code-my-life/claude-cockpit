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

// A status dir is <home>/.claude/cockpit/status; seen from Windows, a WSL home is \\wsl.localhost\<distro>\...
const homeOfStatusDir = dir => path.dirname(path.dirname(path.dirname(dir)))
const WSL_SHARE = /^\\\\wsl(?:\.localhost|\$)\\([^\\]+)\\/i
export const distroOfDir = dir => {
  const match = WSL_SHARE.exec(dir)
  return match === null ? null : match[1]
}

// The transcript of a session, <home>/.claude/projects/<project>/<id>.jsonl, found once and kept.
const transcripts = new Map()
const findTranscriptIn = async (home, id) => {
  const key = `${home}|${id}`
  if (transcripts.has(key)) return transcripts.get(key)
  const projects = path.join(home, '.claude', 'projects')
  let found = null
  try {
    for (const project of await fs.promises.readdir(projects)) {
      const candidate = path.join(projects, project, `${id}.jsonl`)
      if (fs.existsSync(candidate)) { found = candidate; break }
    }
  } catch {
    found = null
  }
  if (found !== null) transcripts.set(key, found)
  return found
}

// The title Claude Code gives a conversation ("ai-title" lines), read from the end of its transcript,
// kept while the transcript does not grow. A conversation in a terminal has no Desktop session to name it.
const TITLE_TAIL_BYTES = 256 * 1024
const titles = new Map()
export const lastTitleOf = text => {
  let title = ''
  for (const line of text.split('\n')) {
    if (!line.includes('"ai-title"') && !line.includes('"custom-title"')) continue
    try {
      const data = JSON.parse(line)
      const value = data.customTitle || data.aiTitle
      if (typeof value === 'string' && value.trim().length > 0) title = value.trim()
    } catch {
      continue
    }
  }
  return title
}
const titleOf = async file => {
  let stat
  try {
    stat = await fs.promises.stat(file)
  } catch {
    return ''
  }
  const known = titles.get(file)
  if (known !== undefined && known.size === stat.size) return known.title
  let title = ''
  let handle
  try {
    handle = await fs.promises.open(file, 'r')
    const length = Math.min(stat.size, TITLE_TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, stat.size - length)
    title = lastTitleOf(buffer.toString('utf8'))
  } catch {
    title = known === undefined ? '' : known.title
  } finally {
    await handle?.close()
  }
  if (title === '' && known !== undefined) title = known.title
  titles.set(file, { size: stat.size, title })
  return title
}

// Every status file of `dirs`, by session id; the newest wins if a session shows in two. Each entry also
// carries its transcript, its title and, for a WSL session, its distro (the summary and the terminal need them).
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
      if (known !== undefined && entry.updatedAt <= known.updatedAt) continue
      const distro = distroOfDir(dir)
      if (distro !== null) entry.distro = distro
      const transcript = await findTranscriptIn(homeOfStatusDir(dir), entry.id)
      if (transcript !== null) {
        entry.transcript = transcript
        entry.prompt = await titleOf(transcript)
      }
      entries[entry.id] = entry
    }
  }
  return entries
}
