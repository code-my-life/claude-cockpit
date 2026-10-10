// Entry point the mod starts on its own: `node server.mjs <rootDir> <port>`.
// The orders for the mod go out as JSON lines on standard output.
import { createCockpitServer } from './cockpit-server.mjs'

const DEFAULT_PORT = 48123
const EXIT_PORT_TAKEN = 3

const [, , rootDir, portArg] = process.argv
const say = payload => process.stdout.write(`${JSON.stringify(payload)}\n`)

const cockpit = createCockpitServer({ rootDir, port: Number(portArg || DEFAULT_PORT), sink: say })

cockpit.listen().then(
  port => say({ type: 'listening', port }),
  error => {
    if (error.code === 'EADDRINUSE') process.exit(EXIT_PORT_TAKEN)
    say({ type: 'error', message: String(error.message || error) })
    process.exit(1)
  },
)
