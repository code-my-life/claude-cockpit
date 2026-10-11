const test = require('node:test')
const assert = require('node:assert/strict')

const { ISLAND_SHORTCUTS, registerIslandShortcuts } = require('./island-shortcuts')

const fakeGlobalShortcut = taken => {
  const registered = new Map()
  return {
    registered,
    register: (accelerator, run) => {
      if (taken.includes(accelerator)) return false
      registered.set(accelerator, run)
      return true
    },
  }
}

test('each island shortcut is a distinct accelerator with an action and a label', () => {
  const accelerators = ISLAND_SHORTCUTS.map(shortcut => shortcut.accelerator)
  assert.equal(new Set(accelerators).size, accelerators.length)
  for (const shortcut of ISLAND_SHORTCUTS) {
    assert.match(shortcut.accelerator, /^Control\+Alt\+/)
    assert.equal(typeof shortcut.action, 'string')
    assert.ok(shortcut.label.length > 0)
  }
})

test('none of them takes a shortcut coucou uses', () => {
  const coucou = ['Space', 'A', 'T', 'Right', 'Left', 'S', 'G', 'D', 'N'].map(key => `Control+Alt+${key}`)
  assert.deepEqual(ISLAND_SHORTCUTS.filter(shortcut => coucou.includes(shortcut.accelerator)), [])
})

test('every free shortcut runs its action, a taken one is reported and skipped', () => {
  const ran = []
  const keys = fakeGlobalShortcut(['Control+Alt+V'])
  const outcome = registerIslandShortcuts(keys, action => ran.push(action))
  assert.deepEqual(outcome.failed, ['Control+Alt+V'])
  assert.equal(outcome.registered.length, ISLAND_SHORTCUTS.length - 1)
  keys.registered.get('Control+Alt+I')()
  keys.registered.get('Control+Alt+R')()
  assert.deepEqual(ran, ['toggle', 'waiting'])
})

test('a register call that throws counts as taken', () => {
  const keys = { register: () => { throw new Error('refusé') } }
  const outcome = registerIslandShortcuts(keys, () => {})
  assert.equal(outcome.failed.length, ISLAND_SHORTCUTS.length)
})
