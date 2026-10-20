import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { extractHostSession, loadIndex, readLiveEngineIds, readRemoteRepo, refreshIndex, repoFromGitConfig, runningDistrosOf, saveIndex, saveSessionList, scanHostFiles, sessionsOf, sortPrs, ticketOf, wslLiveDirsOf } from './session-index.mjs'

const makeTree = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-index-'))
  const orgDir = path.join(root, 'sessions', 'account', 'org')
  fs.mkdirSync(orgDir, { recursive: true })
  const liveDir = path.join(root, 'live')
  fs.mkdirSync(liveDir, { recursive: true })
  return { root, sessionsDir: path.join(root, 'sessions'), orgDir, liveDir, indexFile: path.join(root, 'session-index.json') }
}

const hostJson = (hostId, engineId, title) => JSON.stringify({
  sessionId: hostId,
  cliSessionId: engineId,
  title,
  cwd: 'C:\\repos\\rd',
  lastActivityAt: 1000,
  isArchived: false,
  remoteMcpServersConfig: { huge: 'x'.repeat(5000) },
})

const countingReader = () => {
  const reads = []
  const read = async file => {
    reads.push(file)
    return fs.promises.readFile(file, 'utf8')
  }
  return { reads, read }
}

test('keeps only the fields the cockpit needs', () => {
  const text = hostJson('local_a', 'engine-a', 'Analyse ticket 2254')
  const session = extractHostSession(text)
  assert.deepEqual(session, { hostId: 'local_a', engineId: 'engine-a', title: 'Analyse ticket 2254', cwd: 'C:\\repos\\rd', lastActivityAt: 1000, isArchived: false, gitCommonDir: null, branch: null, prs: [], ticket: '2254', priorEngineIds: [], wslDistro: null })
})

test('the earlier engine ids of a conversation are kept, without the current one or broken values', () => {
  const text = JSON.stringify({ sessionId: 'local_c', cliSessionId: 'engine-now', priorCliSessionIds: ['engine-old', 'engine-now', 42, 'engine-older'] })
  const session = extractHostSession(text)
  assert.deepEqual(session.priorEngineIds, ['engine-old', 'engine-older'])
})

test('a file without session ids or with broken json gives no session', () => {
  const withoutIds = extractHostSession('{"scheduledTasks":[]}')
  const broken = extractHostSession('{"sessionId": ')
  assert.equal(withoutIds, null)
  assert.equal(broken, null)
})

test('a missing title falls back to a readable label', () => {
  const text = JSON.stringify({ sessionId: 'local_b', cliSessionId: 'engine-b' })
  const session = extractHostSession(text)
  assert.equal(session.title, '(sans titre)')
  assert.equal(session.cwd, '')
  assert.equal(session.lastActivityAt, 0)
})

test('only new or modified files are read again', async () => {
  const tree = makeTree()
  const fileA = path.join(tree.orgDir, 'local_a.json')
  const fileB = path.join(tree.orgDir, 'local_b.json')
  fs.writeFileSync(fileA, hostJson('local_a', 'engine-a', 'A'))
  fs.writeFileSync(fileB, hostJson('local_b', 'engine-b', 'B'))
  const first = countingReader()
  const firstFiles = await scanHostFiles(tree.sessionsDir)
  const built = await refreshIndex({ files: {} }, firstFiles, first.read)
  assert.equal(first.reads.length, 2)
  assert.equal(built.changed, true)

  const later = new Date(Date.now() + 5000)
  fs.writeFileSync(fileB, hostJson('local_b', 'engine-b', 'B renommée'))
  fs.utimesSync(fileB, later, later)
  const second = countingReader()
  const secondFiles = await scanHostFiles(tree.sessionsDir)
  const rebuilt = await refreshIndex(built.index, secondFiles, second.read)
  assert.deepEqual(second.reads, [fileB])
  assert.equal(rebuilt.index.files[fileB].session.title, 'B renommée')

  const third = countingReader()
  const thirdFiles = await scanHostFiles(tree.sessionsDir)
  const unchanged = await refreshIndex(rebuilt.index, thirdFiles, third.read)
  assert.equal(third.reads.length, 0)
  assert.equal(unchanged.changed, false)
})

