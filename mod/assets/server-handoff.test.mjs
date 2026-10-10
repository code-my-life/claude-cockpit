import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createLink, linkFileOf, writeLink } from './discovery.mjs'

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.mjs')
const CHECK_MS = 150
const EXIT_APP_TOOK_OVER = 4
const QUIET_WAIT_MS = 1200

const fakeApp = answers =>
  new Promise(resolve => {
    const server = http.createServer((request, response) => {
      if (!answers) return request.socket.destroy()
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"ok":true}')
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })

const startModServer = baseDir => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-handoff-root-'))
  const env = { ...process.env, LOCALAPPDATA: baseDir, XDG_RUNTIME_DIR: baseDir, COCKPIT_LINK_CHECK_MS: String(CHECK_MS) }
  const child = spawn(process.execPath, [SERVER, rootDir, '0'], { env, stdio: ['ignore', 'pipe', 'ignore'] })
  const exited = new Promise(resolve => child.on('exit', code => resolve(code)))
  return { child, exited, rootDir }
}

const writeAppLink = (baseDir, port) => {
  const file = linkFileOf(process.platform, { LOCALAPPDATA: baseDir, XDG_RUNTIME_DIR: baseDir }, os.homedir())
  writeLink(file, createLink({ port, appVersion: 'test', pid: process.pid, dataDir: path.join(baseDir, 'data') }))
}

test('the server a conversation started steps aside once the app answers', { timeout: 10000 }, async () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-handoff-'))
  const app = await fakeApp(true)
  const modServer = startModServer(baseDir)
  try {
    writeAppLink(baseDir, app.address().port)
    assert.equal(await modServer.exited, EXIT_APP_TOOK_OVER)
  } finally {
    modServer.child.kill()
    app.close()
    fs.rmSync(baseDir, { recursive: true, force: true })
    fs.rmSync(modServer.rootDir, { recursive: true, force: true })
  }
})

test('the server keeps running when the app named in the link does not answer', { timeout: 10000 }, async () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-handoff-'))
  const app = await fakeApp(false)
  const modServer = startModServer(baseDir)
  try {
    writeAppLink(baseDir, app.address().port)
    const outcome = await Promise.race([modServer.exited, new Promise(resolve => setTimeout(() => resolve('still running'), QUIET_WAIT_MS))])
    assert.equal(outcome, 'still running')
  } finally {
    modServer.child.kill()
    app.close()
    fs.rmSync(baseDir, { recursive: true, force: true })
    fs.rmSync(modServer.rootDir, { recursive: true, force: true })
  }
})
