const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { applyPlan, planAddPluginDir, planRemovePluginDir } = require('./settings-merge')

const MOD_DIR = 'C:/Users/x/AppData/Local/claude-cockpit/mod'
const KEY = 'CLAUDE_CODE_PLUGIN_DIRS'
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff)
const fixedNow = () => new Date('2026-10-10T16:20:12Z')

const tempSettings = text => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-settings-')), 'settings.json')
  if (text !== undefined) fs.writeFileSync(file, text)
  return file
}

test('the mod folder is added to a settings file that has no env block', () => {
  const plan = planAddPluginDir('{ "theme": "dark" }', MOD_DIR, 'win32')
  assert.equal(plan.status, 'change')
  assert.deepEqual(plan.change, { key: KEY, from: null, to: MOD_DIR })
  assert.deepEqual(JSON.parse(plan.after), { theme: 'dark', env: { [KEY]: MOD_DIR } })
})

test('another plugin folder already listed is kept, ours joins it with the system separator', () => {
  const before = JSON.stringify({ env: { [KEY]: 'D:/other/mod', OTHER: '1' } })
  const plan = planAddPluginDir(before, MOD_DIR, 'win32')
  assert.equal(plan.change.to, `D:/other/mod;${MOD_DIR}`)
  assert.equal(JSON.parse(plan.after).env.OTHER, '1')
  assert.equal(planAddPluginDir(before, MOD_DIR, 'linux').change.to, `D:/other/mod:${MOD_DIR}`)
})

test('an older copy of the cockpit mod is replaced, never loaded twice; other mods are kept', () => {
  const before = JSON.stringify({ env: { [KEY]: 'D:/other/mod;C:/repos/claude-cockpit/mod' } })
  const isOldCockpitMod = folder => folder.includes('claude-cockpit')
  const plan = planAddPluginDir(before, MOD_DIR, 'win32', { replaces: isOldCockpitMod })
  assert.equal(plan.change.to, `D:/other/mod;${MOD_DIR}`)
})

test('a mod folder already listed, in any spelling on Windows, changes nothing', () => {
  const before = JSON.stringify({ env: { [KEY]: 'c:\\users\\x\\appdata\\local\\claude-cockpit\\mod' } })
  assert.equal(planAddPluginDir(before, MOD_DIR, 'win32').status, 'unchanged')
})

test('everything else in the file survives, hooks included', () => {
  const settings = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x.exe Stop' }] }] }, permissions: { allow: ['Bash(ls)'] } }
  const plan = planAddPluginDir(JSON.stringify(settings), MOD_DIR, 'win32')
  const after = JSON.parse(plan.after)
  assert.deepEqual(after.hooks, settings.hooks)
  assert.deepEqual(after.permissions, settings.permissions)
})

test('a byte order mark is tolerated, a broken or unexpected file is refused', () => {
  assert.equal(planAddPluginDir(`${BYTE_ORDER_MARK}{}`, MOD_DIR, 'win32').status, 'change')
  assert.throws(() => planAddPluginDir('{ oops', MOD_DIR, 'win32'), /illisible/)
  assert.throws(() => planAddPluginDir('[]', MOD_DIR, 'win32'), /inattendu/)
  assert.throws(() => planAddPluginDir('{ "env": "x" }', MOD_DIR, 'win32'), /env/)
  assert.throws(() => planAddPluginDir(JSON.stringify({ env: { [KEY]: 3 } }), MOD_DIR, 'win32'), new RegExp(KEY))
})

test('a missing settings file is planned as a new one', () => {
  const plan = planAddPluginDir(null, MOD_DIR, 'win32')
  assert.deepEqual(JSON.parse(plan.after), { env: { [KEY]: MOD_DIR } })
})

test('removing the mod folder keeps the other folders and drops an empty key', () => {
  const both = JSON.stringify({ env: { [KEY]: `D:/other/mod;${MOD_DIR}` } })
  assert.equal(JSON.parse(planRemovePluginDir(both, MOD_DIR, 'win32').after).env[KEY], 'D:/other/mod')
  const alone = JSON.stringify({ env: { [KEY]: MOD_DIR, OTHER: '1' } })
  assert.deepEqual(JSON.parse(planRemovePluginDir(alone, MOD_DIR, 'win32').after).env, { OTHER: '1' })
  assert.equal(planRemovePluginDir('{}', MOD_DIR, 'win32').status, 'unchanged')
})

