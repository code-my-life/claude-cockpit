// HTTP routes the mod uses to reach the cockpit app. Only a caller holding the
// secret of link.json gets in, and never a browser: a mod sends no Origin and
// no Sec-Fetch-Site, a web page always does.
import { LINK_PROTOCOL } from './discovery.mjs'
import { HttpError, engineIdOf, guardHost, guardJson, readJsonBody, secretMatches, send } from './cockpit-server-http.mjs'

const BRIDGE_PREFIX = '/bridge/v1/'
const MAX_BRIDGE_BODY_BYTES = 64 * 1024
const MAX_ORDER_IDS = 100
const BRIDGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/
const DEFAULT_WAIT_MS = 20000
const BEARER = 'Bearer '

const guardBridge = (request, { port, secret }) => {
  guardHost(request, port)
  const isFromBrowser = request.headers.origin !== undefined || request.headers['sec-fetch-site'] !== undefined
  if (isFromBrowser) throw new HttpError(403, 'pont réservé au mod')
  const authorization = String(request.headers.authorization || '')
  const given = authorization.startsWith(BEARER) ? authorization.slice(BEARER.length) : ''
  if (!secretMatches(given, secret)) throw new HttpError(401, 'secret du pont refusé')
}

const bridgeIdOf = value => {
  if (typeof value !== 'string' || !BRIDGE_ID_PATTERN.test(value)) throw new HttpError(400, 'identifiant de pont invalide')
  return value
}

const sendJson = (response, payload) => send(response, 200, JSON.stringify({ ok: true, ...payload }))

const handleHello = async ({ hub }, request, response) => {
  guardJson(request)
  const body = await readJsonBody(request, MAX_BRIDGE_BODY_BYTES)
  if (body.protocol !== LINK_PROTOCOL) throw new HttpError(426, 'mod et app de versions différentes : redémarre Claude Desktop')
  const greeted = hub.hello({ engineId: engineIdOf(body) })
  sendJson(response, { ...greeted, waitMs: DEFAULT_WAIT_MS })
}

// Long wait for orders. A caller that hangs up before the answer is a
// conversation that closed: its bridge leaves at once so a peer takes over.
const handleOrders = async ({ hub }, url, response) => {
  const bridgeId = bridgeIdOf(url.searchParams.get('bridgeId'))
  const waitMs = Number(url.searchParams.get('wait')) || DEFAULT_WAIT_MS
  const hangUp = new AbortController()
  response.on('close', () => {
    if (response.writableFinished) return
    hangUp.abort()
    hub.leave(bridgeId)
  })
  const polled = await hub.waitForOrders(bridgeId, waitMs, hangUp.signal)
  if (hangUp.signal.aborted) return
  if (polled === null) throw new HttpError(404, 'pont inconnu : refais hello')
  sendJson(response, polled)
}

const handleAck = async ({ hub }, request, response) => {
  guardJson(request)
  const body = await readJsonBody(request, MAX_BRIDGE_BODY_BYTES)
  const orderIds = Array.isArray(body.orderIds) ? body.orderIds.filter(id => typeof id === 'string').slice(0, MAX_ORDER_IDS) : []
  hub.ack(bridgeIdOf(body.bridgeId), orderIds)
  sendJson(response, {})
}

export const isBridgeRoute = pathname => pathname.startsWith('/bridge/')

export const handleBridge = async (bridge, url, request, response) => {
  guardBridge(request, bridge)
  const route = `${request.method} ${url.pathname.slice(BRIDGE_PREFIX.length - 1)}`
  if (route === 'POST /hello') return handleHello(bridge, request, response)
  if (route === 'GET /orders') return handleOrders(bridge, url, response)
  if (route === 'POST /ack') return handleAck(bridge, request, response)
  throw new HttpError(404, 'route du pont inconnue')
}
