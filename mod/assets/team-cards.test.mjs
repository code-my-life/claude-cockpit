import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const templatePath = path.join(__dirname, 'conversations.html')

test('team view renders cards not rows - renderTeam function uses useCards flag', () => {
  const html = fs.readFileSync(templatePath, 'utf8')
  
  // Verify that renderTeam function uses useCards flag
  // The fix should make renderTeam check useCards and use renderCardLane for team zones
  assert.match(html, /const useCards = isCards/, 'useCards flag should be defined from isCards')
  
  // Verify that renderTeam uses renderCardLane for team zones when useCards is true
  // The pattern: renderTeam should contain logic that branches on useCards
  assert.match(html, /renderTeam[^}]*useCards|useCards[^}]*renderTeam/, 'renderTeam should reference useCards')
})

test('team view renders cards not rows - team zones rendered via renderCardLane when useCards', () => {
  const html = fs.readFileSync(templatePath, 'utf8')
  
  // The team zones (waiting, working, stuck, later) should be rendered via renderCardLane
  // when useCards is true. Check for the specific pattern in renderTeam function.
  // On base, renderTeam uses renderTeamZone which creates .t-grid with .t-agent rows
  // After fix, it should call renderCardLane for each zone
  assert.match(html, /renderTeam[^}]*renderCardLane|renderCardLane[^}]*renderTeam/, 'renderTeam should call renderCardLane for team zones')
})
