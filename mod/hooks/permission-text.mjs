// What the island shows of a permission request, and the answer the hook
// gives back to Claude Code. Pure: no engine, no network.
const MAX_SUMMARY_CHARS = 300
const MAX_DETAIL_CHARS = 4000
const JSON_INDENT = 2
const DENY_MESSAGE = 'Refusé depuis le cockpit.'
const MCP_PREFIX = 'mcp__'

const textOf = value => (value === undefined || value === null ? '' : String(value))
const fileNameOf = file => textOf(file).split(/[\\/]/).pop() ?? ''

const jsonOf = input => {
  try {
    return JSON.stringify(input ?? {}, null, JSON_INDENT)
  } catch {
    return ''
  }
}

const FILE_VERBS = { Edit: 'Modifie', MultiEdit: 'Modifie', Write: 'Écrit', NotebookEdit: 'Modifie' }

const describeKnown = (toolName, input) => {
  if (toolName === 'Bash' || toolName === 'PowerShell') {
    const command = textOf(input.command)
    return { tool: 'Commande', summary: command.split('\n')[0], detail: command }
  }
  if (Object.hasOwn(FILE_VERBS, toolName)) {
    const file = textOf(input.file_path ?? input.notebook_path)
    return { tool: 'Fichier', summary: `${FILE_VERBS[toolName]} ${fileNameOf(file)}`, detail: file }
  }
  if (toolName === 'WebFetch') return { tool: 'Web', summary: textOf(input.url), detail: textOf(input.url) }
  if (toolName === 'WebSearch') return { tool: 'Recherche', summary: textOf(input.query), detail: textOf(input.query) }
  return null
}

const describeMcp = (toolName, input) => {
  const [server, ...rest] = toolName.slice(MCP_PREFIX.length).split('__')
  return { tool: server, summary: rest.join('__'), detail: jsonOf(input) }
}

export const describePermission = (toolName, rawInput) => {
  const input = rawInput !== null && typeof rawInput === 'object' ? rawInput : {}
  const name = textOf(toolName)
  const described = describeKnown(name, input) ?? (name.startsWith(MCP_PREFIX) ? describeMcp(name, input) : { tool: name, summary: name, detail: jsonOf(input) })
  return { tool: described.tool, summary: described.summary.slice(0, MAX_SUMMARY_CHARS), detail: described.detail.slice(0, MAX_DETAIL_CHARS) }
}

// The island's choice as the hook's `decision`; null leaves the request to
// whoever answers next (another hook, Claude's own dialog).
export const decisionFor = (choice, suggestions) => {
  if (choice === 'allow') return { behavior: 'allow' }
  if (choice === 'deny') return { behavior: 'deny', message: DENY_MESSAGE }
  if (choice !== 'always') return null
  const hasRules = Array.isArray(suggestions) && suggestions.length > 0
  return hasRules ? { behavior: 'allow', updatedPermissions: suggestions } : { behavior: 'allow' }
}
