// Fake mod for E2E tests: reads secret and port from link.json, POST /bridge/v1/hello,
// collects GET /bridge/v1/orders, acks. No Origin header nor Sec-Fetch-Site.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface FakeModConfig {
  testDir: string
  onOrder?: (order: any) => void
  onAck?: (engineId: string) => void
}

export class FakeMod {
  private config: FakeModConfig
  private secret: string = ''
  private port: number = 0
  private running = false
  private pollInterval: NodeJS.Timeout | null = null
  private seenOrderIds = new Set<string>()

  constructor(config: FakeModConfig) {
    this.config = config
  }

  async start(): Promise<void> {
    const linkFile = path.join(this.config.testDir, 'link.json')
    if (!fs.existsSync(linkFile)) {
      throw new Error(`link.json not found at ${linkFile}`)
    }
    const link = JSON.parse(fs.readFileSync(linkFile, 'utf8'))
    this.secret = link.secret
    this.port = link.port
    this.running = true
    await this.hello()
    this.pollOrders()
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }

  private async hello(): Promise<void> {
    const res = await fetch(`http://127.0.0.1:${this.port}/bridge/v1/hello`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cockpit-Secret': this.secret,
      },
      body: JSON.stringify({}),
    })
    if (!res.ok) {
      throw new Error(`hello failed: ${res.status} ${await res.text()}`)
    }
  }

  private pollOrders(): void {
    this.pollInterval = setInterval(async () => {
      if (!this.running) return
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/bridge/v1/orders`, {
          headers: {
            'X-Cockpit-Secret': this.secret,
          },
        })
        if (!res.ok) return
        const orders = await res.json()
        for (const order of orders) {
          if (this.seenOrderIds.has(order.id)) continue
          this.seenOrderIds.add(order.id)
          this.config.onOrder?.(order)
          // Auto-ack
          await this.ack(order.id)
          this.config.onAck?.(order.engineId)
        }
      } catch {
        // Ignore poll errors
      }
    }, 200)
  }

  private async ack(orderId: string): Promise<void> {
    try {
      await fetch(`http://127.0.0.1:${this.port}/bridge/v1/ack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cockpit-Secret': this.secret,
        },
        body: JSON.stringify({ orderId }),
      })
    } catch {
      // Ignore ack errors
    }
  }
}

export const createFakeMod = (config: FakeModConfig) => new FakeMod(config)