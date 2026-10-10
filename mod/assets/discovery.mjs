// The discovery file the cockpit app writes so the mod can find it: the port
// it serves on and the secret the bridge asks for, readable by this user only.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const LINK_PROTOCOL = 1
const APP_FOLDER = 'claude-cockpit'
const LINK_NAME = 'link.json'
const SECRET_BYTES = 32
const SECRET_PATTERN = /^[0-9a-f]{64}$/
const MAX_PORT = 65535
const PRIVATE_FOLDER_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600

export const linkFileOf = (platform, env, homeDir) => {
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local')
    return path.join(localAppData, APP_FOLDER, LINK_NAME)
  }
  const stateDir = env.XDG_RUNTIME_DIR || path.join(homeDir, '.local', 'state')
  return path.join(stateDir, APP_FOLDER, LINK_NAME)
}

export const createLink = ({ port, appVersion, pid }) => ({
  protocol: LINK_PROTOCOL,
  port,
  secret: crypto.randomBytes(SECRET_BYTES).toString('hex'),
  pid,
  appVersion,
  startedAt: Date.now(),
})

const isValidLink = link =>
  link !== null &&
  typeof link === 'object' &&
  link.protocol === LINK_PROTOCOL &&
  Number.isInteger(link.port) && link.port > 0 && link.port <= MAX_PORT &&
  typeof link.secret === 'string' && SECRET_PATTERN.test(link.secret) &&
  Number.isInteger(link.pid) && link.pid > 0

// True while a process with that id runs; EPERM means it runs as someone else.
export const isProcessAlive = pid => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

export const writeLink = (file, link) => {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: PRIVATE_FOLDER_MODE })
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(link), { mode: PRIVATE_FILE_MODE })
  fs.renameSync(temporary, file)
}

const parseLink = file => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

// The app's link when it is well formed and its process still runs, else null.
export const readLink = (file, isAlive = isProcessAlive) => {
  const link = parseLink(file)
  if (!isValidLink(link)) return null
  return isAlive(link.pid) ? link : null
}

export const removeLink = (file, pid) => {
  const link = parseLink(file)
  if (link === null || link.pid !== pid) return
  fs.rmSync(file, { force: true })
}
