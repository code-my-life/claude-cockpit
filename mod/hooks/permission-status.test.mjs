import test from 'node:test'
import assert from 'node:assert/strict'

import { permissionStatusOf } from './permission-status.mts'

test('check + ask in a terminal session gives null', () => {
  const result = permissionStatusOf({ event: 'check', verdict: 'ask', isDesktopSession: false, hasIslandRequest: false })
  assert.equal(result, null)
})

test('check + ask in a terminal session even with hasIslandRequest true gives null', () => {
  const result = permissionStatusOf({ event: 'check', verdict: 'ask', isDesktopSession: false, hasIslandRequest: true })
  assert.equal(result, null)
})

test('check + ask in a Desktop session without island request gives null', () => {
  const result = permissionStatusOf({ event: 'check', verdict: 'ask', isDesktopSession: true, hasIslandRequest: false })
  assert.equal(result, null)
})

test('check + ask in a Desktop session with island request gives permission', () => {
  const result = permissionStatusOf({ event: 'check', verdict: 'ask', isDesktopSession: true, hasIslandRequest: true })
  assert.equal(result, 'permission')
})

test('check + allow in a Desktop session with island request gives null', () => {
  const result = permissionStatusOf({ event: 'check', verdict: 'allow', isDesktopSession: true, hasIslandRequest: true })
  assert.equal(result, null)
})

test('request gives permission in both kinds of session', () => {
  const terminal = permissionStatusOf({ event: 'request', isDesktopSession: false, hasIslandRequest: false })
  const desktop = permissionStatusOf({ event: 'request', isDesktopSession: true, hasIslandRequest: false })
  assert.equal(terminal, 'permission')
  assert.equal(desktop, 'permission')
})
