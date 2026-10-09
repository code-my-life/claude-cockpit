import fs from 'node:fs'
import path from 'node:path'

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value)

const INDEX_VERSION = 3
const PR_STATE_ORDER = ['OPEN', 'DRAFT', 'MERGED', 'CLOSED']
const BRANCH_TICKET = /^(?:[\w.-]+\/)?(\d{3,5})(?:[-_/]|$)/
const TITLE_TICKET = /(?:ticket\s*#?\s*|#)(\d{3,5})(?!\d)/i
const ORIGIN_SECTION = /\[remote "origin"\]([^[]*)/
const REMOTE_URL = /^\s*url\s*=\s*(\S+)\s*$/m
const GITHUB_REPO = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/

const textOrNull = value => (typeof value === 'string' && value.length > 0 ? value : null)

const stateRank = state => {
  const rank = PR_STATE_ORDER.indexOf(state)
  return rank === -1 ? PR_STATE_ORDER.length : rank
}

export const sortPrs = prs => [...prs].sort((a, b) => stateRank(a.state) - stateRank(b.state) || b.number - a.number)

export const ticketOf = (branches, title) => {
  for (const branch of branches) {
    const match = BRANCH_TICKET.exec(branch)
    if (match !== null) return match[1]
  }
  const titleMatch = TITLE_TICKET.exec(title ?? '')
  return titleMatch === null ? null : titleMatch[1]
}

const prsOf = raw => {
  if (!Array.isArray(raw)) return []
  const valid = raw.filter(pr => isRecord(pr) && Number.isInteger(pr.prNumber) && typeof pr.url === 'string')
  const byUrl = new Map(valid.map(pr => [pr.url, pr]))
  const unique = [...byUrl.values()]
  const prs = unique.map(pr => ({ number: pr.prNumber, repo: textOrNull(pr.repo), url: pr.url, state: textOrNull(pr.state) ?? 'OPEN', branch: textOrNull(pr.branch) }))
  return sortPrs(prs)
}

const priorEngineIdsOf = (raw, current) => {
  if (!Array.isArray(raw)) return []
  return raw.filter(id => typeof id === 'string' && id.length > 0 && id !== current)
}

const gitCommonDirOf = anchors => {
  if (!Array.isArray(anchors)) return null
  const anchor = anchors.find(candidate => isRecord(candidate) && typeof candidate.commonDir === 'string')
  return anchor === undefined ? null : anchor.commonDir
}

export const repoFromGitConfig = text => {
  const section = ORIGIN_SECTION.exec(text)
  if (section === null) return null
  const url = REMOTE_URL.exec(section[1])
  if (url === null) return null
  const repo = GITHUB_REPO.exec(url[1])
  return repo === null ? null : `${repo[1]}/${repo[2]}`
}

export const readRemoteRepo = async commonDir => {
  if (typeof commonDir !== 'string') return null
  try {
    const text = await fs.promises.readFile(path.join(commonDir, 'config'), 'utf8')
    return repoFromGitConfig(text)
  } catch {
    return null
  }
}

export const extractHostSession = text => {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(data) || typeof data.sessionId !== 'string' || typeof data.cliSessionId !== 'string') return null
  const title = typeof data.title === 'string' ? data.title : '(sans titre)'
  const fullPrs = prsOf(data.prs)
  const branch = textOrNull(data.branch) ?? fullPrs[0]?.branch ?? null
  const prBranches = fullPrs.map(pr => pr.branch).filter(candidate => candidate !== null)
  const branches = branch === null ? prBranches : [branch, ...prBranches]
  const prs = fullPrs.map(({ number, repo, url, state }) => ({ number, repo, url, state }))
  return {
    hostId: data.sessionId,
    engineId: data.cliSessionId,
    title,
    cwd: typeof data.cwd === 'string' ? data.cwd : '',
    lastActivityAt: typeof data.lastActivityAt === 'number' ? data.lastActivityAt : 0,
    isArchived: data.isArchived === true,
    gitCommonDir: gitCommonDirOf(data.gitAnchors),
    branch,
    prs,
    ticket: ticketOf(branches, title),
    priorEngineIds: priorEngineIdsOf(data.priorCliSessionIds, data.cliSessionId),
  }
}

const listEntries = async dir => {
  try {
    return await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

const subdirsOf = async dir => {
  const entries = await listEntries(dir)
  const dirs = entries.filter(entry => entry.isDirectory())
  return dirs.map(entry => path.join(dir, entry.name))
}

const jsonFilesOf = async dir => {
  const entries = await listEntries(dir)
  const files = entries.filter(entry => entry.isFile() && entry.name.endsWith('.json'))
  return files.map(entry => path.join(dir, entry.name))
}

const statOf = async file => {
  try {
    const stat = await fs.promises.stat(file)
    return { path: file, mtimeMs: stat.mtimeMs }
  } catch {
    return null
  }
}

export const scanHostFiles = async root => {
  const scanned = []
  const accountDirs = await subdirsOf(root)
  for (const accountDir of accountDirs) {
    const orgDirs = await subdirsOf(accountDir)
    for (const orgDir of orgDirs) {
      const files = await jsonFilesOf(orgDir)
      for (const file of files) {
        const stat = await statOf(file)
        if (stat !== null) scanned.push(stat)
      }
    }
  }
  return scanned
}

const readSession = async (read, file) => {
  try {
    const text = await read(file)
    return extractHostSession(text)
  } catch {
    return null
  }
}

export const refreshIndex = async (previous, scanned, read) => {
  const previousFiles = isRecord(previous.files) ? previous.files : {}
  const files = {}
  let changed = false
  for (const { path: file, mtimeMs } of scanned) {
    const known = previousFiles[file]
    if (known !== undefined && known.mtimeMs === mtimeMs) {
      files[file] = known
      continue
    }
    const session = await readSession(read, file)
    files[file] = { mtimeMs, session }
    changed = true
  }
  const previousCount = Object.keys(previousFiles).length
  const currentCount = Object.keys(files).length
  if (previousCount !== currentCount) changed = true
  return { index: { files }, changed }
}

export const loadIndex = file => {
  try {
    const text = fs.readFileSync(file, 'utf8')
    const data = JSON.parse(text)
    const isCurrent = isRecord(data) && data.version === INDEX_VERSION && isRecord(data.files)
    return { files: isCurrent ? data.files : {} }
  } catch {
    return { files: {} }
  }
}

const writeAtomically = (file, payload) => {
  const temporary = `${file}.tmp`
  fs.writeFileSync(temporary, payload)
  fs.renameSync(temporary, file)
}

export const saveIndex = (file, index) => {
  const payload = JSON.stringify({ version: INDEX_VERSION, files: index.files })
  writeAtomically(file, payload)
}

export const sessionsOf = index => {
  const indexed = Object.values(index.files)
  const sessions = indexed.map(entry => entry.session)
  return sessions.filter(session => session !== null)
}

export const saveSessionList = (file, index, live, remotes = new Map()) => {
  const sessions = sessionsOf(index)
  const hosts = sessions.map(({ priorEngineIds, ...session }) => ({ ...session, repo: session.prs[0]?.repo ?? remotes.get(session.gitCommonDir) ?? null }))
  const payload = JSON.stringify({ live, hosts })
  writeAtomically(file, payload)
}

export const readLiveEngineIds = async dir => {
  const files = await jsonFilesOf(dir)
  const ids = []
  for (const file of files) {
    try {
      const text = await fs.promises.readFile(file, 'utf8')
      const data = JSON.parse(text)
      if (isRecord(data) && typeof data.sessionId === 'string') ids.push(data.sessionId)
    } catch {
      continue
    }
  }
  return ids
}
