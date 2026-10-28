// Layout under real content (#88): long titles, requests and numbered options, a long summary. The other specs use
// short fixtures, on which a card never overflows; these check the geometry itself, in the real Electron app:
// nothing leaves the face of a card, no block is drawn over its neighbour, the "Nouvelle conversation" sheet is
// above its backdrop.
import { expect, test, type Page } from '@playwright/test'
import { attachScreenshot, launchCockpit, openCockpit, openIsland, type Cockpit } from './harness'
import type { Row } from './fixtures/structured-data'

const DATA_REFRESH_MS = 10_000
const LONG_TITLE = '2348 Google ads & bing ads en écriture, campagnes de la marque et du réseau'
const LONG_ASK = 'Répondre 1 (commit vide pour relancer la revue de Pascal) ou 2 (fusion sans nouvelle revue).'
const LONG_TEXT = [
  'La CI de la PR #493 est verte. ' + 'Pascal attend un nouveau commit pour repasser sa revue, il n\'a rien à redire sur le code. '.repeat(8),
  '',
  '1. Pousser un commit vide pour déclencher sa revue. Ce commit disparaît à la fusion squash.',
  '2. Tu fusionnes sans nouvelle revue. On perd la revue de Pascal et la protection de branche peut bloquer.',
  '',
  '**Tu réponds 1 ou 2 ?**',
].join('\n')

let cockpit: Cockpit

test.beforeEach(async ({}, testInfo) => {
  cockpit = await launchCockpit(testInfo)
})

test.afterEach(async ({}, testInfo) => {
  for (const page of cockpit.app.windows()) {
    if (page.url().startsWith('http') && !page.url().includes('launcher=1')) await attachScreenshot(testInfo, page, page.url().includes('island=1') ? 'ile-fin' : 'cockpit-fin')
  }
  await cockpit.close()
})

// A question waiting for an answer, with real-sized content, and a conversation on a mission behind it.
const longRows = (): Row[] => {
  const rows = cockpit.fixtures.rows
  const question = rows.find(row => row.engineId === 'e2e-question')!
  const working = rows.find(row => row.engineId === 'e2e-working')!
  return [
    { ...question, title: LONG_TITLE, summary: { ...question.summary, awaiting: LONG_ASK, text: LONG_TEXT, plain: LONG_TEXT } },
    working,
  ]
}

// The descendants of `selector` that stick out of it sideways (1 px of rounding allowed), described for the report.
const sideOverflowOf = (page: Page, selector: string) => page.locator(selector).first().evaluate(box => {
  const frame = box.getBoundingClientRect()
  const offenders: string[] = []
  for (const el of box.querySelectorAll('*')) {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0 || getComputedStyle(el).visibility === 'hidden') continue
    if (rect.left < frame.left - 1 || rect.right > frame.right + 1) {
      offenders.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} [${Math.round(rect.left)}, ${Math.round(rect.right)}] outside [${Math.round(frame.left)}, ${Math.round(frame.right)}]`)
    }
  }
  return offenders
})

// Pieces of content drawn over one another (1 px allowed): text, fields, pictures. A block squeezed by its flex
// container leaves its content spilling over the next block, so the pieces are compared, not their boxes. A piece
// placed absolutely (the send button inside its field) is meant to sit over another and is left out.
const overlapsOf = (page: Page, selector: string) => page.locator(selector).first().evaluate(box => {
  const isPlaced = (el: Element) => {
    for (let node: Element | null = el; node !== null && node !== box; node = node.parentElement) {
      if (['absolute', 'fixed'].includes(getComputedStyle(node).position)) return true
    }
    return false
  }
  const hasText = (el: Element) => [...el.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent!.trim() !== '')
  const pieces = [...box.querySelectorAll('*')].filter(el => {
    if (el.parentElement?.closest('svg')) return false
    if (!(hasText(el) || el.matches('input, textarea, img, canvas, svg'))) return false
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !isPlaced(el)
  })
  const name = (el: Element) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${(el.textContent || '').trim().slice(0, 24)}"`
  const offenders: string[] = []
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      if (pieces[i].contains(pieces[j]) || pieces[j].contains(pieces[i])) continue
      const a = pieces[i].getBoundingClientRect()
      const b = pieces[j].getBoundingClientRect()
      const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (width > 1 && height > 1) offenders.push(`${name(pieces[i])} over ${name(pieces[j])} (${Math.round(width)}×${Math.round(height)} px)`)
    }
  }
  return offenders
})