test('a deleted file leaves the index', async () => {
  const tree = makeTree()
  const fileA = path.join(tree.orgDir, 'local_a.json')
  fs.writeFileSync(fileA, hostJson('local_a', 'engine-a', 'A'))
  const reader = countingReader()
  const files = await scanHostFiles(tree.sessionsDir)
  const built = await refreshIndex({ files: {} }, files, reader.read)
  fs.rmSync(fileA)
  const emptyFiles = await scanHostFiles(tree.sessionsDir)
  const rebuilt = await refreshIndex(built.index, emptyFiles, reader.read)
  assert.deepEqual(rebuilt.index.files, {})
  assert.equal(rebuilt.changed, true)
})

test('a file that cannot be read is kept as no session and retried when it changes', async () => {
  const tree = makeTree()
  const fileA = path.join(tree.orgDir, 'local_a.json')
  fs.writeFileSync(fileA, hostJson('local_a', 'engine-a', 'A'))
  const files = await scanHostFiles(tree.sessionsDir)
  const failing = async () => { throw new Error('verrouillé') }
  const built = await refreshIndex({ files: {} }, files, failing)
  assert.equal(built.index.files[fileA].session, null)
})

test('the saved index is reused after a restart, so nothing is read again', async () => {
  const tree = makeTree()
  const fileA = path.join(tree.orgDir, 'local_a.json')
  fs.writeFileSync(fileA, hostJson('local_a', 'engine-a', 'A'))
  const reader = countingReader()
  const files = await scanHostFiles(tree.sessionsDir)
  const built = await refreshIndex({ files: {} }, files, reader.read)
  saveIndex(tree.indexFile, built.index)
  const restored = loadIndex(tree.indexFile)
  const afterRestart = countingReader()
  const sameFiles = await scanHostFiles(tree.sessionsDir)
  const reused = await refreshIndex(restored, sameFiles, afterRestart.read)
  assert.equal(afterRestart.reads.length, 0)
  assert.equal(reused.index.files[fileA].session.engineId, 'engine-a')
})

test('a missing or broken saved index starts empty', () => {
  const tree = makeTree()
  const missing = loadIndex(tree.indexFile)
  fs.writeFileSync(tree.indexFile, '{ broken')
  const broken = loadIndex(tree.indexFile)
  assert.deepEqual(missing, { files: {} })
  assert.deepEqual(broken, { files: {} })
})

test('the list read by conversations holds only sessions and live ids, no paths', async () => {
  const tree = makeTree()
  const fileA = path.join(tree.orgDir, 'local_a.json')
  const broken = path.join(tree.orgDir, 'local_broken.json')
  fs.writeFileSync(fileA, hostJson('local_a', 'engine-a', 'A'))
  fs.writeFileSync(broken, '{ broken')
  const reader = countingReader()
  const files = await scanHostFiles(tree.sessionsDir)
  const built = await refreshIndex({ files: {} }, files, reader.read)
  const listFile = path.join(tree.root, 'session-list.json')
  saveSessionList(listFile, built.index, ['engine-a'])
  const saved = JSON.parse(fs.readFileSync(listFile, 'utf8'))
  const sessions = sessionsOf(built.index)
  assert.deepEqual(saved.live, ['engine-a'])
  const expectedHosts = sessions.map(({ priorEngineIds, wslDistro, ...session }) => ({ ...session, repo: null }))
  assert.deepEqual(saved.hosts, expectedHosts)
  assert.equal(saved.hosts.length, 1)
  const savedKeys = Object.keys(saved).sort()
  const hostKeys = Object.keys(saved.hosts[0]).sort()
  assert.deepEqual(savedKeys, ['hosts', 'live'])
  assert.deepEqual(hostKeys, ['branch', 'cwd', 'engineId', 'gitCommonDir', 'hostId', 'isArchived', 'lastActivityAt', 'prs', 'repo', 'ticket', 'title'])
})

test('the git folder, the branch and the pull requests are kept', () => {
  const text = JSON.stringify({
    sessionId: 'local_c',
    cliSessionId: 'engine-c',
    title: 'Banc managed agents',
    gitAnchors: [{ gitRoot: 'C:\\repos\\poc', commonDir: 'C:\\repos\\poc\\.git' }],
    branch: 'feature/2254-banc',
    prs: [
      { prNumber: 1, repo: 'acme/poc', url: 'https://github.com/acme/poc/pull/1', state: 'MERGED', branch: 'feature/2254-banc' },
      { prNumber: 'oops', url: 42 },
      { prNumber: 4, repo: 'acme/poc', url: 'https://github.com/acme/poc/pull/4', state: 'OPEN', branch: 'feature/2254-suite' },
    ],
  })
  const session = extractHostSession(text)
  assert.equal(session.gitCommonDir, 'C:\\repos\\poc\\.git')
  assert.equal(session.branch, 'feature/2254-banc')
  assert.equal(session.ticket, '2254')
  assert.deepEqual(session.prs, [
    { number: 4, repo: 'acme/poc', url: 'https://github.com/acme/poc/pull/4', state: 'OPEN' },
    { number: 1, repo: 'acme/poc', url: 'https://github.com/acme/poc/pull/1', state: 'MERGED' },
  ])
})

