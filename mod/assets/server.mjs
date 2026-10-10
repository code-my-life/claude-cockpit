// Entry point the mod starts on its own: `node server.mjs <rootDir> <port>`.
// The orders for the mod go out as JSON lines on standard output. Once the
// cockpit app runs and answers, this server steps aside (exit code 4) so the
// conversation joins the app instead.
import http from 'node:http'
import os from 'node:os'

import { createCockpitServer } from './cockpit-server.mjs'
import { linkFileOf, readLink } from './discovery.mjs'

const DEFAULT_PORT = 48123
const EXIT_PORT_TAKEN = 3
const EXIT_APP_TOOK_OVER = 4
const LINK_CHECK_MS = Number(process.env.COCKPIT_LINK_CHECK_MS) || 5000
const PING_TIMEOUT_MS = 2000

const [, , rootDir, portArg] = process.argv
const say = payload => {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

const appAnswers = port =>
  new Promise(resolve => {
    const request = http.get({ host: '127.0.0.1', port, path: '/ping', timeout: PING_TIMEOUT_MS, headers: { host: `127.0.0.1:${port}` } }, response => {
      response.resume()
      resolve(response.statusCode === 200)
    })
    request.on('timeout', () => {
      request.destroy()
      resolve(false)
    })
    request.on('error', () => resolve(false))
  })

// Steps aside only for an app that answers: a link left by a stopped or hung
// app never takes the cockpit's server away.
const watchForApp = ownPort =>
  setInterval(async () => {
    const link = readLink(linkFileOf(process.platform, process.env, os.homedir()))
    if (link === null || link.port === ownPort) return
    if (await appAnswers(link.port)) process.exit(EXIT_APP_TOOK_OVER)
  }, LINK_CHECK_MS)

const cockpit = createCockpitServer({ rootDir, port: Number(portArg || DEFAULT_PORT), sink: say })

cockpit.listen().then(
  port => {
    say({ type: 'listening', port })
    watchForApp(port)
  },
  error => {
    if (error.code === 'EADDRINUSE') process.exit(EXIT_PORT_TAKEN)
    say({ type: 'error', message: String(error.message || error) })
    process.exit(1)
  },
)
