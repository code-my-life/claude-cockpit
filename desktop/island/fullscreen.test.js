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
