import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { createBridgeHub } from './bridge-hub.mjs'
import { createCockpitServer } from './cockpit-server.mjs'

const call = (port, method, route, { headers = {}, body, agent } = {}) =>
  new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, method, path: route, agent, headers: { host: `127.0.0.1:${port}`, ...headers } }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json = null
        try { json = JSON.parse(text) } catch { }
        resolve({ status: response.statusCode, text, json })
      })
    })
    request.on('error', reject)
    request.end(body)
  })

const withApp = async run => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-bridge-'))
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-home-'))
  const secret = crypto.randomBytes(32).toString('hex')
  const proof = crypto.randomBytes(32).toString('hex')
  const hub = createBridgeHub()
  const cockpit = createCockpitServer({ rootDir, port: 0, sink: order => hub.dispatch(order), homeDir: home, env: {}, bridge: { hub, secret, proof } })
  try {
    const port = await cockpit.listen()
    const bridge = (method, route, body, extraHeaders = {}) => call(port, method, route, {
      headers: { authorization: `Bearer ${secret}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const page = (route, body) => call(port, 'POST', route, {
      headers: { 'content-type': 'application/json', 'x-cockpit-token': cockpit.token },
      body: JSON.stringify(body),
    })
    await run({ port, secret, proof, hub, bridge, page })
  } finally {
    await cockpit.close()
    fs.rmSync(rootDir, { recursive: true, force: true })
    fs.rmSync(home, { recursive: true, force: true })
  }
}

const HELLO = { protocol: 1, engineId: 'conv-a', modVersion: 'test' }

test('the bridge refuses a caller without the secret, or with a wrong one', async () => {
  await withApp(async ({ port, bridge }) => {
    const missing = await call(port, 'POST', '/bridge/v1/hello', { headers: { 'content-type': 'application/json' }, body: JSON.stringify(HELLO) })
    assert.equal(missing.status, 401)
    const wrong = await bridge('POST', '/bridge/v1/hello', HELLO, { authorization: 'Bearer nope' })
    assert.equal(wrong.status, 401)
  })
})

test('the bridge refuses anything a browser sent', async () => {
  await withApp(async ({ bridge }) => {
    const withOrigin = await bridge('POST', '/bridge/v1/hello', HELLO, { origin: 'http://127.0.0.1' })
    assert.equal(withOrigin.status, 403)
    const withFetchSite = await bridge('POST', '/bridge/v1/hello', HELLO, { 'sec-fetch-site': 'same-origin' })
    assert.equal(withFetchSite.status, 403)
  })
})

test('the bridge refuses a foreign Host header (DNS rebinding)', async () => {
  await withApp(async ({ port, bridge }) => {
    const response = await bridge('POST', '/bridge/v1/hello', HELLO, { host: `evil.example:${port}` })
    assert.equal(response.status, 403)
  })
})

test('a mod of another protocol is told to update', async () => {
  await withApp(async ({ bridge }) => {
    const response = await bridge('POST', '/bridge/v1/hello', { ...HELLO, protocol: 2 })
    assert.equal(response.status, 426)
  })
})

test('hello proves the app knows the link, so the mod can trust its orders', async () => {
  await withApp(async ({ bridge, proof }) => {
    const response = await bridge('POST', '/bridge/v1/hello', HELLO)
    assert.equal(response.json.proof, proof)
  })
})

test('a malformed secret of the right length is refused, not an internal error', async () => {
  await withApp(async ({ bridge }) => {
    const response = await bridge('POST', '/bridge/v1/hello', HELLO, { authorization: 'Bearer ' + 'é'.repeat(64) })
    assert.equal(response.status, 401)
  })
})

test('the first conversation to say hello is the hub, the next one a peer', async () => {
  await withApp(async ({ bridge }) => {
    const first = await bridge('POST', '/bridge/v1/hello', HELLO)
    const second = await bridge('POST', '/bridge/v1/hello', { ...HELLO, engineId: 'conv-b' })
    assert.equal(first.json.role, 'hub')
    assert.equal(second.json.role, 'peer')
    assert.equal(typeof first.json.bridgeId, 'string')
  })
})

test('a reply from the page without any connected conversation is refused clearly', async () => {
  await withApp(async ({ page }) => {
    const response = await page('/reply', { engineId: 'conv-a', text: 'OK' })
    assert.equal(response.status, 503)
    assert.match(response.json.error, /conversation/)
  })
})

test('a reply from the page reaches the waiting conversation, which acknowledges it', async () => {
  await withApp(async ({ bridge, page }) => {
    const { json: hello } = await bridge('POST', '/bridge/v1/hello', HELLO)
    const waiting = bridge('GET', `/bridge/v1/orders?bridgeId=${hello.bridgeId}&wait=5000`)
    const sent = await page('/reply', { engineId: 'conv-a', text: 'GO' })
    assert.equal(sent.status, 202)
    const { json: polled } = await waiting
    assert.equal(polled.role, 'hub')
    assert.deepEqual(polled.orders.map(order => [order.type, order.engineId, order.text]), [['reply', 'conv-a', 'GO']])
    const acked = await bridge('POST', '/bridge/v1/ack', { bridgeId: hello.bridgeId, orderIds: [polled.orders[0].orderId] })
    assert.equal(acked.status, 200)
  })
})

test('an unknown bridge is told to say hello again', async () => {
  await withApp(async ({ bridge }) => {
    const response = await bridge('GET', '/bridge/v1/orders?bridgeId=unknown&wait=10')
    assert.equal(response.status, 404)
  })
})

test('when the hub conversation drops off the line, the peer becomes the hub at once', async () => {
  await withApp(async ({ port, secret, bridge }) => {
    const { json: host } = await bridge('POST', '/bridge/v1/hello', HELLO)
    const { json: peer } = await bridge('POST', '/bridge/v1/hello', { ...HELLO, engineId: 'conv-b' })
    const peerWaiting = bridge('GET', `/bridge/v1/orders?bridgeId=${peer.bridgeId}&wait=5000`)
    const dropped = http.request({ host: '127.0.0.1', port, method: 'GET', path: `/bridge/v1/orders?bridgeId=${host.bridgeId}&wait=5000`, headers: { host: `127.0.0.1:${port}`, authorization: `Bearer ${secret}` } })
    dropped.on('error', () => {})
    // Cut once the server holds the hub's wait: a fixed 100 ms from the start lost the race on a busy CI runner.
    await new Promise(resolve => dropped.end(resolve))
    await new Promise(resolve => setTimeout(resolve, 300))
    dropped.destroy()
    const { json: promoted } = await peerWaiting
    assert.equal(promoted.role, 'hub')
  })
})

test('a cockpit started without a bridge has no bridge routes', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-nobridge-'))
  const cockpit = createCockpitServer({ rootDir, port: 0, sink: () => {}, homeDir: rootDir, env: {} })
  try {
    const port = await cockpit.listen()
    const response = await call(port, 'POST', '/bridge/v1/hello', { headers: { 'content-type': 'application/json', authorization: 'Bearer x' }, body: JSON.stringify(HELLO) })
    assert.equal(response.status, 404)
  } finally {
    await cockpit.close()
    fs.rmSync(rootDir, { recursive: true, force: true })
  }
})
