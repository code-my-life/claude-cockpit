// Adds the cockpit mod to (or removes it from) the user's Claude Code settings
// without ever overwriting them blindly: the change is planned and shown
// first, and only applied if the file still is what was shown, after a dated
// backup, through a temporary file and a rename.
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const KEY = 'CLAUDE_CODE_PLUGIN_DIRS'
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff)
const JSON_INDENT = 2

class SettingsError extends Error {}

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

const separatorOf = platform => (platform === 'win32' ? ';' : ':')

const sameFolder = (first, second, platform) => {
  const normal = folder => folder.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  return platform === 'win32' ? normal(first).toLowerCase() === normal(second).toLowerCase() : normal(first) === normal(second)
}

const fingerprint = text => (text === null ? null : crypto.createHash('sha256').update(text).digest('hex'))

const parseSettings = text => {
  if (text === null) return {}
  let settings
  try {
    settings = JSON.parse(text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text)
  } catch {
    throw new SettingsError('settings.json illisible : corrige-le avant d’installer le cockpit')
  }
  if (!isPlainObject(settings)) throw new SettingsError('settings.json au contenu inattendu')
  if (settings.env !== undefined && !isPlainObject(settings.env)) throw new SettingsError('le bloc env de settings.json a un type inattendu')
  const current = settings.env?.[KEY]
  if (current !== undefined && typeof current !== 'string') throw new SettingsError(`${KEY} a un type inattendu dans settings.json`)
  return settings
}

const foldersOf = (value, platform) => (value ? value.split(separatorOf(platform)).filter(folder => folder.trim() !== '') : [])

const planWith = (text, settings, nextValue) => {
  const from = settings.env?.[KEY] ?? null
  if (from === nextValue) return { status: 'unchanged', before: fingerprint(text), change: null, after: text }
  const { [KEY]: previous, ...otherEnv } = settings.env ?? {}
  const env = nextValue === null ? otherEnv : { ...otherEnv, [KEY]: nextValue }
  const after = `${JSON.stringify({ ...settings, env }, null, JSON_INDENT)}\n`
  return { status: 'change', before: fingerprint(text), change: { key: KEY, from, to: nextValue }, after }
}

// `text` is the current settings.json, or null when it does not exist yet.
// `replaces` spots older copies of the same mod, dropped so it never loads twice.
const planAddPluginDir = (text, modDir, platform, { replaces = () => false } = {}) => {
  const settings = parseSettings(text)
  const folders = foldersOf(settings.env?.[KEY], platform)
  if (folders.some(folder => sameFolder(folder, modDir, platform))) return { status: 'unchanged', before: fingerprint(text), change: null, after: text }
  const kept = folders.filter(folder => !replaces(folder))
  return planWith(text, settings, [...kept, modDir].join(separatorOf(platform)))
}

const planRemovePluginDir = (text, modDir, platform) => {
  const settings = parseSettings(text)
  const folders = foldersOf(settings.env?.[KEY], platform)
  const kept = folders.filter(folder => !sameFolder(folder, modDir, platform))
  if (kept.length === folders.length) return { status: 'unchanged', before: fingerprint(text), change: null, after: text }
  return planWith(text, settings, kept.length > 0 ? kept.join(separatorOf(platform)) : null)
}

// The cockpit hook (mod/assets/cockpit-hook.sh), on the events that say where a conversation
// stands. It costs about half a second under Git Bash: every event but the start and the end of
// the session runs in the background ("async"), Claude Code never waits for it. Spotted by the
// script name, so the person's other hooks are never touched.
const HOOK_MARKER = 'cockpit-hook.sh'
const HOOK_TIMEOUT_S = 5
const HOOK_EVENTS = [
  ['SessionStart', false], ['UserPromptSubmit', true], ['PreToolUse', true], ['PostToolUse', true],
  ['PostToolUseFailure', true], ['PermissionRequest', true], ['Notification', true], ['Stop', true],
  ['StopFailure', true], ['SessionEnd', false],
]

