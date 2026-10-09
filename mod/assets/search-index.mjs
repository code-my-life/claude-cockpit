import fs from 'node:fs'
import path from 'node:path'

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value)

const SEARCH_VERSION = 1
const MAX_SEGMENT_LENGTH = 20000
const TITLE_LENGTH = 80
const SNIPPET_RADIUS = 90
const COMBINING_MARKS = /[̀-ͯ]/g
export const MAX_RESULTS = 50

export const foldText = text => text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase()

const foldWithMap = text => {
  let folded = ''
  const origins = []
  for (let index = 0; index < text.length; index++) {
    const piece = foldText(text[index])
    folded += piece
    for (let step = 0; step < piece.length; step++) origins.push(index)
  }
  return { folded, origins }
}

const textOfContent = content => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const texts = content.filter(part => isRecord(part) && part.type === 'text' && typeof part.text === 'string')
  return texts.map(part => part.text).join('\n')
}

const segmentOf = record => {
  const isMessage = record.type === 'user' || record.type === 'assistant'
  if (!isMessage || record.isMeta === true || !isRecord(record.message)) return null
  const text = textOfContent(record.message.content).trim()
  if (text.length === 0) return null
  const at = Date.parse(record.timestamp)
  return { role: record.type, at: Number.isFinite(at) ? at : 0, text: text.slice(0, MAX_SEGMENT_LENGTH) }
}

const parseLine = rawLine => {
  try {
    const record = JSON.parse(rawLine)
    return isRecord(record) ? record : null
  } catch {
    return null
  }
}

export const extractTranscript = text => {
  const segments = []
  let title = null
  let cwd = ''
  for (const rawLine of text.split('\n')) {
    if (rawLine.length === 0) continue
    const record = parseLine(rawLine)
    if (record === null) continue
    if (record.type === 'custom-title' && typeof record.customTitle === 'string') title = record.customTitle
    if (cwd === '' && typeof record.cwd === 'string') cwd = record.cwd
    const segment = segmentOf(record)
    if (segment !== null) segments.push(segment)
  }
  const firstUser = segments.find(segment => segment.role === 'user')
  const fallbackTitle = firstUser === undefined ? null : firstUser.text.replace(/\s+/g, ' ').slice(0, TITLE_LENGTH)
  return { title: title ?? fallbackTitle, cwd, segments }
}

const engineIdOf = file => path.basename(file, '.jsonl')

const entryOf = (file, stat, transcript) => {
  const folded = transcript.segments.map(segment => foldText(segment.text))
  return { mtimeMs: stat.mtimeMs, size: stat.size, engineId: engineIdOf(file), title: transcript.title, cwd: transcript.cwd, segments: transcript.segments, folded }
}

const readTranscript = async (read, file, stat) => {
  try {
    const text = await read(file)
    const transcript = extractTranscript(text)
    return entryOf(file, stat, transcript)
  } catch {
    return null
  }
}

export const refreshSearchIndex = async (previous, scanned, read) => {
  const previousFiles = isRecord(previous.files) ? previous.files : {}
  const files = {}
  let changed = false
  for (const stat of scanned) {
    const known = previousFiles[stat.path]
    if (known !== undefined && known.mtimeMs === stat.mtimeMs && known.size === stat.size) {
      files[stat.path] = known
      continue
    }
    const entry = await readTranscript(read, stat.path, stat)
    if (entry === null) {
      if (known !== undefined) files[stat.path] = known
      continue
    }
    files[stat.path] = entry
    changed = true
  }
  const previousCount = Object.keys(previousFiles).length
  const currentCount = Object.keys(files).length
  if (previousCount !== currentCount) changed = true
  return { index: { files }, changed }
}

