const { test } = require('node:test')
const assert = require('node:assert/strict')
const { isFullscreenState, createFullscreenProbe, QUNS_NOT_PRESENT, QUNS_BUSY, QUNS_RUNNING_D3D_FULL_SCREEN, QUNS_PRESENTATION_MODE, QUNS_ACCEPTS_NOTIFICATIONS } = require('./fullscreen')

test('plein ecran : occupe, Direct3D plein ecran et mode presentation', () => {
  assert.equal(isFullscreenState(QUNS_BUSY), true)
  assert.equal(isFullscreenState(QUNS_RUNNING_D3D_FULL_SCREEN), true)
  assert.equal(isFullscreenState(QUNS_PRESENTATION_MODE), true)
})

test('session normale ou verrouillee : pas de plein ecran', () => {
  assert.equal(isFullscreenState(QUNS_ACCEPTS_NOTIFICATIONS), false)
  assert.equal(isFullscreenState(QUNS_NOT_PRESENT), false)
  assert.equal(isFullscreenState(undefined), false)
})

test('la sonde interroge le systeme et applique la decision', () => {
  assert.equal(createFullscreenProbe({ query: () => QUNS_BUSY }).isActive(), true)
  assert.equal(createFullscreenProbe({ query: () => QUNS_ACCEPTS_NOTIFICATIONS }).isActive(), false)
})

test('si la requete systeme echoue, on ne suspend rien', () => {
  const probe = createFullscreenProbe({ query: () => { throw new Error('indisponible') } })
  assert.equal(probe.isActive(), false)
})

const { isSilentState, QUNS_QUIET_TIME, QUNS_APP } = require('./fullscreen')

test('sounds are silenced when busy, in Direct3D full screen, in presentation and in quiet hours', () => {
  assert.equal(QUNS_QUIET_TIME, 6)
  for (const code of [2, 3, 4, QUNS_QUIET_TIME]) assert.equal(isSilentState(code), true, String(code))
})

test('sounds play when the user accepts notifications, is away, or when the state is unknown', () => {
  for (const code of [1, 5, QUNS_APP, 0, undefined, 99]) assert.equal(isSilentState(code), false, String(code))
})

test('the probe tells whether the sounds must stay silent, and fails open outside Windows or on error', () => {
  assert.equal(createFullscreenProbe({ query: () => 6 }).isSilent(), true)
  assert.equal(createFullscreenProbe({ query: () => 5 }).isSilent(), false)
  assert.equal(createFullscreenProbe({ query: () => { throw new Error('x') } }).isSilent(), false)
  assert.equal(createFullscreenProbe({ platform: 'linux' }).isSilent(), false)
})
