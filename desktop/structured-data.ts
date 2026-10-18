// Données mock pour les tests E2E — conversations, sessions, permissions, waiting.
// Chaque scénario importe ce dont il a besoin.

export const mockConversations = [
  {
    engineId: 'conv-1',
    title: 'Build feature X',
    summary: 'Implementing the new authentication flow',
    messages: [
      { role: 'user', content: 'Start the build', timestamp: '2025-01-15T10:00:00Z' },
      { role: 'assistant', content: 'Building...', timestamp: '2025-01-15T10:00:05Z' },
      { role: 'assistant', content: 'Build complete', timestamp: '2025-01-15T10:00:30Z' },
    ],
    status: 'active',
    lastActivity: '2025-01-15T10:00:30Z',
  },
  {
    engineId: 'conv-2',
    title: 'Fix bug in payment',
    summary: 'Investigating the Stripe webhook issue',
    messages: [
      { role: 'user', content: 'Check the webhook', timestamp: '2025-01-15T09:30:00Z' },
      { role: 'assistant', content: 'Found the issue', timestamp: '2025-01-15T09:35:00Z' },
    ],
    status: 'waiting',
    lastActivity: '2025-01-15T09:35:00Z',
  },
  {
    engineId: 'conv-3',
    title: 'Refactor database layer',
    summary: 'Moving to Prisma ORM',
    messages: [
      { role: 'user', content: 'Plan the migration', timestamp: '2025-01-14T14:00:00Z' },
      { role: 'assistant', content: 'Here is the plan', timestamp: '2025-01-14T14:15:00Z' },
      { role: 'user', content: 'Looks good', timestamp: '2025-01-14T14:20:00Z' },
      { role: 'assistant', content: 'Starting migration', timestamp: '2025-01-14T14:25:00Z' },
    ],
    status: 'done',
    lastActivity: '2025-01-14T14:25:00Z',
  },
];

export const mockSessions = [
  {
    engineId: 'session-1',
    conversationId: 'conv-1',
    cwd: '/home/user/project',
    pid: 12345,
    startedAt: '2025-01-15T10:00:00Z',
    status: 'running',
  },
  {
    engineId: 'session-2',
    conversationId: 'conv-2',
    cwd: '/home/user/payment-service',
    pid: 12346,
    startedAt: '2025-01-15T09:30:00Z',
    status: 'waiting',
  },
  {
    engineId: 'session-3',
    conversationId: 'conv-3',
    cwd: '/home/user/database-layer',
    pid: 12347,
    startedAt: '2025-01-14T14:00:00Z',
    status: 'completed',
  },
];

export const mockPermissions = [
  {
    requestId: 'perm-1',
    engineId: 'conv-2',
    tool: 'Write',
    summary: 'Write to .env file',
    detail: 'The assistant wants to write API keys to .env',
    canAlways: true,
    holdMs: 30000,
  },
  {
    requestId: 'perm-2',
    engineId: 'conv-1',
    tool: 'Bash',
    summary: 'Run npm install',
    detail: 'Installing new dependencies',
    canAlways: false,
    holdMs: 10000,
  },
];

export const mockWaiting = [
  {
    engineId: 'conv-2',
    waitingFor: 'permission',
    requestId: 'perm-1',
    since: '2025-01-15T09:35:00Z',
  },
];