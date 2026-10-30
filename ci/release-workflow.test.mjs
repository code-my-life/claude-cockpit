import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RELEASE = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/release.yml'), 'utf8')

// The default workflow token reaches no other repository: the dispatch to code-graph failed at every release (#94).
test('the Release workflow dispatches nothing to code-graph', () => {
  assert.doesNotMatch(RELEASE, /code-my-life\/code-graph/)
})
