// Types of permission-text.mjs for the hooks module.
export type IslandChoice = 'allow' | 'deny' | 'always'

export type PermissionText = { tool: string; summary: string; detail: string }

export type PermissionHookDecision<Rule> =
  | { behavior: 'allow'; updatedPermissions?: Rule[] }
  | { behavior: 'deny'; message: string }

export declare const describePermission: (toolName: unknown, input: unknown) => PermissionText

export declare const decisionFor: <Rule>(choice: string | null, suggestions: Rule[] | undefined) => PermissionHookDecision<Rule> | null
