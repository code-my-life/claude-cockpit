const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

const { createUpdater, CHECK_EVERY_MS, FIRST_CHECK_DELAY_MS } = require('./updater')

// electron-updater's autoUpdater as the module drives it: events, a check, an install.
const fakeAutoUpdater = ({ check = () => Promise.resolve(null) } = {}) => {
  const updater = new EventEmitter()
  updater.checks = 0
  updater.installs = []
  updater.checkForUpdates = () => {
    updater.checks += 1
    return check(updater)
  }
  updater.quitAndInstall = (isSilent, isForceRunAfter) => updater.installs.push({ isSilent, isForceRunAfter })
  return updater
}

const settle = () => new Promise(resolve => setImmediate(resolve))

const setup = options => {
  const autoUpdater = fakeAutoUpdater(options)
  const logs = []
  const changes = []
  const updater = createUpdater({ autoUpdater, log: line => logs.push(line), onChange: status => changes.push(status) })
  return { autoUpdater, updater, logs, changes }
}

test('it downloads in the background and installs when the app quits', () => {
  const { autoUpdater } = setup()
  assert.equal(autoUpdater.autoDownload, true)
  assert.equal(autoUpdater.autoInstallOnAppQuit, true)
})

test('a new version goes from downloading to ready, then restarts into it on request', async () => {
  const { autoUpdater, updater, logs } = setup({
    check: updater => {
      updater.emit('update-available', { version: '0.3.0' })
      return Promise.resolve({})
    },
  })
  updater.check()
  await settle()
  assert.deepEqual(updater.status(), { phase: 'downloading', version: '0.3.0' })
  assert.equal(updater.install(), false)
  autoUpdater.emit('update-downloaded', { version: '0.3.0' })
  assert.deepEqual(updater.status(), { phase: 'ready', version: '0.3.0' })
  assert.match(logs.at(-1), /v0\.3\.0 prête/)
  assert.equal(updater.install(), true)
  assert.deepEqual(autoUpdater.installs, [{ isSilent: true, isForceRunAfter: true }])
})

test('no release, or no answer, leaves it idle to try again later', async () => {
  const { autoUpdater, updater } = setup()
  updater.check()
  await settle()
  assert.equal(updater.status().phase, 'idle')
  updater.check()
  await settle()
  assert.equal(autoUpdater.checks, 2)
})

test('a failed check is logged and tried again later', async () => {
  const { autoUpdater, updater, logs } = setup({ check: () => Promise.reject(new Error('404 sur latest.yml')) })
  updater.check()
  await settle()
  assert.equal(updater.status().phase, 'idle')
  assert.match(logs.at(-1), /vérification impossible \(404 sur latest\.yml\)/)
  autoUpdater.emit('error', new Error('réseau coupé'))
  assert.match(logs.at(-1), /réseau coupé/)
})

test('a GitHub refusal is logged once, on one line, without the reply headers', async () => {
  const githubError = new Error('404 \n"method: GET url: https://github.com/code-my-life/claude-cockpit/releases.atom\\n\\nPlease double check."\nHeaders: {\n  "set-cookie": ["_gh_sess=secret"]\n}')
  const { updater, logs } = setup({
    check: updater => {
      updater.emit('error', githubError)
      return Promise.reject(githubError)
    },
  })
  updater.check()
  await settle()
  assert.equal(logs.length, 1)
  assert.equal(logs[0], 'mise à jour : vérification impossible (404 method: GET url: https://github.com/code-my-life/claude-cockpit/releases.atom Please double check.)')
})

test('one check at a time, and none once a version waits to be installed', async () => {
  const { autoUpdater, updater } = setup({ check: () => new Promise(() => {}) })
  updater.check()
  updater.check()
  await settle()
  assert.equal(autoUpdater.checks, 1)
  autoUpdater.emit('update-downloaded', { version: '0.3.0' })
  autoUpdater.emit('error', new Error('plus tard'))
  assert.equal(updater.status().phase, 'ready')
  updater.check()
  await settle()
  assert.equal(autoUpdater.checks, 1)
})

test('it checks shortly after start, then every few hours', () => {
  const timers = []
  const autoUpdater = fakeAutoUpdater()
  const updater = createUpdater({
    autoUpdater,
    log: () => {},
    setTimer: (run, ms) => timers.push({ kind: 'once', ms }),
    setRepeat: (run, ms) => timers.push({ kind: 'every', ms }),
  })
  updater.start()
  assert.deepEqual(timers, [{ kind: 'once', ms: FIRST_CHECK_DELAY_MS }, { kind: 'every', ms: CHECK_EVERY_MS }])
})
