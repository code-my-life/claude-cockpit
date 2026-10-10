import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { createCockpitServer } from './cockpit-server.mjs'

const PAGE_TOKEN = 'c'.repeat(64)
const SESSION_COOKIE = `cockpit_session=${PAGE_TOKEN}`

const call = (port, method, route, { headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, method, path: route, headers: { host: `127.0.0.1:${port}`, ...headers } }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text: Buffer.concat(chunks).toString('utf8') }))
    })
    request.on('error', reject)
    request.end(body)
  })

const withCookieServer = async run => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-cookie-'))
  fs.writeFileSync(path.join(rootDir, 'conversations.html'), '<!doctype html><html><head><title>t</title></head><body>cockpit</body></html>')
  fs.writeFileSync(path.join(rootDir, 'conversations-data.js'), 'window.__CONVERSATIONS__ = {};')
  const orders = []
  const cockpit = createCockpitServer({ rootDir, port: 0, sink: order => orders.push(order), homeDir: rootDir, env: {}, pageAuth: 'cookie', token: PAGE_TOKEN })
  try {
    const port = await cockpit.listen()
    await run({ cockpit, port, orders })
  } finally {
    await cockpit.close()
    fs.rmSync(rootDir, { recursive: true, force: true })
  }
}

test('without the session cookie, the page asks to open the cockpit from the app', async () => {
  await withCookieServer(async ({ port }) => {
    const page = await call(port, 'GET', '/')
    assert.equal(page.status, 401)
    assert.match(page.headers['content-type'], /text\/html/)
    assert.match(page.text, /depuis l’app/)
    assert.doesNotMatch(page.text, new RegExp(PAGE_TOKEN))
  })
})

test('with the session cookie, the page is served without any token in it', async () => {
  await withCookieServer(async ({ port }) => {
    const page = await call(port, 'GET', '/', { headers: { cookie: SESSION_COOKIE } })
    assert.equal(page.status, 200)
    assert.match(page.text, /cockpit/)
    assert.doesNotMatch(page.text, /cockpit-token/)
  })
})

test('the data and the search need the session cookie too', async () => {
  await withCookieServer(async ({ port }) => {
    assert.equal((await call(port, 'GET', '/conversations-data.js')).status, 401)
    assert.equal((await call(port, 'GET', '/search?q=x')).status, 401)
    assert.equal((await call(port, 'GET', '/conversations-data.js', { headers: { cookie: SESSION_COOKIE } })).status, 200)
  })
})

test('an order sent with the session cookie is accepted, one without it is refused', async () => {
  await withCookieServer(async ({ port, orders }) => {
    const body = JSON.stringify({ engineId: 'abc', seen: true })
    const refused = await call(port, 'POST', '/ack', { headers: { 'content-type': 'application/json' }, body })
    assert.equal(refused.status, 403)
    const accepted = await call(port, 'POST', '/ack', { headers: { 'content-type': 'application/json', cookie: `other=1; ${SESSION_COOKIE}` }, body })
    assert.equal(accepted.status, 202)
    assert.equal(orders.filter(order => order.type === 'ack').length, 1)
  })
})

test('a one-time ticket opens the cockpit in a browser once, then never again', async () => {
  await withCookieServer(async ({ cockpit, port }) => {
    cockpit.allowTicket('ticket-123')
    const opened = await call(port, 'GET', '/open?ticket=ticket-123')
    assert.equal(opened.status, 302)
    assert.equal(opened.headers.location, '/')
    const [cookie] = opened.headers['set-cookie']
    assert.match(cookie, new RegExp(`^${SESSION_COOKIE};`))
    assert.match(cookie, /HttpOnly/)
    assert.match(cookie, /SameSite=Strict/)
    const reused = await call(port, 'GET', '/open?ticket=ticket-123')
    assert.equal(reused.status, 401)
  })
})

test('an unknown ticket opens nothing', async () => {
  await withCookieServer(async ({ port }) => {
    const response = await call(port, 'GET', '/open?ticket=made-up')
    assert.equal(response.status, 401)
    assert.equal(response.headers['set-cookie'], undefined)
  })
})
