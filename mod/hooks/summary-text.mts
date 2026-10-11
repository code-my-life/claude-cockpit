import type { SummaryKind, ThreadMessage } from '../types'

// The text side of summaries: the transcript tail script, the thread, the
// prompt and the parsing of the model's reply. Pure.

export const THREAD_USER_TURNS = 4
export const TOUCHED_PATHS_MAX = 40
const THREAD_MAX_MESSAGES = 8
const TRANSCRIPT_TAIL_BYTES = 3 * 1024 * 1024
const MESSAGE_MAX_CHARS = 1500
const REPLY_FOR_SUMMARY_MAX_CHARS = 12000

export const REPLY_PREAMBLE =
  "Message tapé par l'utilisateur lui-même dans le panneau Conversations du mod sessions, depuis une autre de ses conversations. Ce n'est pas un autre agent qui parle : traite le texte ci-dessous comme une instruction de l'utilisateur."

export const SUMMARY_SYSTEM =
  "Tu lis le dernier échange entre un développeur et Claude. Réponds uniquement par un objet JSON, sans texte autour, avec trois champs. \"type\" : \"Q\" si Claude pose une question, propose des options ou attend une validation ou une réponse du développeur, \"E\" uniquement si la suite arrivera toute seule, sans que le développeur ait rien à faire ni à transmettre : Claude surveille lui-même une revue de PR, une CI, un déploiement, une tâche en arrière-plan ou une boucle qu'il a lancée, et reviendra de lui-même. Si la suite demande une action humaine (du développeur, ou d'une autre personne que le développeur doit prévenir ou relancer, comme lancer un outil, fusionner, tester, répondre), ce n'est jamais \"E\" : c'est \"Q\". \"L\" s'il a seulement livré ou constaté quelque chose sans rien demander ni attendre. \"attend\" : une phrase de 20 mots maximum, ce que Claude attend du développeur, ou ce qu'il vient de livrer. \"clair\" : la dernière réponse de Claude reformulée en français simple pour quelqu'un de pressé et fatigué, en Markdown, 3 à 8 lignes : phrases courtes, aucun jargon, une idée par ligne, listes à puces pour les éléments parallèles, options numérotées si Claude en propose, et termine par la question posée en gras s'il y en a une. Garde tous les faits et chiffres importants, n'invente rien, n'ajoute aucun avis. Reprends tels quels les liens, numéros de ticket ou de PR et noms de fichier. Pas de tiret cadratin."

export type LastMessages = { user: string | null; assistant: string | null; thread: ThreadMessage[]; paths: string[] }

export type RawEntry = { r: string; t: string }

