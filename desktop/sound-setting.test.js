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

const { parseSoundChoice, readSoundState, serializeSoundState, introDecision } = require('./sound-setting')

test('only a real boolean is accepted as a sound choice from the page', () => {
  assert.equal(parseSoundChoice(true), true)
  assert.equal(parseSoundChoice(false), false)
  for (const value of ['true', 1, 0, null, undefined, {}, [], 'oui']) assert.equal(parseSoundChoice(value), null, String(value))
})

test('the stored state holds the choice and whether the first-launch notice was shown', () => {
  assert.deepEqual(readSoundState(null), { enabled: true, isIntroShown: false })
  assert.deepEqual(readSoundState(serializeSoundState({ enabled: false, isIntroShown: true })), { enabled: false, isIntroShown: true })
  assert.deepEqual(readSoundState('{"enabled":false}'), { enabled: false, isIntroShown: false })
  assert.deepEqual(readSoundState('{pas du json'), { enabled: true, isIntroShown: false })
  assert.deepEqual(readSoundState('{"isIntroShown":"oui"}'), { enabled: true, isIntroShown: false })
})

test('the first-launch notice is shown once, only while the sounds are on', () => {
  const first = introDecision({ enabled: true, isIntroShown: false })
  assert.equal(first.shouldShow, true)
  assert.deepEqual(first.next, { enabled: true, isIntroShown: true })
  assert.equal(introDecision(first.next).shouldShow, false)
  const muted = introDecision({ enabled: false, isIntroShown: false })
  assert.equal(muted.shouldShow, false)
  assert.equal(muted.next.isIntroShown, false)
})