const listEntries = async dir => {
  try {
    return await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

export const scanTranscriptFiles = async root => {
  const scanned = []
  const projects = await listEntries(root)
  for (const project of projects) {
    if (!project.isDirectory()) continue
    const projectDir = path.join(root, project.name)
    const entries = await listEntries(projectDir)
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
      const file = path.join(projectDir, entry.name)
      try {
        const stat = await fs.promises.stat(file)
        scanned.push({ path: file, mtimeMs: stat.mtimeMs, size: stat.size })
      } catch {
        continue
      }
    }
  }
  return scanned
}

export const loadSearchCache = file => {
  try {
    const text = fs.readFileSync(file, 'utf8')
    const data = JSON.parse(text)
    if (!isRecord(data) || data.version !== SEARCH_VERSION || !isRecord(data.files)) return { files: {} }
    const files = {}
    for (const [name, entry] of Object.entries(data.files)) {
      const segments = Array.isArray(entry.segments) ? entry.segments : []
      const folded = segments.map(segment => foldText(segment.text))
      files[name] = { ...entry, segments, folded }
    }
    return { files }
  } catch {
    return { files: {} }
  }
}

export const saveSearchCache = (file, index) => {
  const files = {}
  for (const [name, { folded, ...entry }] of Object.entries(index.files)) files[name] = entry
  const payload = JSON.stringify({ version: SEARCH_VERSION, files })
  const temporary = `${file}.tmp`
  fs.writeFileSync(temporary, payload)
  fs.renameSync(temporary, file)
}

export const hostsByEngineOf = sessions => {
  const hosts = new Map()
  for (const session of sessions) {
    hosts.set(session.engineId, session)
    const priorIds = Array.isArray(session.priorEngineIds) ? session.priorEngineIds : []
    for (const priorId of priorIds) {
      if (!hosts.has(priorId)) hosts.set(priorId, session)
    }
  }
  return hosts
}

const wordsOf = query => {
  const raw = String(query ?? '')
  const folded = foldText(raw)
  return folded.split(/\s+/).filter(word => word.length > 0)
}

const cutToWord = (text, start, end) => {
  let from = start
  let to = end
  if (from > 0) {
    const space = text.indexOf(' ', from)
    if (space !== -1 && space < from + 20) from = space + 1
  }
  if (to < text.length) {
    const space = text.lastIndexOf(' ', to)
    if (space > to - 20) to = space
  }
  return [from, to]
}

const marksOf = (text, words) => {
  const { folded, origins } = foldWithMap(text)
  const marks = []
  for (const word of words) {
    let from = folded.indexOf(word)
    while (from !== -1) {
      const start = origins[from]
      const end = origins[from + word.length - 1] + 1
      marks.push([start, end])
      from = folded.indexOf(word, from + word.length)
    }
  }
  return marks.sort((first, second) => first[0] - second[0])
}

export const snippetOf = (text, words) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  const { folded, origins } = foldWithMap(flat)
  const positions = words.map(word => folded.indexOf(word)).filter(position => position !== -1)
  const firstHit = positions.length > 0 ? Math.min(...positions) : 0
  const centre = origins[firstHit] ?? 0
  const windowStart = Math.max(0, centre - SNIPPET_RADIUS)
  const windowEnd = Math.min(flat.length, centre + SNIPPET_RADIUS)
  const [from, to] = cutToWord(flat, windowStart, windowEnd)
  const prefix = from > 0 ? '…' : ''
  const suffix = to < flat.length ? '…' : ''
  const window = `${prefix}${flat.slice(from, to)}${suffix}`
  return { text: window, marks: marksOf(window, words) }
}

const matchCountOf = (folded, words) => words.filter(word => folded.includes(word)).length

const conversationOf = (entry, host) => ({
  key: host ? host.hostId : entry.engineId,
  hostId: host ? host.hostId : null,
  engineId: host ? host.engineId : entry.engineId,
  title: host ? host.title : entry.title || '(sans titre)',
  cwd: host ? host.cwd : entry.cwd,
  isTerminal: !host,
  lastAt: host ? host.lastActivityAt || 0 : 0,
  count: 0,
  seen: new Set(),
  best: null,
})

export const findMatches = (index, query, hosts) => {
  const words = wordsOf(query)
  if (words.length === 0) return { results: [], total: 0 }
  const conversations = new Map()
  for (const entry of Object.values(index.files)) {
    const segments = Array.isArray(entry.segments) ? entry.segments : []
    if (segments.length === 0) continue
    const host = hosts.get(entry.engineId)
    const key = host ? host.hostId : entry.engineId
    const conversation = conversations.get(key) ?? conversationOf(entry, host)
    conversations.set(key, conversation)
    segments.forEach((segment, position) => {
      const folded = entry.folded[position]
      conversation.lastAt = Math.max(conversation.lastAt, segment.at)
      const matched = matchCountOf(folded, words)
      if (matched === 0) return
      for (const word of words) if (folded.includes(word)) conversation.seen.add(word)
      conversation.count += 1
      const best = conversation.best
      const isBetter = best === null || matched > best.matched || (matched === best.matched && segment.at >= best.segment.at)
      if (isBetter) conversation.best = { matched, segment }
    })
  }
  const matching = [...conversations.values()].filter(conversation => conversation.seen.size === words.length)
  matching.sort((first, second) => second.lastAt - first.lastAt)
  const shown = matching.slice(0, MAX_RESULTS)
  const results = shown.map(({ seen, best, ...conversation }) => ({
    ...conversation,
    role: best.segment.role,
    at: best.segment.at,
    snippet: snippetOf(best.segment.text, words),
  }))
  return { results, total: matching.length }
}

export const isLocalHost = (hostHeader, port) => {
  if (typeof hostHeader !== 'string') return false
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`]
  return allowed.includes(hostHeader.toLowerCase())
}
