import crypto from 'node:crypto'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

import { loadIndex, readLiveEngineIds, readRemoteRepo, refreshIndex, saveIndex, saveSessionList, scanHostFiles, sessionsOf } from './session-index.mjs'
import { findMatches, hostsByEngineOf, isLocalHost, loadSearchCache, refreshSearchIndex, saveSearchCache, scanTranscriptFiles } from './search-index.mjs'

const [, , rootDir, portArg] = process.argv
const PORT = Number(portArg || 48123)
const INBOX = path.join(rootDir, 'inbox')
const MAX_BODY_BYTES = 40 * 1024 * 1024
const INDEX_FILE = path.join(rootDir, 'session-index.json')
const CACHE_FILE = path.join(rootDir, 'session-cache.json')
const SEARCH_CACHE_FILE = path.join(rootDir, 'search-cache.json')
const TRANSCRIPTS_DIR = path.join(os.homedir(), '.claude', 'projects')
const SEARCH_SAVE_MS = 60000
const INDEX_REFRESH_MS = 3000
const HOST_SESSIONS_DIR = path.join(process.env.APPDATA || '', 'Claude', 'claude-code-sessions')
const LIVE_SESSIONS_DIR = path.join(os.homedir(), '.claude', 'sessions')
const STATIC_FILES = {
  '/mod/assets/identity.js': 'text/javascript; charset=utf-8',
  '/mod/assets/dock.js': 'text/javascript; charset=utf-8',
  '/mod/assets/liquid-paper/theme.css': 'text/css; charset=utf-8',
  '/mod/assets/liquid-paper/bundle.css': 'text/css; charset=utf-8',
  '/mod/assets/liquid-paper/bundle.js': 'text/javascript; charset=utf-8',
}

const TOKEN = crypto.randomBytes(24).toString('hex')
const TOKEN_HEADER = 'x-cockpit-token'
const TOKEN_META_ANCHOR = '<head>'
const MAX_IMAGES = 10
const MAX_REASON_LENGTH = 500
const IMAGE_EXTENSIONS = new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/gif', 'gif'], ['image/webp', 'webp']])
const ENGINE_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/
const PARK_KINDS = new Set(['blocked', 'later'])
const UNSAFE_FOLDER_PATTERN = /[\u0000-\u001f";]/
const UNSAFE_FOR_CMD_PATTERN = /[&|<>^%!`]/
const FOREIGN_SITES = new Set(['cross-site', 'same-site'])
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'none'",
].join('; ')
const SECURITY_HEADERS = {
  'content-security-policy': CONTENT_SECURITY_POLICY,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const say = payload => process.stdout.write(`${JSON.stringify(payload)}\n`)

const readBody = request =>
  new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        chunks.length = 0
        request.removeAllListeners('data')
        request.resume()
        reject(new HttpError(413, 'corps trop volumineux'))
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })

const send = (response, status, body, type = 'application/json; charset=utf-8') => {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...SECURITY_HEADERS })
  response.end(body)
}

const serveFile = (response, name, type) => {
  try {
    const content = fs.readFileSync(path.join(rootDir, name))
    send(response, 200, content, type)
  } catch {
    send(response, 404, 'introuvable', 'text/plain; charset=utf-8')
  }
}

const servePage = response => {
  try {
    const html = fs.readFileSync(path.join(rootDir, 'conversations.html'), 'utf8')
    const meta = `${TOKEN_META_ANCHOR}<meta name="cockpit-token" content="${TOKEN}">`
    send(response, 200, html.replace(TOKEN_META_ANCHOR, () => meta), 'text/html; charset=utf-8')
  } catch {
    send(response, 404, 'introuvable', 'text/plain; charset=utf-8')
  }
}

const allowedOrigins = () => [`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]

const guardRead = (request, isPage) => {
  if (!isLocalHost(request.headers.host, PORT)) throw new HttpError(403, 'hôte refusé')
  const isForeign = FOREIGN_SITES.has(request.headers['sec-fetch-site'])
  const isNavigation = request.headers['sec-fetch-mode'] === 'navigate'
  if (isForeign && !(isPage && isNavigation)) throw new HttpError(403, 'origine refusée')
}

const tokenMatches = given => {
  if (typeof given !== 'string' || given.length !== TOKEN.length) return false
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(TOKEN))
}

const guardWrite = request => {
  guardRead(request, false)
  const origin = request.headers.origin
  if (origin !== undefined && !allowedOrigins().includes(origin)) throw new HttpError(403, 'origine refusée')
  if (!tokenMatches(request.headers[TOKEN_HEADER])) throw new HttpError(403, 'jeton refusé : recharge la page')
  const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json') throw new HttpError(415, 'JSON attendu')
}

