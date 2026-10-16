import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.mjs')
const PORT = 48000 + Math.floor(Math.random() * 1000)
const START_TIMEOUT_MS = 10000
const PNG_BASE64 = 'iVBORw0KGgo='

let rootDir = ''
let child = null
let token = ''
const messages = []

const waitForListening = () =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('serveur non démarré')), START_TIMEOUT_MS)
    let buffer = ''
    child.stdout.on('data', chunk => {
      buffer += chunk.toString('utf8')
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const message = JSON.parse(line)
        messages.push(message)
        if (message.type === 'listening') {
          clearTimeout(timer)
          resolve()
        }
      }
    })
    child.on('exit', code => reject(new Error(`serveur arrêté (${code})`)))
  })

const call = (method, route, { headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port: PORT, method, path: route, headers: { host: `127.0.0.1:${PORT}`, ...headers } }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text: Buffer.concat(chunks).toString('utf8') }))
    })
    request.on('error', reject)
    request.end(body)
  })

// The server answers the HTTP request before its line reaches our standard
// output reader: wait for the message instead of reading it at once.
const MESSAGE_WAIT_MS = 3000
const waitForMessage = async predicate => {
  const deadline = Date.now() + MESSAGE_WAIT_MS
  while (Date.now() < deadline) {
    const found = messages.findLast(predicate)
    if (found !== undefined) return found
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return undefined
}

const postJson = (route, payload, extraHeaders = {}) =>
  call('POST', route, {
    headers: { 'content-type': 'application/json', 'x-cockpit-token': token, ...extraHeaders },
    body: JSON.stringify(payload),
  })

before(async () => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-server-'))
  fs.writeFileSync(path.join(rootDir, 'conversations.html'), '<!doctype html><html><head><title>t</title></head><body></body></html>')
  fs.writeFileSync(path.join(rootDir, 'conversations-data.js'), 'window.__CONVERSATIONS__ = {};')
  const env = { ...process.env, LOCALAPPDATA: rootDir, XDG_RUNTIME_DIR: rootDir }
  child = spawn(process.execPath, [SERVER, rootDir, String(PORT)], { env, stdio: ['ignore', 'pipe', 'ignore'] })
  await waitForListening()
  const page = await call('GET', '/')
  token = /<meta name="cockpit-token" content="([0-9a-f]+)">/.exec(page.text)?.[1] ?? ''
})

after(() => {
  child?.kill()
  fs.rmSync(rootDir, { recursive: true, force: true })
})

test('the page served to the cockpit carries a session token', () => {
  assert.match(token, /^[0-9a-f]{32,}$/)
})

test('the page is served with security headers', async () => {
  const page = await call('GET', '/')
  assert.equal(page.headers['x-content-type-options'], 'nosniff')
  assert.equal(page.headers['x-frame-options'], 'DENY')
  assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/)
})

test('a request with a foreign Host header is refused (DNS rebinding)', async () => {
  const page = await call('GET', '/ping', { headers: { host: `evil.example:${PORT}` } })
  assert.equal(page.status, 403)
})

test('a POST without the token is refused', async () => {
  const response = await call('POST', '/ack', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ engineId: 'abc' }) })
  assert.equal(response.status, 403)
})

test('a POST with a wrong token is refused', async () => {
  const response = await postJson('/ack', { engineId: 'abc' }, { 'x-cockpit-token': 'nope' })
  assert.equal(response.status, 403)
})

test('a POST that is not JSON is refused (simple cross-site requests)', async () => {
  const response = await call('POST', '/ack', { headers: { 'content-type': 'text/plain', 'x-cockpit-token': token }, body: JSON.stringify({ engineId: 'abc' }) })
  assert.equal(response.status, 415)
})

test('a POST coming from a foreign Origin is refused', async () => {
  const response = await postJson('/ack', { engineId: 'abc' }, { origin: 'https://evil.example' })
  assert.equal(response.status, 403)
})

test('a valid POST is accepted and reaches the mod', async () => {
  const response = await postJson('/ack', { engineId: 'abc-123', seen: true }, { origin: `http://127.0.0.1:${PORT}` })
  assert.equal(response.status, 202)
  assert.ok(await waitForMessage(message => message.type === 'ack' && message.engineId === 'abc-123' && message.seen === true))
})

test('an engine id with unexpected characters is refused', async () => {
  const response = await postJson('/ack', { engineId: '../../x' })
  assert.equal(response.status, 400)
})

test('malformed JSON gives a generic error, not the parser message', async () => {
  const response = await call('POST', '/ack', { headers: { 'content-type': 'application/json', 'x-cockpit-token': token }, body: '{oops' })
  assert.equal(response.status, 400)
  assert.doesNotMatch(response.text, /JSON|position|token o/i)
})

test('the data file is not served to a cross-site script include', async () => {
  const crossSite = await call('GET', '/conversations-data.js', { headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'script' } })
  assert.equal(crossSite.status, 403)
  const sameSite = await call('GET', '/conversations-data.js', { headers: { 'sec-fetch-site': 'same-site' } })
  assert.equal(sameSite.status, 403)
  const sameOrigin = await call('GET', '/conversations-data.js', { headers: { 'sec-fetch-site': 'same-origin' } })
  assert.equal(sameOrigin.status, 200)
})

test('a pasted image cannot escape the inbox through its mime type', async () => {
  const before = fs.readdirSync(rootDir)
  const response = await postJson('/reply', { engineId: 'abc', text: 'x', images: [{ type: 'image/png\\..\\..\\evil', base64: PNG_BASE64 }] })
  assert.equal(response.status, 400)
  assert.deepEqual(fs.readdirSync(rootDir), before)
})

test('a pasted image is stored in the inbox under a generated name', async () => {
  const response = await postJson('/reply', { engineId: 'abc', text: 'hello', images: [{ type: 'image/jpeg', base64: PNG_BASE64 }] })
  assert.equal(response.status, 202)
  const reply = await waitForMessage(message => message.type === 'reply' && message.text === 'hello')
  assert.equal(reply.images.length, 1)
  assert.equal(path.dirname(reply.images[0]), path.join(rootDir, 'inbox'))
  assert.match(path.basename(reply.images[0]), /^[0-9a-f-]{36}\.jpg$/)
})

test('a terminal cannot be opened on a folder the cockpit does not know', async () => {
  const response = await postJson('/terminal', { cwd: os.tmpdir() })
  assert.equal(response.status, 403)
})

test('a terminal folder with wt command separators or control characters is refused', async () => {
  for (const cwd of ['C:\\repos\\a;new-tab', 'C:\\repos\\a\nb', 'relative\\folder']) {
    const response = await postJson('/terminal', { cwd })
    assert.equal(response.status, 400, cwd)
  }
})

test('an oversized body gets a 413, not a generic error', async () => {
  const response = await postJson('/reply', { engineId: 'abc', text: 'x'.repeat(41 * 1024 * 1024) })
  assert.equal(response.status, 413)
})
