// Determines whether a conversation row should show the 'permission' status.

export type PermissionEvent = 'check' | 'request'
export const permissionStatusOf = ({ event, verdict, isDesktopSession, hasIslandRequest }: { event: PermissionEvent; verdict?: string; isDesktopSession: boolean; hasIslandRequest: boolean }): 'permission' | null => {
  if (event === 'request') return 'permission'
  if (event === 'check') return verdict === 'ask' && isDesktopSession && hasIslandRequest ? 'permission' : null
  return null
}
