const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('desktop/main.js : la fenetre ile enregistre un gestionnaire blur qui appelle island.blur()', () => {
  const mainPath = path.join(__dirname, 'main.js')
  const src = fs.readFileSync(mainPath, 'utf8')
  // Le fix #8 ajoute win.on('blur', () => island?.blur()) dans createWindow.
  assert.match(src, /win\.on\(['"]blur['"],\s*\(\)\s*=>\s*island\??\.blur\(\)/, 'le handler blur de la fenêtre île doit appeler island.blur()')
})