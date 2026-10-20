const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { applyTargets, distrosOf, planTarget, refreshInstalledScripts, scriptTextOf, windowsTarget } = require('./hook-install')

const MOD_DIR = path.join(__dirname, '..', 'mod')
const scriptText = scriptTextOf(MOD_DIR)

const homeWith = settings => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-install-'))
  const settingsFile = path.join(home, '.claude', 'settings.json')
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true })
  if (settings !== undefined) fs.writeFileSync(settingsFile, JSON.stringify(settings))
  return { home, settingsFile }
}

// A WSL target as the assistant builds it, in a temporary home.
const wslTargetIn = home => ({ label: 'WSL', settingsFile: path.join(home, '.claude', 'settings.json'), scriptFile: path.join(home, '.claude', 'cockpit', 'cockpit-hook.sh'), command: 'sh "$HOME/.claude/cockpit/cockpit-hook.sh"', modDir: null })

test('the shipped script has Unix line ends', () => {
  assert.equal(scriptText.includes('\r'), false)
  assert.ok(scriptText.startsWith('#!/bin/sh\n'))
})

test('Windows gets the mod, the hook and its script; WSL the hook and its script only', () => {
  const windows = homeWith({ theme: 'dark' })
  const wsl = homeWith()
  const plans = [planTarget(windowsTarget(windows.settingsFile, '/opt/cockpit/mod'), scriptText, () => false), planTarget(wslTargetIn(wsl.home), scriptText, () => false)]
  assert.deepEqual(plans.map(plan => plan.status), ['change', 'change'])
  assert.deepEqual(plans[0].settings.changes.map(change => change.key), ['CLAUDE_CODE_PLUGIN_DIRS', 'hooks'])
  assert.deepEqual(plans[1].settings.changes.map(change => change.key), ['hooks'])
  applyTargets(plans, scriptText)
  const windowsSettings = JSON.parse(fs.readFileSync(windows.settingsFile, 'utf8'))
  assert.equal(windowsSettings.env.CLAUDE_CODE_PLUGIN_DIRS, '/opt/cockpit/mod')
  assert.match(windowsSettings.hooks.Stop[0].hooks[0].command, /^sh ".*\/\.claude\/cockpit\/cockpit-hook\.sh"$/)
  const wslSettings = JSON.parse(fs.readFileSync(wsl.settingsFile, 'utf8'))
  assert.equal(wslSettings.env, undefined)
  assert.equal(wslSettings.hooks.Stop[0].hooks[0].command, 'sh "$HOME/.claude/cockpit/cockpit-hook.sh"')
  assert.equal(fs.readFileSync(path.join(wsl.home, '.claude', 'cockpit', 'cockpit-hook.sh'), 'utf8'), scriptText)
  // Installed: nothing left to do.
  assert.equal(planTarget(wslTargetIn(wsl.home), scriptText, () => false).status, 'unchanged')
  for (const dir of [windows.home, wsl.home]) fs.rmSync(dir, { recursive: true, force: true })
})

test('an outdated script is part of the plan, and is refreshed at launch only where the hook is installed', () => {
  const installed = homeWith()
  const target = wslTargetIn(installed.home)
  applyTargets([planTarget(target, scriptText, () => false)], scriptText)
  fs.writeFileSync(target.scriptFile, 'old')
  assert.equal(planTarget(target, scriptText, () => false).isScriptStale, true)
  const notInstalled = homeWith({ theme: 'dark' })
  refreshInstalledScripts([target, wslTargetIn(notInstalled.home)], scriptText)
  assert.equal(fs.readFileSync(target.scriptFile, 'utf8'), scriptText)
  assert.equal(fs.existsSync(path.join(notInstalled.home, '.claude', 'cockpit')), false)
  for (const dir of [installed.home, notInstalled.home]) fs.rmSync(dir, { recursive: true, force: true })
})

test('the running distros are read in UTF-16 or UTF-8; Docker ones are left out', () => {
  assert.deepEqual(distrosOf(Buffer.from('\uFEFFUbuntu-24.04\r\ndocker-desktop\r\n', 'utf16le')), ['Ubuntu-24.04'])
  assert.deepEqual(distrosOf(Buffer.from('Ubuntu-24.04\r\nDebian\r\n', 'utf8')), ['Ubuntu-24.04', 'Debian'])
})
