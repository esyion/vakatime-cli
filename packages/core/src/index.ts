// Public API of @vibetime/core. Imported by `hook` and `desktop` (Phase 3+).

export {
  adaptClaudeCode,
  adaptCodex,
  adaptCursor,
  adaptGeminiCli,
  adaptOpenCode,
  adaptZcode,
} from './adapters/index.js'
export { getAgentColorHex } from './agent-theme.js'
export type {
  CodexTranscriptCandidate,
  CodexTurnCompletion,
  FindCodexTurnCompletionInTranscriptsInput,
} from './codex-transcript.js'
export { findCodexTurnCompletionInTranscripts } from './codex-transcript.js'
export type { AdapterFn, Agent, EventType, NormalizedEvent } from './events.js'
export type {
  HistoryCalendarDay,
  HistoryEvent,
  HistoryHourlyCell,
  HistoryPeriodCompare,
  HistoryPeriodDays,
  HistoryProjectAgentTotal,
  HistorySummary,
  HistoryTopProjectRow,
  HistoryTrendDay,
  HistoryTurnDuration,
} from './history.js'
export {
  buildHistorySummaryFromEvents,
  HISTORY_PERIODS,
  HISTORY_TURN_START_BUFFER_SEC,
  historyLowerBound,
  isHistoryPeriodDays,
} from './history.js'
export type { ResolveProjectInput } from './project.js'
export { parseGitRemoteUrl, resolveProject } from './project.js'
export {
  DDL_EVENTS,
  DDL_INDICES,
  DDL_OPEN_TURNS,
  DDL_USAGE_INDICES,
  DDL_USAGE_PRICING_CACHE,
  DDL_USAGE_RECORDS,
  DDL_USAGE_SCAN_STATE,
  SCHEMA_VERSION,
} from './schema.js'
export type {
  DayAllocation,
  DayAllocationInput,
  TimeWindowInput,
  TurnInterval,
  TurnIntervalInput,
} from './time.js'
export { allocateDurationByLocalDay, durationWithinWindow, resolveTurnInterval } from './time.js'
export { buildUsagePeriodCompare, buildUsageSummary } from './usage/aggregate.js'
export { scanClaudeUsageTranscript, scanClaudeUsageTranscripts } from './usage/claude-scanner.js'
export { scanCodexUsageTranscript, scanCodexUsageTranscripts } from './usage/codex-scanner.js'
export { scanOpenCodeMessageRecord } from './usage/opencode-scanner.js'
export {
  createUsagePriceResolver,
  estimateUsageCostUsd,
  lookupUsagePrice,
  normalizeModelsDevPricingPayload,
  pricingStatusFromCache,
  resolveUsagePrice,
} from './usage/pricing.js'
export { reconcileUsageWithHookEvents } from './usage/reconcile.js'
export type {
  UsageAgent,
  UsageAttributionMethod,
  UsageAuditRow,
  UsageAvailableFilters,
  UsageCodexScannerContext,
  UsageDailySummaryRow,
  UsageDataQualitySummary,
  UsageEfficiencyBreakdownRow,
  UsageEfficiencyDailyRow,
  UsageEfficiencySummary,
  UsageEfficiencyTotals,
  UsageMetricPeriodComparison,
  UsagePeriodComparison,
  UsagePersistableMeta,
  UsagePriceMatchKind,
  UsagePriceResolution,
  UsagePricingEntry,
  UsagePricingStatus,
  UsageProjectModelMatrixCell,
  UsageRecordFact,
  UsageRefreshFrequency,
  UsageRefreshResult,
  UsageScannerContext,
  UsageScanResult,
  UsageScanState,
  UsageSummary,
  UsageSummaryArgs,
  UsageSummaryBreakdownRow,
  UsageSummaryTotals,
  UsageTokenBreakdown,
  UsageTranscriptCandidate,
} from './usage/types.js'
export {
  isUsageAgent,
  isUsageRefreshFrequency,
  sanitizeUsageMeta,
  USAGE_AGENTS,
  USAGE_REFRESH_FREQUENCIES,
} from './usage/types.js'

export type { HeartbeatCategory, HeartbeatEntityType, HeartbeatInput, HeartbeatValidationIssue, NormalizedHeartbeat, NormalizeHeartbeatResult } from './heartbeat.js'
export { heartbeatDedupeKey, normalizeHeartbeat, normalizeHeartbeatsBulk } from './heartbeat.js'
export type { BuildDurationsOptions, DurationSegment } from './duration.js'
export { buildDurationsFromHeartbeats, DEFAULT_HEARTBEAT_TIMEOUT_SEC } from './duration.js'
export type { DailySummary, DailySummaryBreakdownRow } from './summary.js'
export { buildDailySummariesFromDurations } from './summary.js'
