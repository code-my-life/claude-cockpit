// Mock conversations data for E2E tests — exact format expected by the app
// Each row must match the format: window.__CONVERSATIONS__ = { generatedAt, rows, folders: [] }
// Row fields: engineId, hostId, title, cwd, status, updatedAt (ms), isLive, summary, park

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

function makeSummary(row: { status: string; awaiting: string; kind: 'question' | 'delivered' | 'external' }): {
  updatedAt: number;
  text: string;
  plain: string;
  awaiting: string;
  kind: 'question' | 'delivered' | 'external';
  isLoading: boolean;
  thread: { role: 'user' | 'assistant'; text: string }[];
  repos: [];
} {
  return {
    updatedAt: now - 2 * day,
    text: 'Summary with **markdown**',
    plain: 'Summary with markdown',
    awaiting: row.awaiting,
    kind: row.kind,
    isLoading: false,
    thread: [
      { role: 'user', text: 'Start the task' },
      { role: 'assistant', text: 'Working on it...' },
    ],
    repos: [],
  };
}

export const mockConversations = [
  // A1: waiting — permission (t'attendent)
  {
    engineId: '0b6e2c4e-5f1a-4d0e-9c3a-e2e000000001',
    hostId: 'e2e-host-1',
    title: 'Build feature X',
    cwd: '/home/user/cockpit-e2e/demo-cockpit',
    status: 'permission',
    updatedAt: now - day,
    isLive: false,
    summary: makeSummary({ status: 'permission', awaiting: 'Permission to write .env', kind: 'question' }),
    park: undefined,
  },
  // A1: working — thinking (en mission)
  {
    engineId: 'conv-2',
    hostId: 'e2e-host-2',
    title: 'Fix bug in payment',
    cwd: '/home/user/payment-service',
    status: 'thinking',
    updatedAt: now - 2 * day,
    isLive: true,
    summary: makeSummary({ status: 'thinking', awaiting: '', kind: 'delivered' }),
    park: undefined,
  },
  // A1: done — delivered (au repos)
  {
    engineId: 'conv-3',
    hostId: 'e2e-host-3',
    title: 'Refactor database layer',
    cwd: '/home/user/database-layer',
    status: 'done',
    updatedAt: now - 3 * day,
    isLive: false,
    summary: makeSummary({ status: 'done', awaiting: '', kind: 'delivered' }),
    park: undefined,
  },
  // A1: blocked (bloqués et plus tard)
  {
    engineId: 'conv-4',
    hostId: 'e2e-host-4',
    title: 'Investigate flaky test',
    cwd: '/home/user/flaky-tests',
    status: 'blocked',
    updatedAt: now - 4 * day,
    isLive: false,
    summary: makeSummary({ status: 'blocked', awaiting: 'Waiting for CI fix', kind: 'external' }),
    park: { kind: 'blocked', reason: 'Attente client', at: now - 4 * day, updatedAt: now - 4 * day, hasMoved: false },
  },
  // A1: later (bloqués et plus tard)
  {
    engineId: 'conv-5',
    hostId: 'e2e-host-5',
    title: 'Update documentation',
    cwd: '/home/user/docs',
    status: 'later',
    updatedAt: now - 5 * day,
    isLive: false,
    summary: makeSummary({ status: 'later', awaiting: '', kind: 'external' }),
    park: { kind: 'later', reason: 'Pas prioritaire', at: now - 5 * day, updatedAt: now - 5 * day, hasMoved: false },
  },
  // A2: card back heading test (title should appear, not last message)
  {
    engineId: 'conv-heading-test',
    hostId: 'e2e-host-6',
    title: 'Session with long title that should appear on card back',
    cwd: '/home/user/heading-test',
    status: 'permission',
    updatedAt: now - 6 * day,
    isLive: false,
    summary: makeSummary({ status: 'permission', awaiting: 'Permission needed', kind: 'question' }),
    park: undefined,
  },
  // B5/B6: terminal and reply tests
  {
    engineId: 'conv-terminal',
    hostId: 'e2e-host-7',
    title: 'Terminal test session',
    cwd: '/home/user/terminal-demo',
    status: 'permission',
    updatedAt: now - 7 * day,
    isLive: false,
    summary: makeSummary({ status: 'permission', awaiting: 'Permission for terminal', kind: 'question' }),
    park: undefined,
  },
];

export function buildConversationsData(): string {
  const data = {
    generatedAt: Date.now(),
    rows: mockConversations,
    folders: [],
  };
  return `window.__CONVERSATIONS__ = ${JSON.stringify(data)};`;
}