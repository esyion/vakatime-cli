export type HeartbeatEntityType = 'file' | 'app' | 'domain' | 'agent'
export type HeartbeatCategory = 'coding' | 'debugging' | 'building' | 'testing' | 'browsing' | 'ai' | 'other'

export interface HeartbeatInput {
  entity: string
  type?: HeartbeatEntityType | string | null
  category?: HeartbeatCategory | string | null
  time: number | string | Date
  project?: string | null
  branch?: string | null
  language?: string | null
  editor?: string | null
  operatingSystem?: string | null
  machineName?: string | null
  isWrite?: boolean | null
  userAgent?: string | null
  agent?: string | null
  sessionId?: string | null
  turnId?: string | null
  model?: string | null
  inputTokens?: number | null
  cachedInputTokens?: number | null
  outputTokens?: number | null
  reasoningOutputTokens?: number | null
  totalTokens?: number | null
  estimatedCostUsd?: number | null
  meta?: Record<string, unknown> | null
}

export interface NormalizedHeartbeat {
  entity: string
  type: HeartbeatEntityType
  category: HeartbeatCategory
  time: number
  project: string | null
  branch: string | null
  language: string | null
  editor: string | null
  operatingSystem: string | null
  machineName: string | null
  isWrite: boolean
  userAgent: string | null
  agent: string | null
  sessionId: string | null
  turnId: string | null
  model: string | null
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
  meta: Record<string, unknown> | null
}

export interface HeartbeatValidationIssue {
  path: string
  message: string
}

export interface NormalizeHeartbeatResult {
  ok: boolean
  heartbeat?: NormalizedHeartbeat
  issues: HeartbeatValidationIssue[]
}

const ENTITY_TYPES = new Set<HeartbeatEntityType>(['file', 'app', 'domain', 'agent'])
const CATEGORIES = new Set<HeartbeatCategory>([
  'coding',
  'debugging',
  'building',
  'testing',
  'browsing',
  'ai',
  'other',
])

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeString(value: unknown): string | null {
  return cleanString(value)
}

function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, value)
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return value
}

function normalizeTime(value: unknown): number | null {
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms / 1000 : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value / 1000 : value
  }
  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric > 10_000_000_000 ? numeric / 1000 : numeric
    const ms = Date.parse(value)
    return Number.isFinite(ms) ? ms / 1000 : null
  }
  return null
}

function normalizeEntityType(value: unknown): HeartbeatEntityType {
  const cleaned = cleanString(value)?.toLowerCase()
  return cleaned && ENTITY_TYPES.has(cleaned as HeartbeatEntityType)
    ? (cleaned as HeartbeatEntityType)
    : 'file'
}

function normalizeCategory(value: unknown, type: HeartbeatEntityType): HeartbeatCategory {
  const cleaned = cleanString(value)?.toLowerCase()
  if (cleaned && CATEGORIES.has(cleaned as HeartbeatCategory)) return cleaned as HeartbeatCategory
  return type === 'agent' ? 'ai' : 'coding'
}

export function normalizeHeartbeat(input: HeartbeatInput): NormalizeHeartbeatResult {
  const issues: HeartbeatValidationIssue[] = []
  const entity = cleanString(input.entity)
  if (!entity) issues.push({ path: 'entity', message: 'entity is required' })

  const time = normalizeTime(input.time)
  if (time === null) issues.push({ path: 'time', message: 'time must be a unix timestamp or ISO date' })

  const type = normalizeEntityType(input.type)
  const category = normalizeCategory(input.category, type)
  const inputTokens = normalizeNumber(input.inputTokens)
  const cachedInputTokens = normalizeNumber(input.cachedInputTokens)
  const outputTokens = normalizeNumber(input.outputTokens)
  const reasoningOutputTokens = normalizeNumber(input.reasoningOutputTokens)
  const explicitTotalTokens = normalizeOptionalNumber(input.totalTokens)
  const totalTokens =
    explicitTotalTokens ?? inputTokens + cachedInputTokens + outputTokens + reasoningOutputTokens

  if (issues.length > 0 || !entity || time === null) return { ok: false, issues }

  return {
    ok: true,
    issues: [],
    heartbeat: {
      entity,
      type,
      category,
      time,
      project: normalizeString(input.project),
      branch: normalizeString(input.branch),
      language: normalizeString(input.language),
      editor: normalizeString(input.editor),
      operatingSystem: normalizeString(input.operatingSystem),
      machineName: normalizeString(input.machineName),
      isWrite: input.isWrite ?? false,
      userAgent: normalizeString(input.userAgent),
      agent: normalizeString(input.agent),
      sessionId: normalizeString(input.sessionId),
      turnId: normalizeString(input.turnId),
      model: normalizeString(input.model),
      inputTokens,
      cachedInputTokens,
      outputTokens,
      reasoningOutputTokens,
      totalTokens,
      estimatedCostUsd: normalizeOptionalNumber(input.estimatedCostUsd),
      meta: input.meta && typeof input.meta === 'object' && !Array.isArray(input.meta) ? input.meta : null,
    },
  }
}

export function normalizeHeartbeatsBulk(inputs: HeartbeatInput[]): {
  heartbeats: NormalizedHeartbeat[]
  issues: Array<{ index: number; issues: HeartbeatValidationIssue[] }>
} {
  const heartbeats: NormalizedHeartbeat[] = []
  const issues: Array<{ index: number; issues: HeartbeatValidationIssue[] }> = []

  inputs.forEach((input, index) => {
    const result = normalizeHeartbeat(input)
    if (result.ok && result.heartbeat) {
      heartbeats.push(result.heartbeat)
    } else {
      issues.push({ index, issues: result.issues })
    }
  })

  return { heartbeats, issues }
}

export function heartbeatDedupeKey(heartbeat: NormalizedHeartbeat): string {
  return [
    heartbeat.time.toFixed(3),
    heartbeat.entity,
    heartbeat.project ?? '',
    heartbeat.branch ?? '',
    heartbeat.category,
    heartbeat.type,
  ].join('\u001f')
}
