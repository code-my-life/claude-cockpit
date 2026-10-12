import path from 'node:path'

const UNSAFE_FOR_CMD_PATTERN = /[&|<>^%!`]/
const LINUX_TERMINALS = [
  ['x-terminal-emulator', cwd => ['--working-directory', cwd]],
  ['gnome-terminal', cwd => [`--working-directory=${cwd}`]],
  ['konsole', cwd => ['--workdir', cwd]],
  ['xfce4-terminal', cwd => ['--working-directory', cwd]],
  ['kitty', cwd => ['-d', cwd]],
]

const windowsCandidates = cwd => {
  const direct = { command: 'wt.exe', args: ['-d', cwd] }
  if (UNSAFE_FOR_CMD_PATTERN.test(cwd)) return [direct]
  return [direct, { command: 'cmd.exe', args: ['/d', '/c', 'start', '""', 'wt.exe', '-d', cwd] }]
}

// Commands to try in order to open a terminal in a folder, one list per system.
export const terminalCandidatesOf = (platform, cwd) => {
  if (platform === 'win32') return windowsCandidates(cwd)
  if (platform === 'darwin') return [{ command: 'open', args: ['-a', 'Terminal', cwd] }]
  return LINUX_TERMINALS.map(([command, argsOf]) => ({ command, args: argsOf(cwd) }))
}

// Where Claude Desktop keeps its Code sessions on each system; on Windows the
// Store (MSIX) install writes them under its package folder instead.
export const hostSessionsDirsOf = (platform, home, env, packageNames = []) => {
  const configBases = {
    win32: env.APPDATA || path.join(home, 'AppData', 'Roaming'),
    darwin: path.join(home, 'Library', 'Application Support'),
  }
  const base = configBases[platform] ?? (env.XDG_CONFIG_HOME || path.join(home, '.config'))
  const classic = path.join(base, 'Claude', 'claude-code-sessions')
  if (platform !== 'win32') return [classic]
  const localAppData = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
  const msix = packageNames
    .filter(name => name.startsWith('Claude_'))
    .map(name => path.join(localAppData, 'Packages', name, 'LocalCache', 'Roaming', 'Claude', 'claude-code-sessions'))
  return [classic, ...msix]
}
