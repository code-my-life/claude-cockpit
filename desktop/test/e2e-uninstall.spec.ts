// The uninstaller (desktop/build/installer.nsh) runs the app with --cockpit-uninstall (#25): the app
// takes its mod and its hooks out of Claude Code's settings and leaves at once.
import { expect, test } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DESKTOP_DIR, isolatedEnv } from './harness'

// The Electron binary, as the electron package gives it.
const ELECTRON = require('electron') as unknown as string
const MOD_DIR = path.join(DESKTOP_DIR, '..', 'mod').replace(/\\/g, '/')
const OTHER_HOOK = { hooks: [{ type: 'command', command: '"C:/x/coucou-hook.exe" Stop' }] }

test('E1: at uninstall the app removes its mod, its hooks and its script; the other hooks stay', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-e2e-uninstall-'))
  const home = path.join(root, 'home')
  const settingsFile = path.join(home, '.claude', 'settings.json')
  const scriptFile = path.join(home, '.claude', 'cockpit', 'cockpit-hook.sh')
  fs.mkdirSync(path.dirname(scriptFile), { recursive: true })
  fs.writeFileSync(scriptFile, '#!/bin/sh\n')
  const ours = { hooks: [{ type: 'command', command: `sh "${scriptFile.replace(/\\/g, '/')}"`, timeout: 5 }] }
  fs.writeFileSync(settingsFile, JSON.stringify({ theme: 'dark', env: { CLAUDE_CODE_PLUGIN_DIRS: MOD_DIR, OTHER: '1' }, hooks: { Stop: [OTHER_HOOK, ours], SessionStart: [ours] } }, null, 2))
  try {
    const env = { ...isolatedEnv(root, home), COCKPIT_SETTINGS_FILE: settingsFile }
    const ran = spawnSync(ELECTRON, [DESKTOP_DIR, `--user-data-dir=${path.join(root, 'user-data')}`, '--cockpit-uninstall'], { env, timeout: 60_000, encoding: 'utf8' })
    expect(ran.status, ran.stderr).toBe(0)
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
    expect(settings).toEqual({ theme: 'dark', env: { OTHER: '1' }, hooks: { Stop: [OTHER_HOOK] } })
    expect(fs.existsSync(path.dirname(scriptFile))).toBe(false)
    expect(fs.readdirSync(path.dirname(settingsFile)).some(name => name.startsWith('settings.json.cockpit-'))).toBe(true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
