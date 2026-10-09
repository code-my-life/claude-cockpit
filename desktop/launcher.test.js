const { test } = require('node:test')
const assert = require('node:assert/strict')
const { launcherBoundsOf, LAUNCHER_WIDTH, LAUNCHER_MIN_HEIGHT } = require('./launcher')

const AREA = { x: 0, y: 0, width: 3840, height: 2112 }

test('the bar is centred and starts in the upper third of the screen', () => {
  const bounds = launcherBoundsOf(AREA, 400)
  assert.equal(bounds.width, LAUNCHER_WIDTH)
  assert.equal(bounds.x, (3840 - LAUNCHER_WIDTH) / 2)
  assert.ok(bounds.y > 0 && bounds.y < 2112 / 3, `y ${bounds.y}`)
  assert.equal(bounds.height, 400)
})

test('the bar opens on the screen given, even when it is on the left of the main one', () => {
  const left = { x: -1920, y: 100, width: 1920, height: 1040 }
  const bounds = launcherBoundsOf(left, 300)
  assert.equal(bounds.x, -1920 + (1920 - LAUNCHER_WIDTH) / 2)
  assert.ok(bounds.y >= 100 && bounds.y < 100 + 1040 / 3)
})

test('the height never goes past the bottom of the screen nor under the minimum', () => {
  const small = { x: 0, y: 0, width: 1280, height: 600 }
  const tall = launcherBoundsOf(small, 5000)
  const tiny = launcherBoundsOf(small, 0)
  assert.ok(tall.y + tall.height <= 600)
  assert.equal(tiny.height, LAUNCHER_MIN_HEIGHT)
})

test('a screen narrower than the bar keeps a margin on both sides', () => {
  const narrow = { x: 0, y: 0, width: 600, height: 800 }
  const bounds = launcherBoundsOf(narrow, 200)
  assert.ok(bounds.width < 600)
  assert.ok(bounds.x > 0)
  assert.equal(bounds.x + bounds.width + bounds.x, 600)
})
