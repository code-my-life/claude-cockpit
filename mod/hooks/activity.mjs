// What a conversation is doing, step by step, for the island's activity feed:
// the file it edits (with the lines added and removed, and a short diff), the
// command it runs, what it reads or searches. Pure: no engine, no network.
export const MAX_STEPS = 5
export const DIFF_KEEP = 3
export const DIFF_MAX_CHARS = 2000
const LABEL_MAX_CHARS = 120
const MERGED_KINDS = new Set(['read', 'search'])

const textOf = value => (value === undefined || value === null ? '' : String(value))
const nameOf = file => textOf(file).split(/[\\/]/).pop() ?? ''
const cut = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text)
const linesIn = text => (text === '' ? 0 : text.replace(/\n$/, '').split('\n').length)
const firstLine = text => textOf(text).split('\n')[0]

const hostOf = url => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const editStep = (at, verb, file, pairs) => ({
  at,
  kind: 'edit',
  label: `${verb} ${nameOf(file)}`,
  file,
  added: pairs.reduce((sum, pair) => sum + linesIn(pair.after), 0),
  removed: pairs.reduce((sum, pair) => sum + linesIn(pair.before), 0),
  diff: {
    before: cut(pairs.map(pair => pair.before).join('\n…\n'), DIFF_MAX_CHARS),
    after: cut(pairs.map(pair => pair.after).join('\n…\n'), DIFF_MAX_CHARS),
  },
})

const fileStep = (at, tool, input) => {
  const file = textOf(input.file_path ?? input.notebook_path)
  if (tool === 'Edit') return editStep(at, 'Modifie', file, [{ before: textOf(input.old_string), after: textOf(input.new_string) }])
  if (tool === 'MultiEdit') {
    const edits = Array.isArray(input.edits) ? input.edits : []
    return editStep(at, 'Modifie', file, edits.map(edit => ({ before: textOf(edit?.old_string), after: textOf(edit?.new_string) })))
  }
  if (tool === 'Write') return editStep(at, 'Écrit', file, [{ before: '', after: textOf(input.content) }])
  if (tool === 'NotebookEdit') return editStep(at, 'Modifie', file, [{ before: '', after: textOf(input.new_source) }])
  return null
}

const otherStep = (at, tool, input) => {
  if (tool === 'Read') return { at, kind: 'read', label: `Lit ${nameOf(input.file_path)}`, file: textOf(input.file_path) }
  if (tool === 'Bash' || tool === 'PowerShell') return { at, kind: 'command', label: `Lance ${firstLine(input.command)}` }
  if (tool === 'Grep' || tool === 'Glob') return { at, kind: 'search', label: `Cherche « ${textOf(input.pattern)} »` }
  if (tool === 'WebFetch') return { at, kind: 'web', label: `Consulte ${hostOf(textOf(input.url))}` }
  if (tool === 'WebSearch') return { at, kind: 'web', label: `Cherche sur le web « ${textOf(input.query)} »` }
  if (tool === 'Agent' || tool === 'Task') return { at, kind: 'agent', label: `Délègue : ${textOf(input.description)}` }
  return { at, kind: 'tool', label: `Utilise ${tool}` }
}

// The step a tool call adds to the feed.
export const stepOf = (tool, rawInput, at) => {
  const input = rawInput !== null && typeof rawInput === 'object' ? rawInput : {}
  const name = textOf(tool)
  const step = fileStep(at, name, input) ?? otherStep(at, name, input)
  return { ...step, label: cut(step.label, LABEL_MAX_CHARS) }
}

// The feed with one more step: the last ones only, and the diff text only for
// the last edits, so the store shared by every conversation stays small.
export const pushStep = (list, step) => {
  if (step === null || step === undefined) return list
  const last = list[list.length - 1]
  const isRepeat = last !== undefined && MERGED_KINDS.has(step.kind) && last.kind === step.kind && last.label === step.label
  const steps = [...(isRepeat ? list.slice(0, -1) : list), step].slice(-MAX_STEPS)
  let diffsLeft = DIFF_KEEP
  return steps.reduceRight((kept, entry) => {
    if (entry.diff === undefined) return [entry, ...kept]
    if (diffsLeft > 0) {
      diffsLeft -= 1
      return [entry, ...kept]
    }
    const { diff, ...withoutDiff } = entry
    return [withoutDiff, ...kept]
  }, [])
}
