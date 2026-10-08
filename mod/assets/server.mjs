import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const [, , rootDir, portArg] = process.argv
const PORT = Number(portArg || 48123)
const INBOX = path.join(rootDir, 'inbox')
const MAX_BODY_BYTES = 40 * 1024 * 1024

const say = payload => process.stdout.write(`${JSON.stringify(payload)}\n`)

const readBody = request =>
  new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('corps trop volumineux'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })

const send = (response, status, body, type = 'application/json; charset=utf-8') => {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
  response.end(body)
}

const serveFile = (response, name, type) => {
  try {
    const content = fs.readFileSync(path.join(rootDir, name))
    send(response, 200, content, type)
  } catch {
    send(response, 404, 'introuvable', 'text/plain; charset=utf-8')
  }
}

const extensionOf = mimeType => {
  const subtype = (mimeType || 'image/png').split('/')[1] || 'png'
  return subtype === 'jpeg' ? 'jpg' : subtype
}

const saveImages = images => {
  if (images.length === 0) return []
  fs.mkdirSync(INBOX, { recursive: true })
  const stamp = Date.now()
  return images.map((image, index) => {
    const file = path.join(INBOX, `${stamp}-${index + 1}.${extensionOf(image.type)}`)
    fs.writeFileSync(file, Buffer.from(image.base64, 'base64'))
    return file
  })
}

const openTerminal = cwd => {
  const isFolder = cwd.length > 0 && fs.existsSync(cwd) && fs.statSync(cwd).isDirectory()
  if (!isFolder) throw new Error(`dossier introuvable : ${cwd}`)
  const child = spawn('cmd.exe', ['/d', '/c', 'start', '""', 'wt.exe', '-d', cwd], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
}

const handle = async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  const isGet = request.method === 'GET'
  const isPost = request.method === 'POST'
  if (isGet && (url.pathname === '/' || url.pathname === '/conversations.html')) {
    return serveFile(response, 'conversations.html', 'text/html; charset=utf-8')
  }
  if (isGet && url.pathname === '/conversations-data.js') {
    return serveFile(response, 'conversations-data.js', 'text/javascript; charset=utf-8')
  }
  if (isGet && url.pathname === '/ping') return send(response, 200, '{"ok":true}')
  if (isPost && url.pathname === '/reply') {
    const raw = await readBody(request)
    const body = JSON.parse(raw)
    const images = saveImages(Array.isArray(body.images) ? body.images : [])
    say({ type: 'reply', engineId: String(body.engineId), text: String(body.text || ''), images })
    return send(response, 202, '{"ok":true}')
  }
  if (isPost && url.pathname === '/terminal') {
    const raw = await readBody(request)
    const body = JSON.parse(raw)
    openTerminal(String(body.cwd || ''))
    return send(response, 202, '{"ok":true}')
  }
  if (isPost && url.pathname === '/park') {
    const raw = await readBody(request)
    const body = JSON.parse(raw)
    say({ type: 'park', engineId: String(body.engineId), kind: String(body.kind), reason: String(body.reason || '') })
    return send(response, 202, '{"ok":true}')
  }
  if (isPost && url.pathname === '/unpark') {
    const raw = await readBody(request)
    const body = JSON.parse(raw)
    say({ type: 'unpark', engineId: String(body.engineId) })
    return send(response, 202, '{"ok":true}')
  }
  if (isPost && url.pathname === '/ack') {
    const raw = await readBody(request)
    const body = JSON.parse(raw)
    say({ type: 'ack', engineId: String(body.engineId), seen: body.seen === true })
    return send(response, 202, '{"ok":true}')
  }
  if (isPost && url.pathname === '/summarize') {
    const raw = await readBody(request)
    const body = JSON.parse(raw)
    say({ type: 'summarize', engineId: String(body.engineId) })
    return send(response, 202, '{"ok":true}')
  }
  send(response, 404, 'introuvable', 'text/plain; charset=utf-8')
}

const server = http.createServer((request, response) => {
  handle(request, response).catch(error => {
    send(response, 400, JSON.stringify({ ok: false, error: String(error.message || error) }))
  })
})

server.on('error', error => {
  if (error.code === 'EADDRINUSE') process.exit(3)
  say({ type: 'error', message: String(error.message || error) })
  process.exit(1)
})

server.listen(PORT, '127.0.0.1', () => say({ type: 'listening', port: PORT }))