const hooksOf = settings => {
  if (settings.hooks === undefined) return {}
  if (!isPlainObject(settings.hooks)) throw new SettingsError('le bloc hooks de settings.json a un type inattendu')
  for (const [event, entries] of Object.entries(settings.hooks)) {
    if (!Array.isArray(entries)) throw new SettingsError(`hooks.${event} a un type inattendu dans settings.json`)
  }
  return settings.hooks
}

const isCockpitHookEntry = entry => isPlainObject(entry) && Array.isArray(entry.hooks)
  && entry.hooks.some(hook => isPlainObject(hook) && typeof hook.command === 'string' && hook.command.includes(HOOK_MARKER))

const hookEntryOf = (command, isAsync) => ({ hooks: [{ type: 'command', command, timeout: HOOK_TIMEOUT_S, ...(isAsync ? { async: true } : {}) }] })

// The hooks block in its place in the file; dropped when nothing is left in it.
const withHooks = (settings, hooks) => {
  if (Object.keys(hooks).length > 0) return { ...settings, hooks }
  const { hooks: previous, ...rest } = settings
  return rest
}

const planHooksWith = (text, settings, hooks) => {
  const after = `${JSON.stringify(withHooks(settings, hooks), null, JSON_INDENT)}\n`
  const isSame = JSON.stringify(withHooks(settings, hooks)) === JSON.stringify(settings)
  if (isSame) return { status: 'unchanged', before: fingerprint(text), change: null, after: text }
  return { status: 'change', before: fingerprint(text), change: { key: 'hooks', from: null, to: `${HOOK_EVENTS.length} événements` }, after }
}

// Declares the cockpit hook with `command`, in place of any older cockpit entry.
const planAddHooks = (text, command) => {
  const settings = parseSettings(text)
  const hooks = { ...hooksOf(settings) }
  for (const [event, isAsync] of HOOK_EVENTS) {
    const others = (hooks[event] ?? []).filter(entry => !isCockpitHookEntry(entry))
    hooks[event] = [...others, hookEntryOf(command, isAsync)]
  }
  return planHooksWith(text, settings, hooks)
}

// Removes the cockpit hook entries, and only them.
const planRemoveHooks = text => {
  const settings = parseSettings(text)
  const hooks = {}
  for (const [event, entries] of Object.entries(hooksOf(settings))) {
    const kept = entries.filter(entry => !isCockpitHookEntry(entry))
    if (kept.length > 0) hooks[event] = kept
  }
  return planHooksWith(text, settings, hooks)
}

// Two plans of the same file in a row, as one plan of the original text.
const chainPlans = (first, makeSecond) => {
  const second = makeSecond(first.after)
  const isChanged = first.status === 'change' || second.status === 'change'
  return { status: isChanged ? 'change' : 'unchanged', before: first.before, changes: [first.change, second.change].filter(change => change !== null), after: second.after }
}

const stampOf = date => date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)

// Applies a plan made from the file's content; returns the backup path, or
// null when there was no file to back up (or nothing to change).
const applyPlan = (file, plan, now = () => new Date()) => {
  if (plan.status === 'unchanged') return null
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
  if (fingerprint(current) !== plan.before) throw new SettingsError('settings.json a été modifié depuis l’aperçu : recommence')
  const backup = current === null ? null : `${file}.cockpit-${stampOf(now())}`
  if (backup !== null) fs.copyFileSync(file, backup)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.cockpit-tmp`
  try {
    fs.writeFileSync(temporary, plan.after)
    fs.renameSync(temporary, file)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
  return backup
}

module.exports = { applyPlan, chainPlans, fingerprint, planAddHooks, planAddPluginDir, planRemoveHooks, planRemovePluginDir, SettingsError, HOOK_EVENTS, HOOK_MARKER, PLUGIN_DIRS_KEY: KEY }