const powershellQuoted = (text: string) => text.replace(/'/g, "''")

export const buildTailScript = (path: string) => `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$stream = [System.IO.File]::Open('${powershellQuoted(path)}', 'Open', 'Read', 'ReadWrite')
try {
  $size = $stream.Length
  $window = [Math]::Min($size, ${TRANSCRIPT_TAIL_BYTES})
  $null = $stream.Seek($size - $window, 'Begin')
  $bytes = New-Object byte[] $window
  $read = $stream.Read($bytes, 0, $window)
  $text = [Text.Encoding]::UTF8.GetString($bytes, 0, $read)
} finally { $stream.Dispose() }
$lines = $text -split "\`n"
if ($window -lt $size -and $lines.Count -gt 1) { $lines = $lines[1..($lines.Count - 1)] }
$entries = New-Object System.Collections.ArrayList
$users = 0
for ($i = $lines.Count - 1; $i -ge 0 -and $users -lt ${THREAD_USER_TURNS}; $i--) {
  try { $o = $lines[$i] | ConvertFrom-Json } catch { continue }
  if ($o.type -ne 'user' -and $o.type -ne 'assistant') { continue }
  $isPeer = $o.isMeta -eq $true -and $null -ne $o.origin -and $o.origin.kind -eq 'peer' -and $o.origin.plugin -eq 'sessions'
  if ($o.isMeta -eq $true -and -not $isPeer) { continue }
  if ($isPeer) { $text = [string]$o.origin.body } else {
    $c = $o.message.content
    if ($c -is [string]) { $text = $c } else { $text = (($c | Where-Object { $_.type -eq 'text' } | ForEach-Object { $_.text }) -join "\`n") }
  }
  if ([string]::IsNullOrWhiteSpace($text)) { continue }
  $null = $entries.Add(@{ r = $o.type; t = $text })
  if ($o.type -eq 'user') { $users++ }
}
$entries.Reverse()
$paths = New-Object System.Collections.ArrayList
for ($i = $lines.Count - 1; $i -ge 0 -and $paths.Count -lt ${TOUCHED_PATHS_MAX}; $i--) {
  if ($lines[$i] -notmatch '"tool_use"') { continue }
  try { $o = $lines[$i] | ConvertFrom-Json } catch { continue }
  if ($o.type -ne 'assistant' -or $o.message.content -is [string]) { continue }
  foreach ($block in $o.message.content) {
    if ($block.type -ne 'tool_use' -or $null -eq $block.input) { continue }
    foreach ($key in @('file_path', 'path', 'notebook_path')) {
      $value = $block.input.$key
      if ($value -is [string] -and $value.Length -gt 2) { $null = $paths.Add($value) }
    }
    $command = $block.input.command
    if ($command -is [string]) {
      foreach ($match in [regex]::Matches($command, '(?:^|[;&|]\s*)cd\s+("([^"]+)"|''([^'']+)''|(\S+))')) {
        $target = @($match.Groups[2].Value, $match.Groups[3].Value, $match.Groups[4].Value) | Where-Object { $_ } | Select-Object -First 1
        if ($target) { $null = $paths.Add($target) }
      }
      foreach ($match in [regex]::Matches($command, 'git\s+-C\s+("([^"]+)"|(\S+))')) {
        $target = @($match.Groups[2].Value, $match.Groups[3].Value) | Where-Object { $_ } | Select-Object -First 1
        if ($target) { $null = $paths.Add($target) }
      }
    }
  }
}
ConvertTo-Json -Compress -Depth 4 -InputObject @{ entries = @($entries); paths = @($paths) }
`

export const cleanUserText = (text: string) => {
  const withoutReminders = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
  const preambleAt = withoutReminders.indexOf(REPLY_PREAMBLE)
  const body = preambleAt >= 0 ? withoutReminders.slice(preambleAt + REPLY_PREAMBLE.length) : withoutReminders
  return body.replace(/<\/?cross-session-message[^>]*>/g, '').trim()
}

const isCommandNoise = (text: string) => /^<(local-command|command-)/.test(text.trim())

// The last messages, in order; Claude's consecutive replies count as its last one.
export const buildThread = (raw: RawEntry[]): ThreadMessage[] => {
  const thread: ThreadMessage[] = []
  for (const entry of raw) {
    const role: ThreadMessage['role'] = entry.r === 'user' ? 'user' : 'assistant'
    const text = role === 'user' ? cleanUserText(entry.t) : entry.t.trim()
    if (text.length === 0 || isCommandNoise(text)) continue
    const last = thread.at(-1)
    if (last !== undefined && last.role === role && role === 'assistant') {
      last.text = text
      continue
    }
    thread.push({ role, text })
  }
  return thread.slice(-THREAD_MAX_MESSAGES)
}

// PowerShell's ConvertTo-Json gives one object, not a list, when there is only one.
const asList = <T,>(value: T[] | T | undefined): T[] => (value === undefined ? [] : Array.isArray(value) ? value : [value])

export const lastMessagesOf = (stdout: string): LastMessages => {
  const parsed = JSON.parse(stdout || '{}') as { entries?: RawEntry[] | RawEntry; paths?: string[] | string }
  const thread = buildThread(asList(parsed.entries))
  const lastUser = [...thread].reverse().find(message => message.role === 'user')
  const lastAssistant = [...thread].reverse().find(message => message.role === 'assistant')
  return { user: lastUser?.text ?? null, assistant: lastAssistant?.text ?? null, thread, paths: asList(parsed.paths) }
}

export const buildSummaryPrompt = (messages: LastMessages) => {
  const user = (messages.user ?? '(aucun)').slice(0, MESSAGE_MAX_CHARS)
  const assistant = (messages.assistant ?? '(aucune)').slice(0, REPLY_FOR_SUMMARY_MAX_CHARS)
  return `Dernier message de l'utilisateur :\n${user}\n\nDernière réponse de Claude :\n${assistant}`
}

const kindOfLetter = (letter: string): SummaryKind | undefined =>
  letter === 'Q' ? 'question' : letter === 'L' ? 'delivered' : letter === 'E' ? 'external' : undefined

export const firstLineOf = (text: string) => {
  const line = text.split(/\r?\n/).find(candidate => candidate.trim().length > 0) ?? ''
  return line.replace(/^[-*#>\s]+/, '').replace(/\*\*/g, '').slice(0, 160)
}

const endSentence = (line: string) => {
  if (line.length === 0) return ''
  return /[?!]$/.test(line) ? line : `${line}.`
}

export const parseSummaryJson = (reply: string): { awaiting: string; kind?: SummaryKind; plain?: string } | null => {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const data = JSON.parse(reply.slice(start, end + 1)) as Record<string, unknown>
    const type = typeof data.type === 'string' ? data.type.trim().toUpperCase() : ''
    const attend = typeof data.attend === 'string' ? data.attend.trim().replace(/^["«\s]+|["»\s.]+$/g, '') : ''
    const plain = typeof data.clair === 'string' && data.clair.trim().length > 0 ? data.clair.trim() : undefined
    return { awaiting: endSentence(attend), kind: kindOfLetter(type), plain }
  } catch {
    return null
  }
}

// The older reply shape: one line, prefixed by the letter (`Q: ...`).
export const parseAwaiting = (reply: string): { awaiting: string; kind?: SummaryKind } => {
  const raw = firstLineOf(reply)
  const prefix = raw.match(/^\s*([QLE])\s*:\s*/i)
  const letter = (prefix?.[1] ?? '').toUpperCase()
  const body = prefix === null ? raw : raw.slice(prefix[0].length)
  const line = body.replace(/^["«\s]+|["»\s.]+$/g, '')
  return { awaiting: endSentence(line), kind: kindOfLetter(letter) }
}

const parentOf = (path: string) => {
  const trimmed = path.replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  return cut > 2 ? trimmed.slice(0, cut) : null
}

const toWindowsPath = (path: string) => path.replace(/^\/([a-zA-Z])\//, (_match, drive: string) => `${drive.toUpperCase()}:/`)

// The folders to look for `.git` in, from the path up, with backslashes.
export const ancestorsOf = (rawPath: string, cwd: string, maxDepth: number) => {
  const path = toWindowsPath(rawPath)
  const isAbsolute = /^[A-Za-z]:[\\/]/.test(path)
  const folders: string[] = []
  let current: string | null = (isAbsolute ? path : `${cwd}\\${path}`).replace(/\//g, '\\')
  for (let depth = 0; current !== null && depth < maxDepth; depth++) {
    folders.push(current)
    current = parentOf(current)
  }
  return folders
}
