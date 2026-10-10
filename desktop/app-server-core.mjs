// Starts the cockpit server inside the Electron app: the bridge hub carries
// the page's orders to the open conversations, and the data folder holds what
// the hub conversation writes.
import fs from 'node:fs'
import path from 'node:path'

import { createBridgeHub } from '../mod/assets/bridge-hub.mjs'
import { createCockpitServer } from '../mod/assets/cockpit-server.mjs'

export const PREFERRED_PORT = 48123
const ANY_FREE_PORT = 0
const SEED_MARKER = '<!--SEED-->'
const EMPTY_DATA = { generatedAt: 0, rows: [], folders: [] }
const INBOX_MAX_AGE_MS = 7 * 24 * 3600 * 1000
export const STARTER_MARK = '<!--cockpit-starter-->'

const isStarterOrMissing = file => !fs.existsSync(file) || fs.readFileSync(file, 'utf8').includes(STARTER_MARK)

// Until a conversation with the mod writes the real page, the app shows the
// same page with no conversation in it. The starter page carries a mark so a
// newer template replaces it at the next start.
const ensureStarterPage = (rootDir, dataDir) => {
  fs.mkdirSync(dataDir, { recursive: true })
  const pageFile = path.join(dataDir, 'conversations.html')
  if (!isStarterOrMissing(pageFile)) return
  const emptyJson = JSON.stringify(EMPTY_DATA)
  const template = fs.readFileSync(path.join(rootDir, 'mod', 'assets', 'conversations.html'), 'utf8')
  const seed = `${STARTER_MARK}<script>window.__CONVERSATIONS__ = ${emptyJson};</script>`
  fs.writeFileSync(pageFile, template.replace(SEED_MARKER, () => seed))
  fs.writeFileSync(path.join(dataDir, 'conversations-data.js'), `window.__CONVERSATIONS__ = ${emptyJson};`)
}

const purgeOldImages = (dataDir, now = Date.now()) => {
  const inbox = path.join(dataDir, 'inbox')
  if (!fs.existsSync(inbox)) return
  for (const name of fs.readdirSync(inbox)) {
    const file = path.join(inbox, name)
    const stat = fs.statSync(file)
    if (stat.isFile() && now - stat.mtimeMs > INBOX_MAX_AGE_MS) fs.rmSync(file, { force: true })
  }
}

export const startAppServer = async ({ rootDir, dataDir, secret, proof, pageToken, preferredPort = PREFERRED_PORT, homeDir, env, onError = () => {} }) => {
  ensureStarterPage(rootDir, dataDir)
  purgeOldImages(dataDir)
  const hub = createBridgeHub()
  const sink = order => {
    if (order.type === 'error') return onError(order.message)
    return hub.dispatch(order)
  }
  const build = port => createCockpitServer({ rootDir, dataDir, port, sink, bridge: { hub, secret, proof }, pageAuth: 'cookie', token: pageToken, homeDir, env })
  let cockpit = build(preferredPort)
  let port
  try {
    port = await cockpit.listen()
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error
    cockpit = build(ANY_FREE_PORT)
    port = await cockpit.listen()
  }
  return { port, hub, close: cockpit.close, allowTicket: cockpit.allowTicket }
}
