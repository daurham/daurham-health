export const LIFECYCLE_STATUSES = ['active', 'paused', 'discontinued'] as const
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number]

export const STORED_ADHERENCE_STATUSES = ['taken', 'skipped'] as const
export type StoredAdherenceStatus = (typeof STORED_ADHERENCE_STATUSES)[number]

export const OCCURRENCE_STATES = ['taken', 'skipped', 'unknown', 'paused', 'not_scheduled'] as const
export type OccurrenceState = (typeof OCCURRENCE_STATES)[number]

export const ADHERENCE_ACTIONS = ['taken', 'skipped', 'clear'] as const
export type AdherenceAction = (typeof ADHERENCE_ACTIONS)[number]

export type ScheduleWindow = {
  id: string
  supplementId: string
  slotLabel: string | null
  doseAmount: number
  doseUnit: string
  weekdayMask: number
  effectiveFrom: string
  effectiveThrough: string | null
  sortOrder: number
}

export type StatusEventWindow = {
  effectiveDate: string
  status: LifecycleStatus
}

export type AdherenceWindow = {
  scheduleId: string
  scheduledDate: string
  status: StoredAdherenceStatus
  actualDoseAmount: number | null
  actualDoseUnit: string | null
}

export type SupplementSchedule = ScheduleWindow & {
  createdAt: string
  updatedAt: string
}

export type SupplementStatusEvent = StatusEventWindow & {
  id: string
  supplementId: string
  notes: string | null
  createdAt: string
}

export type SupplementAdherence = AdherenceWindow & {
  id: string
  takenAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type SupplementRecord = {
  id: string
  name: string
  form: string | null
  brand: string | null
  productName: string | null
  notes: string | null
  sortOrder: number
  status: LifecycleStatus | null
  createdAt: string
  updatedAt: string
  schedules: SupplementSchedule[]
  statusEvents: SupplementStatusEvent[]
  adherence: SupplementAdherence[]
}

export type SupplementList = {
  date: string
  timezone: 'America/Phoenix'
  supplements: SupplementRecord[]
}

export type TodaySupplementInput = {
  id: string
  name: string
  sortOrder: number
  schedules: ScheduleWindow[]
  events: StatusEventWindow[]
  adherence: AdherenceWindow[]
}

export type TodaySupplementItem = {
  scheduleId: string
  supplementId: string
  name: string
  slotLabel: string | null
  plannedDoseAmount: number
  plannedDoseUnit: string
  actualDoseAmount: number | null
  actualDoseUnit: string | null
  state: 'taken' | 'skipped' | 'unknown'
}

export type SupplementDaySummary =
  | { kind: 'unscheduled' }
  | { kind: 'remaining'; unknownCount: number }
  | { kind: 'complete' }
  | { kind: 'recorded'; skippedCount: number }

export type TodaySupplementSection = {
  scheduledCount: number
  takenCount: number
  skippedCount: number
  unknownCount: number
  summary: SupplementDaySummary
  items: TodaySupplementItem[]
}

export type AdherenceSummary = {
  scheduledCount: number
  takenCount: number
  skippedCount: number
  unknownCount: number
  recordedCount: number
  adherenceRatio: number | null
  captureCoverageRatio: number | null
}
