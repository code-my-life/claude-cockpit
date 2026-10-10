// Utility process entry: runs the cockpit server for the Electron app. The
// settings (folders, bridge secret) arrive as the first message, never on the
// command line, which other processes can read.
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const tell = message => process.parentPort.postMessage(message)

process.parentPort.once('message', async ({ data }) => {
  try {
    const core = pathToFileURL(path.join(__dirname, 'app-server-core.mjs')).href
    const { startAppServer } = await import(core)
    const started = await startAppServer({ ...data, onError: message => tell({ type: 'error', message }) })
    tell({ type: 'listening', port: started.port })
  } catch (error) {
    tell({ type: 'failed', message: String(error.message || error) })
  }
})
