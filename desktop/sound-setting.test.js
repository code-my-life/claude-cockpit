const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readSoundSetting, serializeSoundSetting, SOUND_FILE_NAME } = require('./sound-setting')

test('sounds are on when nothing is stored yet', () => {
  assert.equal(readSoundSetting(null), true)
  assert.equal(readSoundSetting(''), true)
})

test('a stored choice is read back, on or off', () => {
  assert.equal(readSoundSetting(serializeSoundSetting(false)), false)
  assert.equal(readSoundSetting(serializeSoundSetting(true)), true)
})

test('a corrupt or unexpected file leaves the sounds on', () => {
  assert.equal(readSoundSetting('{pas du json'), true)
  assert.equal(readSoundSetting('[]'), true)
  assert.equal(readSoundSetting('{"enabled":"non"}'), true)
  assert.equal(readSoundSetting('null'), true)
})

test('the setting lives in its own small file', () => {
  assert.equal(SOUND_FILE_NAME, 'sound.json')
  assert.deepEqual(JSON.parse(serializeSoundSetting(false)), { enabled: false })
})
