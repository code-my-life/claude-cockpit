import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { createCockpitServer } from './cockpit-server.mjs'

const call = (port, method, route, { headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, method, path: route, headers: { host: `127.0.0.1:${port}`, ...headers } }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString('utf8') }))
    })
    request.on('error', reject)
    request.end(body)
  })

const withServer = async run => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-factory-'))
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-home-'))
  const orders = []
  const cockpit = createCockpitServer({ rootDir, port: 0, sink: order => orders.push(order), homeDir: home, env: {} })
  try {
    const port = await cockpit.listen()
    await run({ cockpit, port, orders })
  } finally {
    await cockpit.close()
    fs.rmSync(rootDir, { recursive: true, force: true })
    fs.rmSync(home, { recursive: true, force: true })
  }
}

test('the factory listens on a free port when asked for port 0', async () => {
  await withServer(async ({ port }) => {
    assert.ok(port > 0)
    const ping = await call(port, 'GET', '/ping')
    assert.equal(ping.status, 200)
  })
})

test('an order posted to the factory server reaches the sink, not standard output', async () => {
  await withServer(async ({ cockpit, port, orders }) => {
    const response = await call(port, 'POST', '/ack', {
      headers: { 'content-type': 'application/json', 'x-cockpit-token': cockpit.token },
      body: JSON.stringify({ engineId: 'abc', seen: true }),
    })
    assert.equal(response.status, 202)
    assert.deepEqual(orders.filter(order => order.type === 'ack'), [{ type: 'ack', engineId: 'abc', seen: true }])
  })
})

test('the identity scripts (motion, volumes, chrome, badge) are served from the assets folder', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-root-'))
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-data-'))
  fs.mkdirSync(path.join(rootDir, 'mod', 'assets'), { recursive: true })
  const names = ['identity-motion.js', 'identity.js', 'identity-chrome.js', 'identity-badge.js', 'identity-sound.js']
  for (const name of names) fs.writeFileSync(path.join(rootDir, 'mod', 'assets', name), `// ${name}`)
  const cockpit = createCockpitServer({ rootDir, dataDir, port: 0, sink: () => {}, homeDir: dataDir, env: {} })
  try {
    const port = await cockpit.listen()
    for (const name of names) {
      const asset = await call(port, 'GET', `/mod/assets/${name}`)
      assert.equal(asset.text, `// ${name}`)
    }
  } finally {
    await cockpit.close()
  }
})

test('with a data folder, the page and pasted images live there while the fixed assets stay in the root', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-root-'))
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-data-'))
  fs.mkdirSync(path.join(rootDir, 'mod', 'assets'), { recursive: true })
  fs.writeFileSync(path.join(rootDir, 'mod', 'assets', 'identity.js'), '// identity')
  fs.writeFileSync(path.join(dataDir, 'conversations.html'), '<html><head></head><body>page du hub</body></html>')
  const orders = []
  const cockpit = createCockpitServer({ rootDir, dataDir, port: 0, sink: order => orders.push(order), homeDir: dataDir, env: {} })
  try {
    const port = await cockpit.listen()
    const page = await call(port, 'GET', '/')
    assert.match(page.text, /page du hub/)
    const asset = await call(port, 'GET', '/mod/assets/identity.js')
    assert.equal(asset.text, '// identity')
    await call(port, 'POST', '/reply', {
      headers: { 'content-type': 'application/json', 'x-cockpit-token': cockpit.token },
      body: JSON.stringify({ engineId: 'abc', text: 'x', images: [{ type: 'image/png', base64: 'iVBORw0KGgo=' }] }),
    })
    const [reply] = orders.filter(order => order.type === 'reply')
    assert.equal(path.dirname(reply.images[0]), path.join(dataDir, 'inbox'))
  } finally {
    await cockpit.close()
    fs.rmSync(rootDir, { recursive: true, force: true })
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})

test('two factory servers keep their own token', async () => {
  await withServer(async first => {
    await withServer(async second => {
      assert.notEqual(first.cockpit.token, second.cockpit.token)
      const crossed = await call(second.port, 'POST', '/ack', {
        headers: { 'content-type': 'application/json', 'x-cockpit-token': first.cockpit.token },
        body: JSON.stringify({ engineId: 'abc' }),
      })
      assert.equal(crossed.status, 403)
    })
  })
})

test('the island scripts and the living entities are served from the assets folder', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-root-'))
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-data-'))
  fs.mkdirSync(path.join(rootDir, 'mod', 'assets', 'entity'), { recursive: true })
  const names = ['island-model.js', 'island-ui.js', 'entity/entity.js', 'entity/entity-forms.js', 'entity/entity-2d.js', 'entity/entity-mount.js']
  for (const name of names) fs.writeFileSync(path.join(rootDir, 'mod', 'assets', name), `// ${name}`)
  const cockpit = createCockpitServer({ rootDir, dataDir, port: 0, sink: () => {}, homeDir: dataDir, env: {} })
  try {
    const port = await cockpit.listen()
    for (const name of names) {
      const asset = await call(port, 'GET', `/mod/assets/${name}`)
      assert.equal(asset.text, `// ${name}`)
    }
  } finally {
    await cockpit.close()
  }
})
