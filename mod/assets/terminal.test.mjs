import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { hostSessionsDirOf, terminalCandidatesOf } from './terminal.mjs'

test('on Windows the terminal is Windows Terminal, then cmd as a fallback', () => {
  const candidates = terminalCandidatesOf('win32', 'C:\\repos\\app')
  assert.deepEqual(candidates[0], { command: 'wt.exe', args: ['-d', 'C:\\repos\\app'] })
  assert.equal(candidates[1].command, 'cmd.exe')
})

test('the cmd fallback is dropped when the folder holds cmd metacharacters', () => {
  const candidates = terminalCandidatesOf('win32', 'C:\\repos\\R&D')
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].command, 'wt.exe')
})

test('on macOS the folder is opened in Terminal', () => {
  assert.deepEqual(terminalCandidatesOf('darwin', '/Users/x/app'), [{ command: 'open', args: ['-a', 'Terminal', '/Users/x/app'] }])
})

test('on Linux the usual terminals are tried in order', () => {
  const candidates = terminalCandidatesOf('linux', '/home/x/app')
  assert.deepEqual(candidates.slice(0, 3).map(candidate => candidate.command), ['x-terminal-emulator', 'gnome-terminal', 'konsole'])
  for (const candidate of candidates) assert.ok(candidate.args.some(arg => arg.includes('/home/x/app')))
})

test('the Claude Desktop sessions folder follows each system convention', () => {
  const home = path.join(path.sep, 'home', 'x')
  const winEnv = { APPDATA: path.join(path.sep, 'roaming') }
  assert.equal(hostSessionsDirOf('win32', home, winEnv), path.join(path.sep, 'roaming', 'Claude', 'claude-code-sessions'))
  assert.equal(hostSessionsDirOf('win32', home, {}), path.join(home, 'AppData', 'Roaming', 'Claude', 'claude-code-sessions'))
  assert.equal(hostSessionsDirOf('darwin', home, {}), path.join(home, 'Library', 'Application Support', 'Claude', 'claude-code-sessions'))
  assert.equal(hostSessionsDirOf('linux', home, {}), path.join(home, '.config', 'Claude', 'claude-code-sessions'))
  assert.equal(hostSessionsDirOf('linux', home, { XDG_CONFIG_HOME: path.join(path.sep, 'cfg') }), path.join(path.sep, 'cfg', 'Claude', 'claude-code-sessions'))
})
