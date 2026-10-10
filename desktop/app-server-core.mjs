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

const writeIfMissing = (file, text) => {
  if (fs.existsSync(file)) return
  fs.writeFileSync(file, text)
}

// Until a conversation with the mod writes the real page, the app shows the
// same page with no conversation in it.
const ensureStarterPage = (rootDir, dataDir) => {
  fs.mkdirSync(dataDir, { recursive: true })
  const emptyJson = JSON.stringify(EMPTY_DATA)
  const template = fs.readFileSync(path.join(rootDir, 'mod', 'assets', 'conversations.html'), 'utf8')
  const seed = `<script>window.__CONVERSATIONS__ = ${emptyJson};</script>`
  writeIfMissing(path.join(dataDir, 'conversations.html'), template.replace(SEED_MARKER, () => seed))
  writeIfMissing(path.join(dataDir, 'conversations-data.js'), `window.__CONVERSATIONS__ = ${emptyJson};`)
}

export const startAppServer = async ({ rootDir, dataDir, secret, preferredPort = PREFERRED_PORT, homeDir, env, onError = () => {} }) => {
  ensureStarterPage(rootDir, dataDir)
  const hub = createBridgeHub()
  const sink = order => {
    if (order.type === 'error') return onError(order.message)
    return hub.dispatch(order)
  }
  const build = port => createCockpitServer({ rootDir, dataDir, port, sink, bridge: { hub, secret }, homeDir, env })
  let cockpit = build(preferredPort)
  let port
  try {
    port = await cockpit.listen()
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error
    cockpit = build(ANY_FREE_PORT)
    port = await cockpit.listen()
  }
  return { port, hub, close: cockpit.close }
}
