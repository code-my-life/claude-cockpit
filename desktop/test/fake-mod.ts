// Fake mod for E2E tests: reads secret and port from link.json, POST /bridge/v1/hello,
// collects GET /bridge/v1/orders, acks. No Origin header nor Sec-Fetch-Site.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

declare const __dirname: string;

const LINK_PROTOCOL = 1;
const APP_FOLDER = 'claude-cockpit';
const LINK_NAME = 'link.json';

const linkFileOf = (platform: NodeJS.Platform, env: NodeJS.ProcessEnv, homeDir: string) => {
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
    return path.join(localAppData, APP_FOLDER, LINK_NAME);
  }
  const stateDir = env.XDG_RUNTIME_DIR || path.join(homeDir, '.local', 'state');
  return path.join(stateDir, APP_FOLDER, LINK_NAME);
};

export interface FakeModConfig {
  testDir: string;
  engineId?: string;
  onOrder?: (order: any) => void;
  onAck?: (engineId: string) => void;
}

export class FakeMod {
  private config: FakeModConfig;
  private secret = '';
  private port = 0;
  private running = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private seenOrderIds = new Set<string>();
  private bridgeId = '';

  constructor(config: FakeModConfig) {
    this.config = config;
  }

  private getLinkFile(): string {
    const env = process.env;
    const homeDir = env.HOME || env.USERPROFILE || os.homedir();
    // The test harness sets XDG_RUNTIME_DIR/LOCALAPPDATA to point into testDir
    return linkFileOf(process.platform, env, homeDir);
  }

  private getEngineId(): string {
    return this.config.engineId || 'test-engine-id';
  }

  async start(): Promise<void> {
    const linkFile = this.getLinkFile();
    // Poll for link.json to appear (embedded server writes it after starting)
    let attempts = 0;
    while (!fs.existsSync(linkFile) && attempts < 100) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }
    if (!fs.existsSync(linkFile)) {
      throw new Error(`link.json not found at ${linkFile} after 10 seconds`);
    }
    const link = JSON.parse(fs.readFileSync(linkFile, 'utf8'));
    this.secret = link.secret;
    this.port = link.port;
    this.running = true;
    await this.hello();
    this.pollOrders();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async hello(): Promise<void> {
    const res = await fetch(`http://127.0.0.1:${this.port}/bridge/v1/hello`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.secret}`,
      },
      body: JSON.stringify({ protocol: LINK_PROTOCOL, engineId: this.getEngineId() }),
    });
    if (!res.ok) {
      throw new Error(`hello failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    this.bridgeId = data.bridgeId || '';
  }

  private pollOrders(): void {
    this.pollInterval = setInterval(async () => {
      if (!this.running) return;
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/bridge/v1/orders?bridgeId=${this.bridgeId}&wait=20000`, {
          headers: {
            Authorization: `Bearer ${this.secret}`,
          },
        });
        if (!res.ok) return;
        const orders = await res.json();
        for (const order of orders) {
          if (this.seenOrderIds.has(order.orderId)) continue;
          this.seenOrderIds.add(order.orderId);
          this.config.onOrder?.(order);
          // Auto-ack with bridgeId
          await this.ack(order.orderId);
          this.config.onAck?.(order.engineId);
        }
      } catch {
        // Ignore poll errors
      }
    }, 200);
  }

  private async ack(orderId: string): Promise<void> {
    try {
      await fetch(`http://127.0.0.1:${this.port}/bridge/v1/ack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.secret}`,
        },
        body: JSON.stringify({ bridgeId: this.bridgeId, orderIds: [orderId] }),
      });
    } catch {
      // Ignore ack errors
    }
  }
}

export const createFakeMod = (config: FakeModConfig) => new FakeMod(config);