const readJsonBody = async request => {
  const raw = await readBody(request)
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'requête invalide')
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'requête invalide')
  return body
}

const engineIdOf = body => {
  if (typeof body.engineId !== 'string' || !ENGINE_ID_PATTERN.test(body.engineId)) throw new HttpError(400, 'identifiant de conversation invalide')
  return body.engineId
}

const saveImages = images => {
  if (images.length === 0) return []
  if (images.length > MAX_IMAGES) throw new HttpError(400, 'trop d’images')
  const decoded = images.map(image => {
    const extension = IMAGE_EXTENSIONS.get(String(image?.type))
    if (extension === undefined || typeof image.base64 !== 'string') throw new HttpError(400, `image refusée (type ${String(image?.type).slice(0, 40)}), formats admis : png, jpeg, gif, webp`)
    return { extension, data: Buffer.from(image.base64, 'base64') }
  })
  fs.mkdirSync(INBOX, { recursive: true })
  return decoded.map(({ extension, data }) => {
    const file = path.join(INBOX, `${crypto.randomUUID()}.${extension}`)
    fs.writeFileSync(file, data)
    return file
  })
}

const comparable = folder => (process.platform === 'win32' ? folder.toLowerCase() : folder)

const isInside = (parent, child) => {
  const relative = path.relative(comparable(path.resolve(parent)), comparable(path.resolve(child)))
  const isOutside = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
  return !isOutside
}

const isBroadFolder = folder => {
  const isDriveRoot = path.resolve(folder) === path.parse(path.resolve(folder)).root
  return isDriveRoot || isInside(folder, os.homedir())
}

const isKnownFolder = folder => {
  const roots = sessionsOf(sessionIndex).map(session => session.cwd).filter(cwd => typeof cwd === 'string' && cwd !== '')
  const siblingsAllowed = root => !isBroadFolder(path.dirname(root)) && isInside(path.dirname(root), folder)
  return roots.some(root => isInside(root, folder) || siblingsAllowed(root))
}

const launchTerminal = (command, args, onError) => {
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true })
  child.on('error', onError)
  child.unref()
}

const openTerminal = cwd => {
  if (cwd === '' || UNSAFE_FOLDER_PATTERN.test(cwd) || !path.isAbsolute(cwd)) throw new HttpError(400, 'dossier invalide')
  if (!isKnownFolder(cwd)) throw new HttpError(403, 'dossier inconnu du cockpit')
  const isFolder = fs.existsSync(cwd) && fs.statSync(cwd).isDirectory()
  if (!isFolder) throw new HttpError(404, 'dossier introuvable')
  const viaCmd = () => {
    if (UNSAFE_FOR_CMD_PATTERN.test(cwd)) return reportError('terminal', new Error('dossier non ouvrable avec cmd'))
    launchTerminal('cmd.exe', ['/d', '/c', 'start', '""', 'wt.exe', '-d', cwd], error => reportError('terminal', error))
  }
  launchTerminal('wt.exe', ['-d', cwd], viaCmd)
}

const POST_ROUTES = {
  '/reply': body => {
    const engineId = engineIdOf(body)
    const images = saveImages(Array.isArray(body.images) ? body.images : [])
    say({ type: 'reply', engineId, text: String(body.text || ''), images })
  },
  '/terminal': body => openTerminal(typeof body.cwd === 'string' ? body.cwd : ''),
  '/park': body => {
    const engineId = engineIdOf(body)
    if (!PARK_KINDS.has(body.kind)) throw new HttpError(400, 'type de mise de côté invalide')
    say({ type: 'park', engineId, kind: body.kind, reason: String(body.reason || '').slice(0, MAX_REASON_LENGTH) })
  },
  '/unpark': body => say({ type: 'unpark', engineId: engineIdOf(body) }),
  '/ack': body => say({ type: 'ack', engineId: engineIdOf(body), seen: body.seen === true }),
  '/summarize': body => say({ type: 'summarize', engineId: engineIdOf(body) }),
}

const handleSearch = async (url, response) => {
  await refreshSearch()
  const sessions = sessionsOf(sessionIndex)
  const hosts = hostsByEngineOf(sessions)
  const found = findMatches(searchIndex, url.searchParams.get('q') || '', hosts)
  send(response, 200, JSON.stringify({ ok: true, ...found }))
}