test('applying a plan keeps a dated backup and writes the new settings', () => {
  const before = '{\n  "theme": "dark"\n}\n'
  const file = tempSettings(before)
  const plan = planAddPluginDir(before, MOD_DIR, 'win32')
  const backup = applyPlan(file, plan, fixedNow)
  assert.equal(path.basename(backup), 'settings.json.cockpit-20261010-162012')
  assert.equal(fs.readFileSync(backup, 'utf8'), before)
  assert.equal(fs.readFileSync(file, 'utf8'), plan.after)
  assert.deepEqual(fs.readdirSync(path.dirname(file)).sort(), ['settings.json', 'settings.json.cockpit-20261010-162012'])
})

test('a settings file changed since the preview is not overwritten', () => {
  const file = tempSettings('{}')
  const plan = planAddPluginDir('{}', MOD_DIR, 'win32')
  fs.writeFileSync(file, '{ "theme": "light" }')
  assert.throws(() => applyPlan(file, plan, fixedNow), /modifié/)
  assert.equal(fs.readFileSync(file, 'utf8'), '{ "theme": "light" }')
})

test('a plan for a missing file creates it, with nothing to back up', () => {
  const file = tempSettings(undefined)
  const plan = planAddPluginDir(null, MOD_DIR, 'win32')
  assert.equal(applyPlan(file, plan, fixedNow), null)
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { env: { [KEY]: MOD_DIR } })
})

const { chainPlans, planAddHooks, planRemoveHooks, HOOK_EVENTS } = require('./settings-merge')
const HOOK = 'sh "C:/Users/x/.claude/cockpit/cockpit-hook.sh"'
const ownCommandsOf = (settings, event) => (settings.hooks[event] ?? []).flatMap(entry => entry.hooks.map(hook => hook.command)).filter(command => command.includes('cockpit-hook.sh'))

test('the cockpit hook is declared once on each event, next to the other hooks, in the background but for the start and end of the session', () => {
  const before = JSON.stringify({ theme: 'dark', hooks: { Stop: [{ hooks: [{ type: 'command', command: '"C:/x/coucou-hook.exe" Stop' }] }] }, model: 'opus' })
  const plan = planAddHooks(before, HOOK)
  assert.equal(plan.status, 'change')
  const after = JSON.parse(plan.after)
  assert.deepEqual(Object.keys(after), ['theme', 'hooks', 'model'])
  for (const [event] of HOOK_EVENTS) assert.deepEqual(ownCommandsOf(after, event), [HOOK])
  assert.equal(after.hooks.Stop[0].hooks[0].command, '"C:/x/coucou-hook.exe" Stop')
  assert.equal(after.hooks.PreToolUse[0].hooks[0].async, true)
  assert.equal(after.hooks.Stop[1].hooks[0].async, true)
  assert.equal(after.hooks.SessionStart[0].hooks[0].async, undefined)
  assert.equal(after.hooks.SessionEnd[0].hooks[0].async, undefined)
  assert.equal(after.hooks.Stop[1].hooks[0].timeout, 5)
})

test('declaring the hook again changes nothing; an older cockpit entry is replaced, never doubled', () => {
  const once = planAddHooks('{}', HOOK).after
  assert.equal(planAddHooks(once, HOOK).status, 'unchanged')
  const moved = JSON.parse(planAddHooks(once, 'sh "D:/new/.claude/cockpit/cockpit-hook.sh"').after)
  assert.deepEqual(ownCommandsOf(moved, 'Stop'), ['sh "D:/new/.claude/cockpit/cockpit-hook.sh"'])
})

test('removing the hook keeps every other hook and gives back the file it found', () => {
  const original = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'other' }] }] }, env: { A: '1' } }
  const removed = planRemoveHooks(planAddHooks(JSON.stringify(original), HOOK).after)
  assert.deepEqual(JSON.parse(removed.after), original)
  assert.deepEqual(JSON.parse(planRemoveHooks(planAddHooks('{}', HOOK).after).after), {})
  assert.equal(planRemoveHooks('{}').status, 'unchanged')
})

test('a hooks block of an unexpected type is refused, not overwritten', () => {
  assert.throws(() => planAddHooks('{ "hooks": [] }', HOOK), /hooks/)
  assert.throws(() => planAddHooks('{ "hooks": { "Stop": {} } }', HOOK), /hooks\.Stop/)
})

test('the mod and the hook in one plan of the original file', () => {
  const plan = chainPlans(planAddPluginDir('{}', MOD_DIR, 'win32'), after => planAddHooks(after, HOOK))
  assert.equal(plan.status, 'change')
  assert.deepEqual(plan.changes.map(change => change.key), [KEY, 'hooks'])
  const file = tempSettings('{}')
  applyPlan(file, plan, fixedNow)
  const written = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(written.env[KEY], MOD_DIR)
  assert.deepEqual(ownCommandsOf(written, 'SessionStart'), [HOOK])
})
