import crypto from 'node:crypto'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

import { loadIndex, readLiveEngineIds, readRemoteRepo, refreshIndex, saveIndex, saveSessionList, scanHostFiles, sessionsOf } from './session-index.mjs'
import { findMatches, hostsByEngineOf, loadSearchCache, refreshSearchIndex, saveSearchCache, scanTranscriptFiles } from './search-index.mjs'
import { hostSessionsDirOf, terminalCandidatesOf } from './terminal.mjs'
import { HttpError, engineIdOf, guardHost, guardJson, readJsonBody, send, sendNotFound } from './cockpit-server-http.mjs'
import { handleBridge, isBridgeRoute } from './bridge-routes.mjs'
import { createPageSession, sendNeedsApp } from './page-session.mjs'

const SEARCH_SAVE_MS = 60000
const INDEX_REFRESH_MS = 3000
const STATIC_FILES = {
  '/mod/assets/identity-motion.js': 'text/javascript; charset=utf-8',
  '/mod/assets/identity.js': 'text/javascript; charset=utf-8',
  '/mod/assets/identity-chrome.js': 'text/javascript; charset=utf-8',
  '/mod/assets/identity-badge.js': 'text/javascript; charset=utf-8',
  '/mod/assets/identity-sound.js': 'text/javascript; charset=utf-8',
  '/mod/assets/dock.js': 'text/javascript; charset=utf-8',
  '/mod/assets/island-model.js': 'text/javascript; charset=utf-8',
  '/mod/assets/island-ui.js': 'text/javascript; charset=utf-8',
  '/mod/assets/island-actions.js': 'text/javascript; charset=utf-8',
  '/mod/assets/island-motion.js': 'text/javascript; charset=utf-8',
  '/mod/assets/island-living.js': 'text/javascript; charset=utf-8',
  '/mod/assets/island-views.js': 'text/javascript; charset=utf-8',
  '/mod/assets/island-deck.js': 'text/javascript; charset=utf-8',
  '/mod/assets/island-shell.js': 'text/javascript; charset=utf-8',
  '/mod/assets/island.css': 'text/css; charset=utf-8',
  '/mod/assets/entity/entity.js': 'text/javascript; charset=utf-8',
  '/mod/assets/entity/entity-forms.js': 'text/javascript; charset=utf-8',
  '/mod/assets/entity/entity-2d.js': 'text/javascript; charset=utf-8',
  '/mod/assets/entity/entity-mount.js': 'text/javascript; charset=utf-8',
  '/mod/assets/island.js': 'text/javascript; charset=utf-8',
  '/mod/assets/liquid-paper/theme.css': 'text/css; charset=utf-8',
  '/mod/assets/liquid-paper/bundle.css': 'text/css; charset=utf-8',
  '/mod/assets/liquid-paper/bundle.js': 'text/javascript; charset=utf-8',
  '/mod/assets/cards.js': 'text/javascript; charset=utf-8',
  '/mod/assets/systems-generator/index.global.js': 'text/javascript; charset=utf-8',
  '/mod/assets/systems-generator/cards.css': 'text/css; charset=utf-8',
}
const TOKEN_HEADER = 'x-cockpit-token'
const TOKEN_META_ANCHOR = '<head>'
const MAX_IMAGES = 10
const MAX_REASON_LENGTH = 500
const IMAGE_EXTENSIONS = new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/gif', 'gif'], ['image/webp', 'webp']])
const PARK_KINDS = new Set(['blocked', 'later'])
const UNSAFE_FOLDER_PATTERN = /[\x00-\x1f";]/
const FOREIGN_SITES = new Set(['cross-site', 'same-site'])
const comparable = folder => (process.platform === 'win32' ? folder.toLowerCase() : folder)

const isInside = (parent, child) => {
  const relative = path.relative(comparable(path.resolve(parent)), comparable(path.resolve(child)))
  const isOutside = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
  return !isOutside
}

const isBroadFolder = (folder, homeDir) => {
  const isDriveRoot = path.resolve(folder) === path.parse(path.resolve(folder)).root
  return isDriveRoot || isInside(folder, homeDir)
}

// Everything one cockpit server needs: the fixed assets (`rootDir`), where it
// reads and writes the page, index and pasted images (`dataDir`), its port,
// its session token, and where the orders for the mod go (`sink`).
const contextOf = ({ rootDir, dataDir = rootDir, port, sink, bridge = null, pageAuth = 'meta', token = crypto.randomBytes(24).toString('hex'), homeDir = os.homedir(), env = process.env }) => ({
  rootDir,
  dataDir,
  port,
  sink,
  bridge,
  homeDir,
  token,
  session: createPageSession({ mode: pageAuth, token }),
  inbox: path.join(dataDir, 'inbox'),
  indexFile: path.join(dataDir, 'session-index.json'),
  cacheFile: path.join(dataDir, 'session-cache.json'),
  searchCacheFile: path.join(dataDir, 'search-cache.json'),
  transcriptsDir: path.join(homeDir, '.claude', 'projects'),
  hostSessionsDir: hostSessionsDirOf(process.platform, homeDir, env),
  liveSessionsDir: path.join(homeDir, '.claude', 'sessions'),
  state: {
    sessionIndex: loadIndex(path.join(dataDir, 'session-cache.json')),
    savedLiveKey: null,
    isIndexing: false,
    remoteRepos: new Map(),
    lastReportedError: '',
    searchIndex: { files: {} },
    searchRefresh: null,
    isSearchDirty: false,
    searchSavedAt: 0,
    indexTimer: null,
  },
})

const reportError = (ctx, label, error) => {
  const message = `${label} : ${String(error.message || error)}`.slice(0, 200)
  if (message === ctx.state.lastReportedError) return
  ctx.state.lastReportedError = message
  ctx.sink({ type: 'error', message })
}

const serveFile = (folder, response, name, type) => {
  try {
    const content = fs.readFileSync(path.join(folder, name))
    send(response, 200, content, type)
  } catch {
    sendNotFound(response)
  }
}

const servePage = (ctx, response) => {
  try {
    const html = fs.readFileSync(path.join(ctx.dataDir, 'conversations.html'), 'utf8')
    if (ctx.session.usesCookie) return send(response, 200, html, 'text/html; charset=utf-8')
    const meta = `${TOKEN_META_ANCHOR}<meta name="cockpit-token" content="${ctx.token}">`
    send(response, 200, html.replace(TOKEN_META_ANCHOR, () => meta), 'text/html; charset=utf-8')
  } catch {
    sendNotFound(response)
  }
}

const guardRead = (ctx, request, isPage) => {
  guardHost(request, ctx.port)
  const isForeign = FOREIGN_SITES.has(request.headers['sec-fetch-site'])
  const isNavigation = request.headers['sec-fetch-mode'] === 'navigate'
  if (isForeign && !(isPage && isNavigation)) throw new HttpError(403, 'origine refusée')
}

const guardWrite = (ctx, request) => {
  guardRead(ctx, request, false)
  const origin = request.headers.origin
  const allowedOrigins = [`http://127.0.0.1:${ctx.port}`, `http://localhost:${ctx.port}`]
  if (origin !== undefined && !allowedOrigins.includes(origin)) throw new HttpError(403, 'origine refusée')
  if (!ctx.session.canWrite(request, request.headers[TOKEN_HEADER])) throw new HttpError(403, 'jeton refusé : recharge la page')
  guardJson(request)
}

const saveImages = (ctx, images) => {
  if (images.length === 0) return []
  if (images.length > MAX_IMAGES) throw new HttpError(400, 'trop d’images')
  const decoded = images.map(image => {
    const extension = IMAGE_EXTENSIONS.get(String(image?.type))
    if (extension === undefined || typeof image.base64 !== 'string') throw new HttpError(400, `image refusée (type ${String(image?.type).slice(0, 40)}), formats admis : png, jpeg, gif, webp`)
    return { extension, data: Buffer.from(image.base64, 'base64') }
  })
  fs.mkdirSync(ctx.inbox, { recursive: true })
  return decoded.map(({ extension, data }) => {
    const file = path.join(ctx.inbox, `${crypto.randomUUID()}.${extension}`)
    fs.writeFileSync(file, data)
    return file
  })
}

const isKnownFolder = (ctx, folder) => {
  const roots = sessionsOf(ctx.state.sessionIndex).map(session => session.cwd).filter(cwd => typeof cwd === 'string' && cwd !== '')
  const siblingsAllowed = root => !isBroadFolder(path.dirname(root), ctx.homeDir) && isInside(path.dirname(root), folder)
  return roots.some(root => isInside(root, folder) || siblingsAllowed(root))
}

const launchFirstWorking = (ctx, candidates) => {
  const [candidate, ...others] = candidates
  if (candidate === undefined) return reportError(ctx, 'terminal', new Error('aucun terminal disponible'))
  const child = spawn(candidate.command, candidate.args, { detached: true, stdio: 'ignore', windowsHide: true })
  child.on('error', () => launchFirstWorking(ctx, others))
  child.unref()
}

const openTerminal = (ctx, cwd) => {
  if (cwd === '' || UNSAFE_FOLDER_PATTERN.test(cwd) || !path.isAbsolute(cwd)) throw new HttpError(400, 'dossier invalide')
  if (!isKnownFolder(ctx, cwd)) throw new HttpError(403, 'dossier inconnu du cockpit')
  const isFolder = fs.existsSync(cwd) && fs.statSync(cwd).isDirectory()
  if (!isFolder) throw new HttpError(404, 'dossier introuvable')
  launchFirstWorking(ctx, terminalCandidatesOf(process.platform, cwd))
}

const NO_BRIDGE_MESSAGE = 'Ordre non transmis : aucune conversation avec le mod n’est ouverte, ou trop d’ordres attendent déjà. Ouvre une conversation Claude puis réessaie.'

// The sink answers false when nobody can carry the order (app mode, no bridge).
const deliver = (ctx, order) => {
  if (ctx.sink(order) === false) throw new HttpError(503, NO_BRIDGE_MESSAGE)
}

const postRoutesOf = ctx => ({
  '/reply': body => {
    const engineId = engineIdOf(body)
    const images = saveImages(ctx, Array.isArray(body.images) ? body.images : [])
    deliver(ctx, { type: 'reply', engineId, text: String(body.text || ''), images })
  },
  '/terminal': body => openTerminal(ctx, typeof body.cwd === 'string' ? body.cwd : ''),
  '/park': body => {
    const engineId = engineIdOf(body)
    if (!PARK_KINDS.has(body.kind)) throw new HttpError(400, 'type de mise de côté invalide')
    deliver(ctx, { type: 'park', engineId, kind: body.kind, reason: String(body.reason || '').slice(0, MAX_REASON_LENGTH) })
  },
  '/unpark': body => deliver(ctx, { type: 'unpark', engineId: engineIdOf(body) }),
  '/ack': body => deliver(ctx, { type: 'ack', engineId: engineIdOf(body), seen: body.seen === true }),
  '/summarize': body => deliver(ctx, { type: 'summarize', engineId: engineIdOf(body) }),
  '/permission': body => {
    const desk = deskOf(ctx)
    if (!desk.decide(String(body.requestId ?? ''), body.decision)) throw new HttpError(409, 'demande de permission déjà traitée ou inconnue')
  },
})

const deskOf = ctx => {
  const desk = ctx.bridge?.desk
  if (desk === undefined || desk === null) throw new HttpError(404, 'permissions disponibles avec l’app seulement')
  return desk
}

// The open permission requests show what a conversation wants to run: only the
// page that holds the session token may read them.
const handlePermissions = (ctx, request, response) => {
  if (!ctx.session.canWrite(request, request.headers[TOKEN_HEADER])) throw new HttpError(403, 'jeton refusé : recharge la page')
  send(response, 200, JSON.stringify({ ok: true, requests: deskOf(ctx).list() }))
}

const readText = file => fs.promises.readFile(file, 'utf8')

const refreshSearch = ctx => {
  const { state } = ctx
  if (state.searchRefresh !== null) return state.searchRefresh
  state.searchRefresh = (async () => {
    try {
      const scanned = await scanTranscriptFiles(ctx.transcriptsDir)
      const refreshed = await refreshSearchIndex(state.searchIndex, scanned, readText)
      state.searchIndex = refreshed.index
      state.isSearchDirty = state.isSearchDirty || refreshed.changed
      const isSaveDue = Date.now() - state.searchSavedAt >= SEARCH_SAVE_MS
      if (state.isSearchDirty && isSaveDue) {
        saveSearchCache(ctx.searchCacheFile, state.searchIndex)
        state.searchSavedAt = Date.now()
        state.isSearchDirty = false
      }
    } catch (error) {
      reportError(ctx, 'index de recherche', error)
    } finally {
      state.searchRefresh = null
    }
  })()
  return state.searchRefresh
}

const resolveRemoteRepos = async (ctx, index) => {
  let isChanged = false
  for (const session of sessionsOf(index)) {
    const commonDir = session.gitCommonDir
    if (commonDir === null || ctx.state.remoteRepos.has(commonDir)) continue
    ctx.state.remoteRepos.set(commonDir, await readRemoteRepo(commonDir))
    isChanged = true
  }
  return isChanged
}

const refreshSessionIndex = async ctx => {
  const { state } = ctx
  if (state.isIndexing) return
  state.isIndexing = true
  try {
    const scanned = await scanHostFiles(ctx.hostSessionsDir)
    const refreshed = await refreshIndex(state.sessionIndex, scanned, readText)
    const live = await readLiveEngineIds(ctx.liveSessionsDir)
    const liveKey = [...live].sort().join('|')
    state.sessionIndex = refreshed.index
    const remotesChanged = await resolveRemoteRepos(ctx, state.sessionIndex)
    if (!refreshed.changed && !remotesChanged && liveKey === state.savedLiveKey) return
    saveIndex(ctx.cacheFile, state.sessionIndex)
    saveSessionList(ctx.indexFile, state.sessionIndex, live, state.remoteRepos)
    state.savedLiveKey = liveKey
  } catch (error) {
    reportError(ctx, 'relevé des sessions', error)
  } finally {
    state.isIndexing = false
  }
}

const handleSearch = async (ctx, url, response) => {
  await refreshSearch(ctx)
  const hosts = hostsByEngineOf(sessionsOf(ctx.state.sessionIndex))
  const found = findMatches(ctx.state.searchIndex, url.searchParams.get('q') || '', hosts)
  send(response, 200, JSON.stringify({ ok: true, ...found }))
}

const SESSION_ROUTES = new Set(['/', '/conversations.html', '/conversations-data.js', '/search'])

const handleGet = async (ctx, url, request, response) => {
  const isOpening = url.pathname === '/open'
  const isPage = url.pathname === '/' || url.pathname === '/conversations.html' || isOpening
  guardRead(ctx, request, isPage)
  if (isOpening) return ctx.session.redeem(response, url.searchParams.get('ticket') || '')
  if (SESSION_ROUTES.has(url.pathname) && !ctx.session.isAllowed(request)) return sendNeedsApp(response)
  if (isPage) return servePage(ctx, response)
  if (url.pathname === '/conversations-data.js') return serveFile(ctx.dataDir, response, 'conversations-data.js', 'text/javascript; charset=utf-8')
  if (url.pathname === '/ping') return send(response, 200, '{"ok":true}')
  if (url.pathname === '/search') return handleSearch(ctx, url, response)
  if (url.pathname === '/permissions') return handlePermissions(ctx, request, response)
  const staticType = Object.hasOwn(STATIC_FILES, url.pathname) ? STATIC_FILES[url.pathname] : undefined
  if (staticType) return serveFile(ctx.rootDir, response, url.pathname.slice(1), staticType)
  sendNotFound(response)
}

const handlePost = async (ctx, routes, url, request, response) => {
  const route = Object.hasOwn(routes, url.pathname) ? routes[url.pathname] : undefined
  if (route === undefined) return sendNotFound(response)
  guardWrite(ctx, request)
  route(await readJsonBody(request))
  send(response, 202, '{"ok":true}')
}

const handlerOf = ctx => {
  const routes = postRoutesOf(ctx)
  return async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    if (isBridgeRoute(url.pathname)) {
      if (ctx.bridge === null) return sendNotFound(response)
      return handleBridge({ ...ctx.bridge, port: ctx.port }, url, request, response)
    }
    if (request.method === 'GET') return handleGet(ctx, url, request, response)
    if (request.method === 'POST') return handlePost(ctx, routes, url, request, response)
    send(response, 405, 'méthode non permise', 'text/plain; charset=utf-8')
  }
}

