import type { UsageRecordFact, UsageTokenBreakdown, UsageTranscriptCandidate } from './types.js'

type JsonRecord = Record<string, unknown>

function asObject(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value / 1000 : value
  }
  const timestamp = asString(value)
  if (!timestamp) return null
  const millis = Date.parse(timestamp)
  return Number.isFinite(millis) ? millis / 1000 : null
}

function tokenBreakdown(tokens: JsonRecord): UsageTokenBreakdown {
  const inputTokens = asNumber(tokens.input)
  const outputTokens = asNumber(tokens.output)
  const reasoningOutputTokens = asNumber(tokens.reasoning)
  const cache = asObject(tokens.cache)
  const cachedInputTokens = asNumber(cache?.read)
  const cacheCreationInputTokens = asNumber(cache?.write)
  const explicitTotal = asNumber(tokens.total)

  return {
    inputTokens,
    cachedInputTokens,
    cacheCreationInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens:
      explicitTotal ||
      inputTokens +
        cachedInputTokens +
        cacheCreationInputTokens +
        outputTokens +
        reasoningOutputTokens,
  }
}

function hasUsageTokens(tokens: UsageTokenBreakdown): boolean {
  return tokens.totalTokens > 0
}

function modelName(info: JsonRecord): { model: string; providerId: string | null } {
  const providerId = asString(info.providerID) ?? asString(asObject(info.model)?.providerID)
  const modelId =
    asString(info.modelID) ??
    asString(asObject(info.model)?.modelID) ??
    asString(asObject(info.model)?.id)
  if (providerId && modelId) return { model: `${providerId}/${modelId}`, providerId }
  return { model: modelId ?? 'unknown', providerId }
}

function stableRowKey(
  candidate: UsageTranscriptCandidate,
  info: JsonRecord,
  rowIndex: number,
): string {
  const id = asString(info.id)
  const sessionID = asString(info.sessionID) ?? asString(info.session_id)
  if (sessionID && id) return `${sessionID}:${id}`
  if (id) return id
  return `${candidate.sourceFileKey}:${rowIndex}`
}

export function scanOpenCodeMessageRecord(
  candidate: UsageTranscriptCandidate,
  info: JsonRecord,
  rowIndex = 0,
): UsageRecordFact | null {
  if (asString(info.role) !== 'assistant') return null
  const tokensObject = asObject(info.tokens)
  if (!tokensObject) return null

  const tokens = tokenBreakdown(tokensObject)
  if (!hasUsageTokens(tokens)) return null

  const { model, providerId } = modelName(info)
  const path = asObject(info.path)
  const time = asObject(info.time)
  const meta: UsageRecordFact['meta'] = { sourceKind: 'opencode-assistant-usage' }
  if (providerId) meta.opencodeProviderId = providerId

  return {
    agent: 'opencode',
    sourceFileKey: candidate.sourceFileKey,
    sourceRowKey: stableRowKey(candidate, info, rowIndex),
    sourceFileBasename: candidate.sourceFileBasename,
    sessionId: asString(info.sessionID) ?? asString(info.session_id),
    turnId: asString(info.parentID) ?? asString(info.parent_id),
    project: asString(path?.cwd) ?? asString(path?.root),
    ts: parseTimestamp(time?.completed ?? time?.created),
    model,
    tokens,
    attributionMethod: 'unmatched',
    attributionConfidence: 0,
    meta,
  }
}
