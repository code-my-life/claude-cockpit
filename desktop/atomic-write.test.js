const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { writeFileAtomic } = require('./atomic-write')

const freshFolder = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-atomic-'))

test('the file is written whole, with no temporary file left behind', () => {
  const folder = freshFolder()
  const file = path.join(folder, 'sound.json')
  writeFileAtomic(file, '{"enabled":false}')
  assert.equal(fs.readFileSync(file, 'utf8'), '{"enabled":false}')
  assert.deepEqual(fs.readdirSync(folder), ['sound.json'])
})

test('an existing file is replaced', () => {
  const folder = freshFolder()
  const file = path.join(folder, 'sound.json')
  fs.writeFileSync(file, 'ancien')
  writeFileAtomic(file, 'nouveau')
  assert.equal(fs.readFileSync(file, 'utf8'), 'nouveau')
})

test('a failed write leaves the old content and no temporary file', () => {
  const folder = freshFolder()
  const file = path.join(folder, 'sound.json')
  fs.writeFileSync(file, 'ancien')
  assert.throws(() => writeFileAtomic(file, 'nouveau', { rename: () => { throw new Error('refusé') } }))
  assert.equal(fs.readFileSync(file, 'utf8'), 'ancien')
  assert.deepEqual(fs.readdirSync(folder), ['sound.json'])
})
