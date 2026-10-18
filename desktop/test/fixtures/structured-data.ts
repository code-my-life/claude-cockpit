// Données mock pour les tests E2E — conversations, sessions, permissions, waiting.
// Chaque scénario importe ce dont il a besoin.
// Les statuts doivent correspondre à ceux reconnus par island-model.js :
// KIND_WAIT: 'permission', 'external'
// KIND_DONE: 'done' (si summary.kind !== 'question')
// KIND_WORK: 'thinking', 'writing', 'tool', 'working'
// KIND_STUCK: 'blocked', 'error'

export const mockConversations = [
  {
    engineId: '0b6e2c4e-5f1a-4d0e-9c3a-e2e000000001',
    title: 'Build feature X',
    summary: { plain: 'Implementing the new authentication flow', awaiting: 'Continue the build', kind: 'task' },
    messages: [
      { role: 'user', content: 'Start the build', timestamp: '2025-01-15T10:00:00Z' },
      { role: 'assistant', content: 'Building...', timestamp: '2025-01-15T10:00:05Z' },
      { role: 'assistant', content: 'Build complete', timestamp: '2025-01-15T10:00:30Z' },
    ],
    status: 'working',
    lastActivity: '2025-01-15T10:00:30Z',
    cwd: 'C:\\demo\\cockpit',
    isCurrent: false,
    hostId: 'e2e-host-session-1',
  },
  {
    engineId: 'conv-2',
    title: 'Fix bug in payment',
    summary: { plain: 'Investigating the Stripe webhook issue', awaiting: 'Permission to write .env', kind: 'permission' },
    messages: [
      { role: 'user', content: 'Check the webhook', timestamp: '2025-01-15T09:30:00Z' },
      { role: 'assistant', content: 'Found the issue', timestamp: '2025-01-15T09:35:00Z' },
    ],
    status: 'permission',
    lastActivity: '2025-01-15T09:35:00Z',
    cwd: '/home/user/payment-service',
    isCurrent: false,
    hostId: 'host-2',
  },
  {
    engineId: 'conv-3',
    title: 'Refactor database layer',
    summary: { plain: 'Moving to Prisma ORM', awaiting: '', kind: 'task' },
    messages: [
      { role: 'user', content: 'Plan the migration', timestamp: '2025-01-14T14:00:00Z' },
      { role: 'assistant', content: 'Here is the plan', timestamp: '2025-01-14T14:15:00Z' },
      { role: 'user', content: 'Looks good', timestamp: '2025-01-14T14:20:00Z' },
      { role: 'assistant', content: 'Starting migration', timestamp: '2025-01-14T14:25:00Z' },
    ],
    status: 'done',
    lastActivity: '2025-01-14T14:25:00Z',
    cwd: '/home/user/database-layer',
    isCurrent: false,
    hostId: 'host-3',
  },
];

export const mockSessions = [
  {
    engineId: 'session-1',
    conversationId: '0b6e2c4e-5f1a-4d0e-9c3a-e2e000000001',
    cwd: 'C:\\demo\\cockpit',
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
    status: 'running',
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
    engineId: '0b6e2c4e-5f1a-4d0e-9c3a-e2e000000001',
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