const TOP_FACE = '#pile sg-flip[data-engine]:not(.is-below) [data-body]'

test('L1: the face of the island top card keeps its content inside, with a long request and long options', async ({}, testInfo) => {
  cockpit.writeData(longRows())
  const island = await openIsland(cockpit.app)
  await expect(island.locator('#pile sg-flip[data-engine="e2e-question"]')).toHaveAttribute('flipped', '', { timeout: DATA_REFRESH_MS })
  await expect(island.locator(`${TOP_FACE} [data-act="quick"]`).first()).toBeVisible()
  await attachScreenshot(testInfo, island, 'L1-face')
  expect(await sideOverflowOf(island, TOP_FACE)).toEqual([])
  expect(await overlapsOf(island, TOP_FACE)).toEqual([])
})

test('L2: the enlarged island card scrolls; its title, request and reply never overlap', async ({}, testInfo) => {
  cockpit.writeData(longRows())
  const island = await openIsland(cockpit.app)
  await expect(island.locator('#pile sg-flip[data-engine="e2e-question"]')).toHaveAttribute('flipped', '', { timeout: DATA_REFRESH_MS })
  await island.locator(`${TOP_FACE} [data-act="details"]`).click()
  await expect(island.locator('#island')).toHaveClass(/\bis-card-big\b/)
  await expect(island.locator('#cardMore')).toBeVisible()
  // The content is taller than the card: the face scrolls instead of squeezing its blocks.
  expect(await island.locator(TOP_FACE).evaluate(body => body.scrollHeight > body.clientHeight)).toBe(true)
  await attachScreenshot(testInfo, island, 'L2-agrandie')
  expect(await overlapsOf(island, TOP_FACE)).toEqual([])
  expect(await sideOverflowOf(island, TOP_FACE)).toEqual([])
})

test('L3: a cockpit card keeps its content inside its face, small and enlarged, with long content', async ({}, testInfo) => {
  // The island shows its cockpit button with the full fixtures: open the cockpit first, then load the long content.
  const page = await openCockpit(cockpit.app)
  cockpit.writeData(longRows())
  const card = page.locator('sg-flip[data-engine="e2e-question"]')
  await expect(card.locator('sg-card')).toHaveAttribute('heading', /2348/, { timeout: DATA_REFRESH_MS })
  await expect(card).toHaveAttribute('flipped', '', { timeout: DATA_REFRESH_MS })
  await card.evaluate(el => el.scrollIntoView({ block: 'center' }))
  const face = 'sg-flip[data-engine="e2e-question"] .conv-card-body'
  expect(await sideOverflowOf(page, face)).toEqual([])
  expect(await overlapsOf(page, face)).toEqual([])
  await card.locator('[data-testid="card-enlarge"]').click()
  await expect(card).toHaveClass(/\bbig\b/)
  await attachScreenshot(testInfo, page, 'L3-agrandie')
  expect(await overlapsOf(page, face)).toEqual([])
  expect(await sideOverflowOf(page, face)).toEqual([])
})

test('L4: the "Nouvelle conversation" sheet is above its backdrop, laid out as a sheet, inside the window', async ({}, testInfo) => {
  const page = await openCockpit(cockpit.app)
  await page.locator('#new-conv').click()
  const sheet = page.locator('#newconv .t-sheet')
  await expect(sheet).toBeVisible()
  await attachScreenshot(testInfo, page, 'L4-nouvelle-conversation')
  // What a click on the title, the search field and the button reaches: the sheet, not the blurred backdrop over it.
  for (const target of ['#nc-title', '.nc-search', '[data-nc="open"]']) {
    const hit = await page.locator(`#newconv ${target}`).evaluate(el => {
      const rect = el.getBoundingClientRect()
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return top === null ? 'nothing' : top.closest('.t-sheet') !== null ? 'sheet' : `${top.tagName.toLowerCase()}.${top.className}`
    })
    expect(hit, target).toBe('sheet')
  }
  const box = await sheet.evaluate(el => {
    const rect = el.getBoundingClientRect()
    return { position: getComputedStyle(el).position, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight }
  })
  expect(box.position).not.toBe('static')
  expect(box.left).toBeGreaterThanOrEqual(0)
  expect(box.top).toBeGreaterThanOrEqual(0)
  expect(box.right).toBeLessThanOrEqual(box.width)
  expect(box.bottom).toBeLessThanOrEqual(box.height)
})