test('a pull request listed twice is kept once', () => {
  const pr = { prNumber: 16, repo: 'acme/gtm', url: 'https://github.com/acme/gtm/pull/16', state: 'OPEN' }
  const text = JSON.stringify({ sessionId: 'local_d', cliSessionId: 'engine-d', prs: [pr, { ...pr }] })
  const session = extractHostSession(text)
  assert.equal(session.prs.length, 1)
})

test('the ticket comes from the branch first, then from the title only after ticket or #', () => {
  const fromBranch = ticketOf(['bugfix/2328-filtre'], 'Analyse ticket 2254')
  const plainBranch = ticketOf(['feature/banc-managed-agents'], 'Banc managed agents')
  const fromTitle = ticketOf([], 'Ticket 2255 checklist')
  const fromHash = ticketOf([], '#2039 relecture')
  const year = ticketOf([], 'Planning 2026')
  const shortNumber = ticketOf([], 'PR #20 merge')
  const branchWithoutPrefix = ticketOf(['2401-hotfix'], '')
  assert.equal(fromBranch, '2328')
  assert.equal(plainBranch, null)
  assert.equal(fromTitle, '2255')
  assert.equal(fromHash, '2039')
  assert.equal(year, null)
  assert.equal(shortNumber, null)
  assert.equal(branchWithoutPrefix, '2401')
})

test('open pull requests come first, then merged, closed, newest first within a state', () => {
  const sorted = sortPrs([
    { number: 1, state: 'CLOSED' },
    { number: 2, state: 'MERGED' },
    { number: 3, state: 'OPEN' },
    { number: 5, state: 'OPEN' },
    { number: 4, state: 'DRAFT' },
  ])
  const numbers = sorted.map(pr => pr.number)
  assert.deepEqual(numbers, [5, 3, 4, 2, 1])
})

test('the GitHub repository is read from the origin remote, https or ssh', () => {
  const https = repoFromGitConfig('[core]\n\tbare = false\n[remote "upstream"]\n\turl = https://github.com/other/thing.git\n[remote "origin"]\n\turl = https://github.com/code-my-life/claude-cockpit.git\n')
  const ssh = repoFromGitConfig('[remote "origin"]\n\turl = git@github.com:acme/rd.git\n')
  const noSuffix = repoFromGitConfig('[remote "origin"]\n  url = https://github.com/acme/gtm-mcp-server\n')
  const gitlab = repoFromGitConfig('[remote "origin"]\n\turl = https://gitlab.com/team/app.git\n')
  const noOrigin = repoFromGitConfig('[core]\n\tbare = false\n')
  assert.equal(https, 'code-my-life/claude-cockpit')
  assert.equal(ssh, 'acme/rd')
  assert.equal(noSuffix, 'acme/gtm-mcp-server')
  assert.equal(gitlab, null)
  assert.equal(noOrigin, null)
})

test('a missing git config gives no repository', async () => {
  const tree = makeTree()
  const commonDir = path.join(tree.root, 'repo', '.git')
  fs.mkdirSync(commonDir, { recursive: true })
  fs.writeFileSync(path.join(commonDir, 'config'), '[remote "origin"]\n\turl = https://github.com/acme/rd.git\n')
  const found = await readRemoteRepo(commonDir)
  const missing = await readRemoteRepo(path.join(tree.root, 'absent', '.git'))
  const empty = await readRemoteRepo(null)
  assert.equal(found, 'acme/rd')
  assert.equal(missing, null)
  assert.equal(empty, null)
})

