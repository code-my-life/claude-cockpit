// Runs the cockpit server inside the app (a utility process) and publishes
// link.json so the conversations with the mod can find it.
const { utilityProcess } = require('electron')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const START_TIMEOUT_MS = 15000
const ROOT_DIR = path.join(__dirname, '..')

const loadDiscovery = () => import(pathToFileURL(path.join(ROOT_DIR, 'mod', 'assets', 'discovery.mjs')).href)

const waitForPort = (child, settings, onError, onPermissions) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('le serveur du cockpit ne démarre pas')), START_TIMEOUT_MS)
    child.on('message', message => {
      if (message.type === 'error') return onError(message.message)
      if (message.type === 'permissions') return onPermissions(Number(message.count) || 0)
      clearTimeout(timer)
      if (message.type === 'listening') resolve(message.port)
      else reject(new Error(message.message))
    })
    child.once('exit', code => {
      clearTimeout(timer)
      reject(new Error(`le serveur du cockpit s'est arrêté (code ${code})`))
    })
    child.once('spawn', () => child.postMessage(settings))
  })

// `onExit` runs when the server dies while the app still runs; the link is
// removed first so no conversation keeps sending its secret to a dead port.
const startEmbeddedServer = async ({ appVersion, pageToken, onError, onExit = () => {}, onPermissions = () => {} }) => {
  const { createLink, createSecret, dataDirOf, linkFileOf, removeLink, writeLink } = await loadDiscovery()
  const linkFile = linkFileOf(process.platform, process.env, os.homedir())
  const dataDir = dataDirOf(linkFile)
  const secret = createSecret()
  const proof = createSecret()
  const child = utilityProcess.fork(path.join(__dirname, 'app-server.cjs'), [], { serviceName: 'Serveur du cockpit', stdio: 'ignore' })
  try {
    const port = await waitForPort(child, { rootDir: ROOT_DIR, dataDir, secret, proof, pageToken }, onError, onPermissions)
    writeLink(linkFile, createLink({ port, appVersion, pid: process.pid, dataDir, secret, proof }))
    let isStopping = false
    child.once('exit', code => {
      removeLink(linkFile, process.pid)
      if (!isStopping) onExit(code)
    })
    const stop = () => {
      isStopping = true
      removeLink(linkFile, process.pid)
      child.kill()
    }
    const allowTicket = ticket => child.postMessage({ type: 'ticket', ticket })
    return { port, stop, allowTicket }
  } catch (error) {
    child.kill()
    throw error
  }
}

module.exports = { startEmbeddedServer }
