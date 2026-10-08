import fs from 'node:fs'

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const FILES_MAX = 500
const ACTIVE_GAP_MAX_MS = 15 * 60 * 1000
const ACC_VERSION = 2

const dayOf = at => new Date(at).toLocaleDateString('sv')

const isHumanPrompt = entry => {
  if (entry.type !== 'user' || entry.isMeta || entry.isSidechain || entry.isCompactSummary) return false
  const content = entry.message && entry.message.content
  if (typeof content === 'string') return !content.startsWith('<') && !content.startsWith('[Request interrupted')
  if (!Array.isArray(content)) return false
  const hasToolResult = content.some(block => block.type === 'tool_result')
  const hasText = content.some(block => block.type === 'text' || block.type === 'image')
  return hasText && !hasToolResult
}

const timeOf = entry => {
  const parsed = Date.parse(entry.timestamp || '')
  return Number.isNaN(parsed) ? null : parsed
}

const countEntry = (acc, entry) => {
  const at = timeOf(entry)
  if (at !== null && (entry.type === 'user' || entry.type === 'assistant')) {
    const gap = acc.lastAt === null ? 0 : at - acc.lastAt
    if (gap > 0 && gap <= ACTIVE_GAP_MAX_MS) acc.activeMs += gap
    if (acc.firstAt === null || at < acc.firstAt) acc.firstAt = at
    if (acc.lastAt === null || at > acc.lastAt) acc.lastAt = at
  }
  if (isHumanPrompt(entry)) {
    acc.messages += 1
    if (at === null) return
    const day = dayOf(at)
    if (acc.today.day !== day) acc.today = { day, prompts: 0, delays: [] }
    acc.today.prompts += 1
    if (acc.lastAssistantAt !== null && at > acc.lastAssistantAt) acc.today.delays.push(at - acc.lastAssistantAt)
    return
  }
  if (entry.type !== 'assistant' || entry.isSidechain) return
  if (at !== null) acc.lastAssistantAt = at
  const content = Array.isArray(entry.message && entry.message.content) ? entry.message.content : []
  const messageId = entry.message && entry.message.id
  const hasText = content.some(block => block.type === 'text' && String(block.text || '').trim().length > 0)
  if (hasText && messageId !== acc.lastTextMessageId) {
    acc.messages += 1
    acc.lastTextMessageId = messageId
  }
  for (const block of content) {
    if (block.type !== 'tool_use') continue
    acc.tools += 1
    if (!FILE_TOOLS.has(block.name)) continue
    const input = block.input || {}
    const file = input.file_path || input.notebook_path
    if (file && !acc.files.includes(file) && acc.files.length < FILES_MAX) acc.files.push(file)
  }
}

const emptyAcc = () => ({ version: ACC_VERSION, messages: 0, tools: 0, files: [], firstAt: null, lastAt: null, activeMs: 0, lastTextMessageId: null, lastAssistantAt: null, today: { day: '', prompts: 0, delays: [] } })

const scan = job => {
  const isResumable = job.offset > 0 && job.acc && job.acc.version === ACC_VERSION
  const acc = isResumable ? { ...emptyAcc(), ...job.acc } : emptyAcc()
  const startOffset = isResumable ? job.offset : 0
  const size = fs.statSync(job.path).size
  if (size < startOffset) return scan({ ...job, offset: 0, acc: null })
  if (size === startOffset) return { id: job.id, offset: startOffset, acc }
  const handle = fs.openSync(job.path, 'r')
  const buffer = Buffer.alloc(size - startOffset)
  fs.readSync(handle, buffer, 0, buffer.length, startOffset)
  fs.closeSync(handle)
  const lastNewline = buffer.lastIndexOf(10)
  if (lastNewline < 0) return { id: job.id, offset: startOffset, acc }
  const text = buffer.subarray(0, lastNewline).toString('utf8')
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue
    let entry
    try { entry = JSON.parse(line) } catch { continue }
    countEntry(acc, entry)
  }
  return { id: job.id, offset: startOffset + lastNewline + 1, acc }
}

const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
fs.rmSync(process.argv[2], { force: true })
const results = []
for (const job of jobs) {
  try {
    results.push(scan(job))
  } catch (error) {
    results.push({ id: job.id, error: String(error && error.message || error).slice(0, 200) })
  }
}
process.stdout.write(JSON.stringify(results))
