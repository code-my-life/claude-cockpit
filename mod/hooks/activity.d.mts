// Types of activity.mjs for the hooks module.
import type { ActivityStep } from '../types'

export declare const MAX_STEPS: number
export declare const DIFF_KEEP: number
export declare const DIFF_MAX_CHARS: number

export declare const stepOf: (tool: unknown, input: unknown, at: number) => ActivityStep

export declare const pushStep: (list: ActivityStep[], step: ActivityStep | null | undefined) => ActivityStep[]