test('the repository shown comes from the pull request, else from the git remote', async () => {
  const tree = makeTree()
  const withPr = path.join(tree.orgDir, 'local_pr.json')
  const withRemote = path.join(tree.orgDir, 'local_remote.json')
  fs.writeFileSync(withPr, JSON.stringify({ sessionId: 'local_pr', cliSessionId: 'engine-pr', gitAnchors: [{ commonDir: 'C:\\poc\\.git' }], prs: [{ prNumber: 2, repo: 'acme/poc', url: 'https://github.com/acme/poc/pull/2', state: 'OPEN' }] }))
  fs.writeFileSync(withRemote, JSON.stringify({ sessionId: 'local_remote', cliSessionId: 'engine-remote', gitAnchors: [{ commonDir: 'C:\\rd\\.git' }] }))
  const reader = countingReader()
  const files = await scanHostFiles(tree.sessionsDir)
  const built = await refreshIndex({ files: {} }, files, reader.read)
  const listFile = path.join(tree.root, 'session-list.json')
  const remotes = new Map([['C:\\poc\\.git', 'someone/else'], ['C:\\rd\\.git', 'acme/rd']])
  saveSessionList(listFile, built.index, [], remotes)
  const saved = JSON.parse(fs.readFileSync(listFile, 'utf8'))
  const byId = Object.fromEntries(saved.hosts.map(host => [host.engineId, host.repo]))
  assert.deepEqual(byId, { 'engine-pr': 'acme/poc', 'engine-remote': 'acme/rd' })
})

test('a cache saved by an older version is ignored, so every file is read again once', () => {
  const tree = makeTree()
  fs.writeFileSync(tree.indexFile, JSON.stringify({ files: { 'C:\\a.json': { mtimeMs: 1, session: null } } }))
  const restored = loadIndex(tree.indexFile)
  assert.deepEqual(restored, { files: {} })
})

test('a missing sessions folder gives an empty scan', async () => {
  const files = await scanHostFiles(path.join(os.tmpdir(), 'cockpit-index-absent-folder'))
  assert.deepEqual(files, [])
})

test('live engine ids come from the running sessions folder, broken files skipped', async () => {
  const tree = makeTree()
  fs.writeFileSync(path.join(tree.liveDir, '1.json'), JSON.stringify({ sessionId: 'engine-a' }))
  fs.writeFileSync(path.join(tree.liveDir, '2.json'), '{ broken')
  fs.writeFileSync(path.join(tree.liveDir, 'notes.txt'), 'ignored')
  const ids = await readLiveEngineIds(tree.liveDir)
  assert.deepEqual(ids, ['engine-a'])
})

test('a Claude Desktop session run in WSL keeps its distro', () => {
  const session = extractHostSession(JSON.stringify({ sessionId: 'local_w', cliSessionId: 'engine-w', title: 'W', cwd: '/home/ana/app', wslConfig: { distro: 'Ubuntu-24.04' } }))
  assert.equal(session.wslDistro, 'Ubuntu-24.04')
  assert.equal(extractHostSession(JSON.stringify({ sessionId: 'local_x', cliSessionId: 'engine-x', wslConfig: 'odd' })).wslDistro, null)
})

test('the live files of WSL sessions are read in the Linux home of running distros only', () => {
  const sessions = [
    { wslDistro: 'Ubuntu-24.04', cwd: '/home/ana/app' },
    { wslDistro: 'Ubuntu-24.04', cwd: '/home/ana' },
    { wslDistro: 'Ubuntu-24.04', cwd: '/root/work' },
    { wslDistro: 'Ubuntu-24.04', cwd: '/mnt/c/Users/ana' },
    { wslDistro: 'Debian', cwd: '/home/bob/x' },
    { wslDistro: null, cwd: 'C:\\repos\\rd' },
  ]
  assert.deepEqual(wslLiveDirsOf(sessions, ['Ubuntu-24.04']), [
    '\\\\wsl.localhost\\Ubuntu-24.04\\home\\ana\\.claude\\sessions',
    '\\\\wsl.localhost\\Ubuntu-24.04\\root\\.claude\\sessions',
  ])
  assert.deepEqual(wslLiveDirsOf(sessions, []), [])
})

test('the running distros are read from wsl.exe in UTF-16 or UTF-8', () => {
  const names = ['Ubuntu-24.04', 'docker-desktop']
  assert.deepEqual(runningDistrosOf(Buffer.from('\uFEFFUbuntu-24.04\r\ndocker-desktop\r\n', 'utf16le')), names)
  assert.deepEqual(runningDistrosOf(Buffer.from('Ubuntu-24.04\r\ndocker-desktop\r\n', 'utf8')), names)
  assert.deepEqual(runningDistrosOf(Buffer.alloc(0)), [])
})
