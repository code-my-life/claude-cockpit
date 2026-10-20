// A fake Claude Code mod for the e2e tests: it joins the app's bridge the way the real mod does
// (mod/assets/bridge-routes.mjs) and records the orders the pages send, so a test can check them.
// Secret and port come from link.json. No Origin nor Sec-Fetch-Site header: the bridge refuses them.
import fs from 'node:fs'
import path from 'node:path'

const LINK_PROTOCOL = 1
const POLL_WAIT_MS = 2000
const ORDER_TIMEOUT_MS = 10_000

export type Order = { orderId: string, type: string, engineId: string, text?: string, images?: string[], kind?: string, reason?: string, seen?: boolean }

// Same rule as linkFileOf in mod/assets/discovery.mjs.
export const linkFileOf = (platform: NodeJS.Platform, env: NodeJS.ProcessEnv, homeDir: string): string => {
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'), 'claude-cockpit', 'link.json')
  return path.join(env.XDG_RUNTIME_DIR || path.join(homeDir, '.local', 'state'), 'claude-cockpit', 'link.json')
}

export class FakeMod {
  readonly orders: Order[] = []
  private bridgeId = ''
  private running = false
  private loop: Promise<void> | null = null

  constructor(private readonly link: { port: number, secret: string }, private readonly engineId: string) {}

  private url(route: string) {
    return `http://127.0.0.1:${this.link.port}/bridge/v1/${route}`
  }

  private headers(json = false): Record<string, string> {
    return { Authorization: `Bearer ${this.link.secret}`, ...(json ? { 'Content-Type': 'application/json' } : {}) }
  }

  async start(): Promise<void> {
    const res = await fetch(this.url('hello'), { method: 'POST', headers: this.headers(true), body: JSON.stringify({ protocol: LINK_PROTOCOL, engineId: this.engineId }) })
    if (!res.ok) throw new Error(`bridge hello refused: ${res.status} ${await res.text()}`)
    this.bridgeId = (await res.json()).bridgeId
    this.running = true
    this.loop = this.poll()
  }

  // One long wait at a time, like the real mod: the hub answers as soon as it has orders.
  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const res = await fetch(this.url(`orders?bridgeId=${encodeURIComponent(this.bridgeId)}&wait=${POLL_WAIT_MS}`), { headers: this.headers() })
        if (!res.ok) { await new Promise(resolve => setTimeout(resolve, 200)); continue }
        const { orders = [] } = await res.json() as { orders?: Order[] }
        if (orders.length === 0) continue
        this.orders.push(...orders)
        await fetch(this.url('ack'), { method: 'POST', headers: this.headers(true), body: JSON.stringify({ bridgeId: this.bridgeId, orderIds: orders.map(order => order.orderId) }) })
      } catch {
        if (this.running) await new Promise(resolve => setTimeout(resolve, 200))
      }
    }
  }

  // The first recorded order that matches, waiting for it.
  async waitForOrder(isWanted: (order: Order) => boolean, timeoutMs = ORDER_TIMEOUT_MS): Promise<Order> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const found = this.orders.find(isWanted)
      if (found !== undefined) return found
      if (Date.now() > deadline) throw new Error(`no matching order, received: ${JSON.stringify(this.orders)}`)
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  async stop(): Promise<void> {
    this.running = false
    await this.loop?.catch(() => {})
  }
}

export const readLink = (linkFile: string): { port: number, secret: string, dataDir: string } => JSON.parse(fs.readFileSync(linkFile, 'utf8'))

// A permission request, as the mod asks it when Claude wants to run a tool: the island shows it.
export const askPermission = async (link: { port: number, secret: string }, request: { engineId: string, tool: string, summary: string, detail?: string, holdMs?: number }): Promise<string> => {
  const res = await fetch(`http://127.0.0.1:${link.port}/bridge/v1/permission/ask`, {
    method: 'POST', headers: { Authorization: `Bearer ${link.secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ canAlways: true, holdMs: 60_000, detail: '', ...request }),
  })
  if (!res.ok) throw new Error(`permission ask refused: ${res.status} ${await res.text()}`)
  return (await res.json()).requestId
}

// The island's decision for a request, or null while none was taken within waitMs.
export const permissionDecision = async (link: { port: number, secret: string }, requestId: string, waitMs = 1000): Promise<string | null> => {
  const res = await fetch(`http://127.0.0.1:${link.port}/bridge/v1/permission/wait?requestId=${encodeURIComponent(requestId)}&wait=${waitMs}`, { headers: { Authorization: `Bearer ${link.secret}` } })
  if (!res.ok) throw new Error(`permission wait refused: ${res.status} ${await res.text()}`)
  return (await res.json()).decision ?? null
}