const handleGet = async (url, request, response) => {
  const isPage = url.pathname === '/' || url.pathname === '/conversations.html'
  guardRead(request, isPage)
  if (isPage) return servePage(response)
  if (url.pathname === '/conversations-data.js') return serveFile(response, 'conversations-data.js', 'text/javascript; charset=utf-8')
  if (url.pathname === '/ping') return send(response, 200, '{"ok":true}')
  if (url.pathname === '/search') return handleSearch(url, response)
  const staticType = Object.hasOwn(STATIC_FILES, url.pathname) ? STATIC_FILES[url.pathname] : undefined
  if (staticType) return serveFile(response, url.pathname.slice(1), staticType)
  send(response, 404, 'introuvable', 'text/plain; charset=utf-8')
}

const handlePost = async (url, request, response) => {
  const route = Object.hasOwn(POST_ROUTES, url.pathname) ? POST_ROUTES[url.pathname] : undefined
  if (route === undefined) return send(response, 404, 'introuvable', 'text/plain; charset=utf-8')
  guardWrite(request)
  route(await readJsonBody(request))
  send(response, 202, '{"ok":true}')
}

const handle = async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  if (request.method === 'GET') return handleGet(url, request, response)
  if (request.method === 'POST') return handlePost(url, request, response)
  send(response, 405, 'méthode non permise', 'text/plain; charset=utf-8')
}

const server = http.createServer((request, response) => {
  handle(request, response).catch(error => {
    if (error instanceof HttpError) return send(response, error.status, JSON.stringify({ ok: false, error: error.message }))
    reportError('requête', error)
    send(response, 500, JSON.stringify({ ok: false, error: 'erreur interne du cockpit' }))
  })
})

server.on('error', error => {
  if (error.code === 'EADDRINUSE') process.exit(3)
  say({ type: 'error', message: String(error.message || error) })
  process.exit(1)
})

let sessionIndex = loadIndex(CACHE_FILE)
let savedLiveKey = null
let isIndexing = false
const remoteRepos = new Map()
let lastReportedError = ''
let searchIndex = { files: {} }
let searchRefresh = null
let isSearchDirty = false
let searchSavedAt = 0

const readText = file => fs.promises.readFile(file, 'utf8')

const reportError = (label, error) => {
  const message = `${label} : ${String(error.message || error)}`.slice(0, 200)
  if (message === lastReportedError) return
  lastReportedError = message
  say({ type: 'error', message })
}

const refreshSearch = () => {
  if (searchRefresh !== null) return searchRefresh
  searchRefresh = (async () => {
    try {
      const scanned = await scanTranscriptFiles(TRANSCRIPTS_DIR)
      const refreshed = await refreshSearchIndex(searchIndex, scanned, readText)
      searchIndex = refreshed.index
      isSearchDirty = isSearchDirty || refreshed.changed
      const isSaveDue = Date.now() - searchSavedAt >= SEARCH_SAVE_MS
      if (isSearchDirty && isSaveDue) {
        saveSearchCache(SEARCH_CACHE_FILE, searchIndex)
        searchSavedAt = Date.now()
        isSearchDirty = false
      }
    } catch (error) {
      reportError('index de recherche', error)
    } finally {
      searchRefresh = null
    }
  })()
  return searchRefresh
}

const resolveRemoteRepos = async index => {
  let isChanged = false
  const sessions = sessionsOf(index)
  for (const session of sessions) {
    const commonDir = session.gitCommonDir
    if (commonDir === null || remoteRepos.has(commonDir)) continue
    const repo = await readRemoteRepo(commonDir)
    remoteRepos.set(commonDir, repo)
    isChanged = true
  }
  return isChanged
}

const refreshSessionIndex = async () => {
  if (isIndexing) return
  isIndexing = true
  try {
    const scanned = await scanHostFiles(HOST_SESSIONS_DIR)
    const refreshed = await refreshIndex(sessionIndex, scanned, readText)
    const live = await readLiveEngineIds(LIVE_SESSIONS_DIR)
    const sortedLive = [...live].sort()
    const liveKey = sortedLive.join('|')
    sessionIndex = refreshed.index
    const remotesChanged = await resolveRemoteRepos(sessionIndex)
    if (!refreshed.changed && !remotesChanged && liveKey === savedLiveKey) return
    saveIndex(CACHE_FILE, sessionIndex)
    saveSessionList(INDEX_FILE, sessionIndex, live, remoteRepos)
    savedLiveKey = liveKey
  } catch (error) {
    reportError('relevé des sessions', error)
  } finally {
    isIndexing = false
  }
}

server.listen(PORT, '127.0.0.1', () => {
  say({ type: 'listening', port: PORT })
  void refreshSessionIndex()
  setInterval(refreshSessionIndex, INDEX_REFRESH_MS)
  searchIndex = loadSearchCache(SEARCH_CACHE_FILE)
  void refreshSearch()
})
