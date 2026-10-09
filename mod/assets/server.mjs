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

const say = payload => process.stdout.write(`${JSON.stringify(payload)}\n`)

const readBody = request =>
  new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('corps trop volumineux'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })

const send = (response, status, body, type = 'application/json; charset=utf-8') => {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
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

const extensionOf = mimeType => {
  const subtype = (mimeType || 'image/png').split('/')[1] || 'png'
  return subtype === 'jpeg' ? 'jpg' : subtype
}

const saveImages = images => {
  if (images.length === 0) return []
  fs.mkdirSync(INBOX, { recursive: true })
  const stamp = Date.now()
  return images.map((image, index) => {
    const file = path.join(INBOX, `${stamp}-${index + 1}.${extensionOf(image.type)}`)
    fs.writeFileSync(file, Buffer.from(image.base64, 'base64'))
    return file
  })
}

const openTerminal = cwd => {
  const isFolder = cwd.length > 0 && fs.existsSync(cwd) && fs.statSync(cwd).isDirectory()
  if (!isFolder) throw new Error(`dossier introuvable : ${cwd}`)
  const child = spawn('cmd.exe', ['/d', '/c', 'start', '""', 'wt.exe', '-d', cwd], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
}

const handle = async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  const isGet = request.method === 'GET'
  const isPost = request.method === 'POST'
  if (isGet && (url.pathname === '/' || url.pathname === '/conversations.html')) {
    return serveFile(response, 'conversations.html', 'text/html; charset=utf-8')
  }
  if (isGet && url.pathname === '/conversations-data.js') {
    return serveFile(response, 'conversations-data.js', 'text/javascript; charset=utf-8')
  }
  if (isGet && url.pathname === '/ping') return send(response, 200, '{"ok":true}')
  if (isGet && url.pathname === '/search') {
    if (!isLocalHost(request.headers.host, PORT)) return send(response, 403, '{"ok":false,"error":"hôte refusé"}')
    await refreshSearch()
    const sessions = sessionsOf(sessionIndex)
    const hosts = hostsByEngineOf(sessions)
    const query = url.searchParams.get('q') || ''
    const found = findMatches(searchIndex, query, hosts)
    return send(response, 200, JSON.stringify({ ok: true, ...found }))
  }
  const staticType = isGet && Object.hasOwn(STATIC_FILES, url.pathname) ? STATIC_FILES[url.pathname] : undefined
  if (staticType) return serveFile(response, url.pathname.slice(1), staticType)
  if (isPost && url.pathname === '/reply') {
    const raw = await readBody(request)
    const body = JSON.parse(raw)
    const images = saveImages(Array.isArray(body.images) ? body.images : [])
    say({ type: 'reply', engineId: String(body.engineId), text: String(body.text || ''), images })
    return send(response, 202, '{"ok":true}')
  }
  if (isPost && url.pathname === '/terminal') {
    const raw = await readBody(request)
    const body = JSON.parse(raw)
    openTerminal(String(body.cwd || ''))
    return send(response, 202, '{"ok":true}')
  }
  if (isPost && url.pathname === '/park') {
    const raw = await readBody(request)
    const body = JSON.parse(raw)
    say({ type: 'park', engineId: String(body.engineId), kind: String(body.kind), reason: String(body.reason || '') })
    return send(response, 202, '{"ok":true}')
  }
  if (isPost && url.pathname === '/unpark') {
    const raw = await readBody(request)
    const body = JSON.parse(raw)
    say({ type: 'unpark', engineId: String(body.engineId) })
    return send(response, 202, '{"ok":true}')
  }
  if (isPost && url.pathname === '/ack') {
    const raw = await readBody(request)
    const body = JSON.parse(raw)
    say({ type: 'ack', engineId: String(body.engineId), seen: body.seen === true })
    return send(response, 202, '{"ok":true}')
  }
  if (isPost && url.pathname === '/summarize') {
    const raw = await readBody(request)
    const body = JSON.parse(raw)
    say({ type: 'summarize', engineId: String(body.engineId) })
    return send(response, 202, '{"ok":true}')
  }
  send(response, 404, 'introuvable', 'text/plain; charset=utf-8')
}

const server = http.createServer((request, response) => {
  handle(request, response).catch(error => {
    send(response, 400, JSON.stringify({ ok: false, error: String(error.message || error) }))
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
