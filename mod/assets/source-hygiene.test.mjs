import test from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SOURCE_PATTERN = /\.(m?js|cjs|tsx?|html|json)$/
const LINE_SEPARATORS = [String.fromCharCode(0x2028), String.fromCharCode(0x2029)]

const trackedSources = () => {
  const listed = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
  return listed.trim().split('\n').filter(file => SOURCE_PATTERN.test(file))
}

// A raw U+2028 or U+2029 inside a regex or string literal is a line break for
// the parser: the mod engine then refuses register.tsx as a whole.
test('no source file holds a raw line or paragraph separator', () => {
  const offenders = trackedSources().filter(file => {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8')
    return LINE_SEPARATORS.some(separator => text.includes(separator))
  })
  assert.deepEqual(offenders, [])
})
