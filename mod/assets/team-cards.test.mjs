import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const templatePath = path.join(__dirname, 'conversations.html')

test('team view renders cards not rows - both renders read the shared cardsOn check', () => {
  const html = fs.readFileSync(templatePath, 'utf8')

  // renderTeam used to read useCards, a constant local to render(): a ReferenceError on every team
  // render (audit 2026-10-20, P0). Both renders now call the same function.
  assert.match(html, /const cardsOn = \(\) =>/, 'cardsOn should be defined once, outside render()')
  const team = html.slice(html.indexOf('const renderTeam = now =>'), html.indexOf('const renderTeam = now =>') + 400)
  assert.match(team, /if \(cardsOn\(\)\)/, 'renderTeam should call cardsOn()')
  assert.doesNotMatch(team, /\buseCards\b/, 'renderTeam should not read the local useCards of render()')
  assert.match(html, /const useCards = cardsOn\(\);/, 'render() should take useCards from cardsOn()')
})

test('team view renders cards not rows - team zones rendered via renderCardLane when useCards', () => {
  const html = fs.readFileSync(templatePath, 'utf8')
  
  // The team zones (waiting, working, stuck, later) should be rendered via renderCardLane
  // when useCards is true. Check for the specific pattern in renderTeam function.
  // On base, renderTeam uses renderTeamZone which creates .t-grid with .t-agent rows
  // After fix, it should call renderCardLane for each zone
  assert.match(html, /renderTeam[^}]*renderCardLane|renderCardLane[^}]*renderTeam/, 'renderTeam should call renderCardLane for team zones')
})