const startIndexing = ctx => {
  void refreshSessionIndex(ctx)
  ctx.state.indexTimer = setInterval(() => refreshSessionIndex(ctx), INDEX_REFRESH_MS)
  ctx.state.searchIndex = loadSearchCache(ctx.searchCacheFile)
  void refreshSearch(ctx)
}

// Builds a cockpit server. `listen()` resolves with the port once bound and
// starts indexing; it rejects with the listen error (EADDRINUSE included).
export const createCockpitServer = options => {
  const ctx = contextOf(options)
  const handle = handlerOf(ctx)
  const server = http.createServer((request, response) => {
    handle(request, response).catch(error => {
      if (error instanceof HttpError) return send(response, error.status, JSON.stringify({ ok: false, error: error.message }))
      reportError(ctx, 'requête', error)
      send(response, 500, JSON.stringify({ ok: false, error: 'erreur interne du cockpit' }))
    })
  })
  const listen = () =>
    new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(ctx.port, '127.0.0.1', () => {
        server.off('error', reject)
        ctx.port = server.address().port
        startIndexing(ctx)
        resolve(ctx.port)
      })
    })
  const close = () =>
    new Promise(resolve => {
      clearInterval(ctx.state.indexTimer)
      server.close(() => resolve())
    })
  return { server, token: ctx.token, listen, close, allowTicket: ctx.session.allowTicket }
}
