import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { hostSessionsDirsOf, terminalCandidatesOf, wslTerminalCandidatesOf } from './terminal.mjs'

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
  assert.deepEqual(hostSessionsDirsOf('win32', home, winEnv), [path.join(path.sep, 'roaming', 'Claude', 'claude-code-sessions')])
  assert.deepEqual(hostSessionsDirsOf('win32', home, {}), [path.join(home, 'AppData', 'Roaming', 'Claude', 'claude-code-sessions')])
  assert.deepEqual(hostSessionsDirsOf('darwin', home, {}), [path.join(home, 'Library', 'Application Support', 'Claude', 'claude-code-sessions')])
  assert.deepEqual(hostSessionsDirsOf('linux', home, {}), [path.join(home, '.config', 'Claude', 'claude-code-sessions')])
  assert.deepEqual(hostSessionsDirsOf('linux', home, { XDG_CONFIG_HOME: path.join(path.sep, 'cfg') }), [path.join(path.sep, 'cfg', 'Claude', 'claude-code-sessions')])
})

test('on Windows MSIX packages starting with Claude_ add extra folders', () => {
  const home = path.join(path.sep, 'home', 'x')
  const env = { APPDATA: path.join(path.sep, 'roaming'), LOCALAPPDATA: path.join(path.sep, 'local') }
  const packageNames = ['Claude_test123', 'Other_app']
  const expected = [
    path.join(path.sep, 'roaming', 'Claude', 'claude-code-sessions'),
    path.join(path.sep, 'local', 'Packages', 'Claude_test123', 'LocalCache', 'Roaming', 'Claude', 'claude-code-sessions')
  ]
  assert.deepEqual(hostSessionsDirsOf('win32', home, env, packageNames), expected)
})

test('on Windows Claude Desktop data folders starting with claude_ add their sessions folder', () => {
  const home = path.join(path.sep, 'home', 'x')
  const env = { APPDATA: path.join(path.sep, 'roaming'), LOCALAPPDATA: path.join(path.sep, 'local') }
  const expected = [
    path.join(path.sep, 'roaming', 'Claude', 'claude-code-sessions'),
    path.join(path.sep, 'local', 'Claude-Data', 'claude_pzs8sxrjxfjjc', 'claude-code-sessions'),
  ]
  assert.deepEqual(hostSessionsDirsOf('win32', home, env, [], ['claude_pzs8sxrjxfjjc', 'other']), expected)
  assert.deepEqual(hostSessionsDirsOf('linux', home, {}, [], ['claude_pzs8sxrjxfjjc']), [path.join(home, '.config', 'Claude', 'claude-code-sessions')])
})

test('a WSL folder opens in its distro: Windows Terminal first, then the distro console', () => {
  assert.deepEqual(wslTerminalCandidatesOf('Ubuntu-24.04', '/home/ana/app'), [
    { command: 'wt.exe', args: ['wsl.exe', '-d', 'Ubuntu-24.04', '--cd', '/home/ana/app'] },
    { command: 'wsl.exe', args: ['-d', 'Ubuntu-24.04', '--cd', '/home/ana/app'] },
  ])
})
