import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { createBridgeHub } from './bridge-hub.mjs'
import { createCockpitServer } from './cockpit-server.mjs'
import { createPermissionDesk } from './permission-desk.mjs'

const call = (port, method, route, { headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, method, path: route, headers: { host: `127.0.0.1:${port}`, ...headers } }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json = null
        try { json = JSON.parse(text) } catch { }
        resolve({ status: response.statusCode, json })
      })
    })
    request.on('error', reject)
    request.end(body)
  })

const withApp = async run => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-perm-'))
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-home-'))
  const secret = crypto.randomBytes(32).toString('hex')
  const proof = crypto.randomBytes(32).toString('hex')
  const hub = createBridgeHub()
  const desk = createPermissionDesk()
  const cockpit = createCockpitServer({ rootDir, port: 0, sink: order => hub.dispatch(order), homeDir: home, env: {}, bridge: { hub, desk, secret, proof } })
  try {
    const port = await cockpit.listen()
    const json = body => (body === undefined ? {} : { 'content-type': 'application/json' })
    const bridge = (method, route, body) => call(port, method, `/bridge/v1${route}`, {
      headers: { authorization: `Bearer ${secret}`, ...json(body) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const page = (method, route, body, token = cockpit.token) => call(port, method, route, {
      headers: { 'x-cockpit-token': token, ...json(body) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    await run({ bridge, page, desk })
  } finally {
    await cockpit.close()
    fs.rmSync(rootDir, { recursive: true, force: true })
    fs.rmSync(home, { recursive: true, force: true })
  }
}

const ASK = { engineId: 'conv-a', tool: 'Bash', summary: 'npm test', detail: 'npm test', canAlways: true }

test('a conversation asks, the island decides, the conversation gets the answer', async () => {
  await withApp(async ({ bridge, page }) => {
    const asked = await bridge('POST', '/permission/ask', ASK)
    assert.equal(asked.status, 200)
    const { requestId } = asked.json
    const listed = await page('GET', '/permissions')
    assert.equal(listed.status, 200)
    assert.deepEqual(listed.json.requests.map(entry => entry.requestId), [requestId])
    const waiting = bridge('GET', `/permission/wait?requestId=${requestId}&wait=5000`)
    const decided = await page('POST', '/permission', { requestId, decision: 'always' })
    assert.equal(decided.status, 202)
    assert.equal((await waiting).json.decision, 'always')
  })
})

test('a wait without answer returns no decision', async () => {
  await withApp(async ({ bridge }) => {
    const { requestId } = (await bridge('POST', '/permission/ask', ASK)).json
    const waited = await bridge('GET', `/permission/wait?requestId=${requestId}&wait=1000`)
    assert.equal(waited.status, 200)
    assert.equal(waited.json.decision, null)
  })
})

test('a withdrawn request leaves the island', async () => {
  await withApp(async ({ bridge, page }) => {
    const { requestId } = (await bridge('POST', '/permission/ask', ASK)).json
    assert.equal((await bridge('POST', '/permission/withdraw', { requestId })).status, 200)
    assert.deepEqual((await page('GET', '/permissions')).json.requests, [])
    assert.equal((await page('POST', '/permission', { requestId, decision: 'allow' })).status, 409)
  })
})

test('the page cannot read or decide without its token', async () => {
  await withApp(async ({ bridge, page }) => {
    const { requestId } = (await bridge('POST', '/permission/ask', ASK)).json
    assert.equal((await page('GET', '/permissions', undefined, 'nope')).status, 403)
    assert.equal((await page('POST', '/permission', { requestId, decision: 'allow' }, 'nope')).status, 403)
  })
})

test('a wrong decision or request id is refused', async () => {
  await withApp(async ({ bridge, page }) => {
    const { requestId } = (await bridge('POST', '/permission/ask', ASK)).json
    assert.equal((await page('POST', '/permission', { requestId, decision: 'maybe' })).status, 409)
    assert.equal((await bridge('GET', '/permission/wait?requestId=../x&wait=1000')).status, 400)
  })
})

test('a request without a conversation id is refused', async () => {
  await withApp(async ({ bridge }) => {
    const asked = await bridge('POST', '/permission/ask', { ...ASK, engineId: '' })
    assert.equal(asked.status, 400)
  })
})
