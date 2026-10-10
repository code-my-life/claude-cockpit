import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { startAppServer, STARTER_MARK } from './app-server-core.mjs'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SECRET = 'b'.repeat(64)
const PAGE_TOKEN = 'd'.repeat(64)
const SESSION = { cookie: `cockpit_session=${PAGE_TOKEN}` }

const freePort = () =>
  new Promise(resolve => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })

const get = (port, route, headers = {}) =>
  new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: route, headers: { host: `127.0.0.1:${port}`, ...headers } }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString('utf8') }))
    }).on('error', reject)
  })

const withDataDir = async run => {
  const dataDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-app-')), 'data')
  try {
    await run(dataDir)
  } finally {
    fs.rmSync(path.dirname(dataDir), { recursive: true, force: true })
  }
}

const start = (dataDir, preferredPort) => startAppServer({ rootDir: ROOT_DIR, dataDir, secret: SECRET, pageToken: PAGE_TOKEN, preferredPort, homeDir: dataDir, env: {} })

test('the app serves on its preferred port when it is free', async () => {
  await withDataDir(async dataDir => {
    const preferredPort = await freePort()
    const started = await start(dataDir, preferredPort)
    try {
      assert.equal(started.port, preferredPort)
      assert.equal((await get(started.port, '/ping')).status, 200)
    } finally {
      await started.close()
    }
  })
})

test('the app falls back to a free port when an old mod holds the preferred one', async () => {
  await withDataDir(async dataDir => {
    const holder = net.createServer().listen(0, '127.0.0.1')
    await new Promise(resolve => holder.once('listening', resolve))
    const taken = holder.address().port
    const started = await start(dataDir, taken)
    try {
      assert.notEqual(started.port, taken)
      assert.equal((await get(started.port, '/ping')).status, 200)
    } finally {
      await started.close()
      holder.close()
    }
  })
})

test('before any conversation writes it, the app shows the cockpit page with no conversation', async () => {
  await withDataDir(async dataDir => {
    const started = await start(dataDir, 0)
    try {
      assert.equal((await get(started.port, '/')).status, 401)
      const page = await get(started.port, '/', SESSION)
      assert.equal(page.status, 200)
      assert.doesNotMatch(page.text, /<meta name="cockpit-token"/)
      assert.doesNotMatch(page.text, /<!--SEED-->/)
      const data = await get(started.port, '/conversations-data.js', SESSION)
      assert.match(data.text, /"rows":\[\]/)
    } finally {
      await started.close()
    }
  })
})

test('a starter page from an older version is written afresh', async () => {
  await withDataDir(async dataDir => {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(path.join(dataDir, 'conversations.html'), `${STARTER_MARK}<html><head></head><body>ancien gabarit</body></html>`)
    const started = await start(dataDir, 0)
    try {
      const page = (await get(started.port, '/', SESSION)).text
      assert.doesNotMatch(page, /ancien gabarit/)
      assert.match(page, /window.__CONVERSATIONS__/)
    } finally {
      await started.close()
    }
  })
})

test('pasted images older than a week are cleared at start, recent ones are kept', async () => {
  await withDataDir(async dataDir => {
    const inbox = path.join(dataDir, 'inbox')
    fs.mkdirSync(inbox, { recursive: true })
    const old = path.join(inbox, 'old.png')
    const recent = path.join(inbox, 'recent.png')
    fs.writeFileSync(old, 'x')
    fs.writeFileSync(recent, 'x')
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000)
    fs.utimesSync(old, eightDaysAgo, eightDaysAgo)
    const started = await start(dataDir, 0)
    try {
      assert.ok(!fs.existsSync(old))
      assert.ok(fs.existsSync(recent))
    } finally {
      await started.close()
    }
  })
})

test('a page already written by a conversation is left as it is', async () => {
  await withDataDir(async dataDir => {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(path.join(dataDir, 'conversations.html'), '<html><head></head><body>page du hub</body></html>')
    const started = await start(dataDir, 0)
    try {
      assert.match((await get(started.port, '/', SESSION)).text, /page du hub/)
    } finally {
      await started.close()
    }
  })
})
