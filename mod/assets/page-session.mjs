// Who may read the cockpit page and send orders from it. With the mod's own
// server the page carries its token in a meta tag. With the app, the token
// never appears in the page: the app sets an HttpOnly session cookie in its
// own windows, and a one-time ticket lets a browser get the same cookie.
import { secretMatches, send } from './cockpit-server-http.mjs'

export const SESSION_COOKIE = 'cockpit_session'
const TICKET_TTL_MS = 60000
const NEEDS_APP_PAGE = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Cockpit</title></head>
<body style="margin:0;padding:40px;background:#17181b;color:#ecece6;font:16px/1.6 system-ui,sans-serif">
<p>Ouvre le cockpit depuis l’app : clique sur son icône dans la barre d’état, ou choisis « Ouvrir dans le navigateur » dans son menu.</p>
</body></html>`

export const sendNeedsApp = response => send(response, 401, NEEDS_APP_PAGE, 'text/html; charset=utf-8')

export const cookieOf = (request, name) => {
  const header = String(request.headers.cookie || '')
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=')
  }
  return undefined
}

export const createPageSession = ({ mode, token, now = Date.now }) => {
  const usesCookie = mode === 'cookie'
  const tickets = new Map()
  const hasSession = request => secretMatches(cookieOf(request, SESSION_COOKIE), token)
  const isAllowed = request => !usesCookie || hasSession(request)
  const canWrite = (request, headerToken) => secretMatches(headerToken, token) || (usesCookie && hasSession(request))
  const allowTicket = ticket => {
    tickets.set(ticket, now() + TICKET_TTL_MS)
  }
  // A ticket works once, within a minute, and only ever sets the cookie.
  const redeem = (response, ticket) => {
    const expiresAt = tickets.get(ticket)
    tickets.delete(ticket)
    if (expiresAt === undefined || expiresAt < now()) return sendNeedsApp(response)
    response.writeHead(302, {
      location: '/',
      'set-cookie': `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    })
    response.end()
  }
  return { usesCookie, isAllowed, canWrite, allowTicket, redeem }
}
