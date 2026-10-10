// HTTP building blocks shared by the cockpit page routes and the bridge routes.
import crypto from 'node:crypto'

import { isLocalHost } from './search-index.mjs'

const MAX_BODY_BYTES = 40 * 1024 * 1024
const ENGINE_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'none'",
].join('; ')
const SECURITY_HEADERS = {
  'content-security-policy': CONTENT_SECURITY_POLICY,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const readBody = (request, maxBytes) =>
  new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', chunk => {
      size += chunk.length
      if (size > maxBytes) {
        chunks.length = 0
        request.removeAllListeners('data')
        request.resume()
        reject(new HttpError(413, 'corps trop volumineux'))
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })

export const send = (response, status, body, type = 'application/json; charset=utf-8') => {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...SECURITY_HEADERS })
  response.end(body)
}

export const sendNotFound = response => send(response, 404, 'introuvable', 'text/plain; charset=utf-8')

export const readJsonBody = async (request, maxBytes = MAX_BODY_BYTES) => {
  const raw = await readBody(request, maxBytes)
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'requête invalide')
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'requête invalide')
  return body
}

export const engineIdOf = body => {
  if (typeof body.engineId !== 'string' || !ENGINE_ID_PATTERN.test(body.engineId)) throw new HttpError(400, 'identifiant de conversation invalide')
  return body.engineId
}

export const secretMatches = (given, expected) => {
  if (typeof given !== 'string') return false
  const givenBytes = Buffer.from(given)
  const expectedBytes = Buffer.from(expected)
  return givenBytes.length === expectedBytes.length && crypto.timingSafeEqual(givenBytes, expectedBytes)
}

export const guardHost = (request, port) => {
  if (!isLocalHost(request.headers.host, port)) throw new HttpError(403, 'hôte refusé')
}

export const guardJson = request => {
  const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json') throw new HttpError(415, 'JSON attendu')
}
