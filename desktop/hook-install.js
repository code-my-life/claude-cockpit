// Where the cockpit sets itself up in Claude Code: the Windows settings (the mod
// and the hook), and the settings of each running WSL distro whose users run
// Claude Code (the hook only: the mod is Windows only). Each target gets the hook
// script in ~/.claude/cockpit and the hook entries in its settings.json.
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { applyPlan, chainPlans, fingerprint, planAddHooks, planAddPluginDir, planRemoveHooks, planRemovePluginDir } = require('./settings-merge')

const SCRIPT_NAME = 'cockpit-hook.sh'
const WSL_TIMEOUT_MS = 5000
const TARGETS_REFRESH_MS = 60000
// Docker's own distros run no Claude Code.
const SKIPPED_DISTROS = /^docker-desktop/i
const WSL_SHARE = '\\\\wsl.localhost'

// The distro names printed by `wsl.exe --list --running --quiet`: UTF-16LE from Windows,
// UTF-8 when WSL_UTF8 is set.
const distrosOf = output => {
  const isUtf16 = output.length >= 2 && output.filter((byte, index) => index % 2 === 1 && byte === 0).length * 2 >= output.length / 2
  const text = output.toString(isUtf16 ? 'utf16le' : 'utf8')
  return text.replace(/﻿|\0/g, '').split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0 && !SKIPPED_DISTROS.test(line))
}

// Running distros only: reading the share of a stopped one boots it.
const runningDistros = () => {
  if (process.platform !== 'win32') return []
  const ran = spawnSync('wsl.exe', ['--list', '--running', '--quiet'], { windowsHide: true, timeout: WSL_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] })
  return ran.status === 0 && Buffer.isBuffer(ran.stdout) ? distrosOf(ran.stdout) : []
}

const isDir = dir => {
  try {
    return fs.statSync(dir).isDirectory()
  } catch {
    return false
  }
}

// The Linux homes of `distro` (seen from Windows) where Claude Code has run.
const claudeHomesOf = distro => {
  const root = path.win32.join(WSL_SHARE, distro)
  let users = []
  try {
    users = fs.readdirSync(path.win32.join(root, 'home'))
  } catch {
    users = []
  }
  const homes = [...users.map(user => path.win32.join(root, 'home', user)), path.win32.join(root, 'root')]
  return homes.filter(home => isDir(path.win32.join(home, '.claude')))
}

// `home` is where Claude Code keeps .claude; `command` runs the script in the hook's shell
// (Git Bash on Windows, sh in WSL).
const targetOf = ({ label, settingsFile, scriptFile, command, modDir }) => ({ label, settingsFile, scriptFile, command, modDir })

const windowsTarget = (settingsFile, modDir) => {
  const scriptFile = path.join(path.dirname(settingsFile), 'cockpit', SCRIPT_NAME)
  return targetOf({ label: 'Windows', settingsFile, scriptFile, command: `sh "${scriptFile.replace(/\\/g, '/')}"`, modDir })
}

const wslTargets = () => runningDistros().flatMap(distro => claudeHomesOf(distro).map(home => targetOf({
  label: `WSL ${distro} (${path.win32.basename(home)})`,
  settingsFile: path.win32.join(home, '.claude', 'settings.json'),
  scriptFile: path.win32.join(home, '.claude', 'cockpit', SCRIPT_NAME),
  command: `sh "$HOME/.claude/cockpit/${SCRIPT_NAME}"`,
  modDir: null,
})))

let cachedWsl = { at: 0, targets: [] }
const cachedWslTargets = () => {
  if (Date.now() - cachedWsl.at >= TARGETS_REFRESH_MS) cachedWsl = { at: Date.now(), targets: wslTargets() }
  return cachedWsl.targets
}

// The script as shipped, with Unix line ends whatever the checkout did.
const scriptTextOf = modDir => fs.readFileSync(path.join(modDir, 'assets', SCRIPT_NAME), 'utf8').replace(/\r\n/g, '\n')

const readText = file => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null)

// The change one target needs: its settings plan and whether its script must be written.
const planTarget = (target, scriptText, replaces) => {
  const text = readText(target.settingsFile)
  const modPlan = target.modDir === null
    ? { status: 'unchanged', before: fingerprint(text), change: null, after: text }
    : planAddPluginDir(text, target.modDir, process.platform, { replaces })
  const settings = chainPlans(modPlan, after => planAddHooks(after, target.command))
  const isScriptStale = readText(target.scriptFile) !== scriptText
  return { target, settings, isScriptStale, status: settings.status === 'change' || isScriptStale ? 'change' : 'unchanged' }
}

const writeAtomically = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.cockpit-tmp`
  try {
    fs.writeFileSync(temporary, text)
    fs.renameSync(temporary, file)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

// Applies the plans the person saw; returns the backups made.
const applyTargets = (plans, scriptText) => {
  const backups = []
  for (const plan of plans) {
    if (plan.isScriptStale) writeAtomically(plan.target.scriptFile, scriptText)
    const backup = applyPlan(plan.target.settingsFile, plan.settings)
    if (backup !== null) backups.push(backup)
  }
  return backups
}

// At launch: the script of an installed hook follows the app version, without asking.
const refreshInstalledScripts = (targets, scriptText) => {
  for (const target of targets) {
    const text = readText(target.settingsFile)
    if (text === null || !text.includes(SCRIPT_NAME) || readText(target.scriptFile) === scriptText) continue
    try {
      writeAtomically(target.scriptFile, scriptText)
    } catch {
      continue
    }
  }
}

// At uninstall (#25): the mod and the hook leave every settings file, after a dated backup,
// and the hook script goes with its folder. A target that fails is skipped, the others go on.
const uninstallTargets = targets => {
  const removed = []
  for (const target of targets) {
    try {
      const text = readText(target.settingsFile)
      if (text !== null) {
        const modPlan = target.modDir === null
          ? { status: 'unchanged', before: fingerprint(text), change: null, after: text }
          : planRemovePluginDir(text, target.modDir, process.platform)
        applyPlan(target.settingsFile, chainPlans(modPlan, after => planRemoveHooks(after)))
      }
      fs.rmSync(path.dirname(target.scriptFile), { recursive: true, force: true })
      removed.push(target.label)
    } catch {
      continue
    }
  }
  return removed
}

module.exports = { uninstallTargets, applyTargets, cachedWslTargets, claudeHomesOf, distrosOf, planTarget, refreshInstalledScripts, scriptTextOf, windowsTarget, SCRIPT_NAME }
