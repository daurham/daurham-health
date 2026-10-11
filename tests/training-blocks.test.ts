import { describe, expect, it } from 'vitest'
import {
  creditedSessions, deriveRoutineRotation, rotationSequenceUnchanged,
  type RoutineDayCredit, type RoutineBlockAnchor,
} from '../src/domain/training-blocks.ts'

const rotation = [
  { routineCode: 'A', target: 6 },
  { routineCode: 'B', target: 6 },
  { routineCode: 'C', target: 6 },
] as const
const anchor: RoutineBlockAnchor = { currentRoutineCode: 'B', alreadyCompletedInCurrent: 5 }
const credit = (date: string, routineCode: string): RoutineDayCredit =>
  ({ date, routineCode, evidenceId: date + '/' + routineCode })
const stateOf = (state: ReturnType<typeof deriveRoutineRotation>, routineCode: string) =>
  state.routines.find((routine) => routine.routineCode === routineCode)!

describe('independent routine block replay', () => {
  it('keeps B current at 5/6 while advancing C out of order', () => {
    const state = deriveRoutineRotation(rotation, anchor, [credit('2026-10-08', 'C')])
    expect(state.currentRoutineCode).toBe('B')
    expect(creditedSessions(stateOf(state, 'B').activeBlock)).toBe(5)
    expect(creditedSessions(stateOf(state, 'C').activeBlock)).toBe(1)
  })

  it('finishes B and advances to C without resetting C early progress', () => {
    const state = deriveRoutineRotation(rotation, anchor, [
      credit('2026-10-08', 'C'), credit('2026-10-09', 'B'),
    ])
    expect(state.currentRoutineCode).toBe('C')
    expect(stateOf(state, 'B').blocks[0]?.status).toBe('completed')
    expect(creditedSessions(stateOf(state, 'C').activeBlock)).toBe(1)
  })

  it('starts a new B generation after its prior block finished, without stealing the current pointer', () => {
    const state = deriveRoutineRotation(rotation, anchor, [
      credit('2026-10-08', 'C'), credit('2026-10-09', 'B'), credit('2026-10-10', 'B'),
    ])
    expect(state.currentRoutineCode).toBe('C')
    const blocks = stateOf(state, 'B').blocks
    expect(blocks).toHaveLength(2)
    expect(creditedSessions(blocks[0]!)).toBe(6)
    expect(creditedSessions(blocks[1]!)).toBe(1)
    expect(blocks[1]?.generation).toBe(2)
  })

  it('moves to A in the next cycle when C completes', () => {
    const moreC = Array.from({ length: 5 }, (_, i) => credit('2026-10-' + String(i + 11).padStart(2, '0'), 'C'))
    const state = deriveRoutineRotation(rotation, anchor, [
      credit('2026-10-08', 'C'), credit('2026-10-09', 'B'), ...moreC,
    ])
    expect(state.currentRoutineCode).toBe('A')
    expect(state.cycle).toBe(2)
    expect(stateOf(state, 'A').activeBlock.generation).toBe(2)
    expect(creditedSessions(stateOf(state, 'C').blocks[0]!)).toBe(6)
  })

  it('closes an injured B block early without pretending all six sessions happened', () => {
    const state = deriveRoutineRotation(rotation,
      { currentRoutineCode: 'B', alreadyCompletedInCurrent: 4 }, [],
      [{ date: '2026-10-08', routineCode: 'B', generation: 1, kind: 'end_early', reason: 'injury' }],
    )
    expect(state.currentRoutineCode).toBe('C')
    expect(stateOf(state, 'B').blocks[0]).toMatchObject({ status: 'ended_early', inheritedCredits: 4 })
    expect(creditedSessions(stateOf(state, 'B').blocks[0]!)).toBe(4)
  })

  it('credits at most once per routine per date and replays corrections from scratch', () => {
    const credits = [
      credit('2026-10-08', 'B'), credit('2026-10-08', 'B'), credit('2026-10-09', 'B'),
    ]
    const first = deriveRoutineRotation(rotation, anchor, credits)
    const afterCorrection = deriveRoutineRotation(rotation, anchor, credits.slice(1, 2))
    expect(stateOf(first, 'B').blocks).toHaveLength(2)
    expect(creditedSessions(stateOf(first, 'B').blocks[1]!)).toBe(1)
    expect(stateOf(afterCorrection, 'B').blocks).toHaveLength(1)
    expect(creditedSessions(stateOf(afterCorrection, 'B').blocks[0]!)).toBe(6)
  })

  it('does not include credits after the requested historical as-of date', () => {
    const state = deriveRoutineRotation(rotation, anchor,
      [credit('2026-10-08', 'C'), credit('2026-10-09', 'B')],
      [], '2026-10-08')
    expect(state.currentRoutineCode).toBe('B')
    expect(stateOf(state, 'B').blocks[0]?.status).toBe('active')
  })
})

// Weekly frequency, chosen days, and notes are not part of rotation identity.
describe('version-to-version rotation continuity', () => {
  it('preserves confirmed rotation decisions only when codes and session targets stay identical', () => {
    const before = [...Array(6).fill('A'), ...Array(6).fill('B'), ...Array(6).fill('C')]
    expect(rotationSequenceUnchanged(before, [...before])).toBe(true)
    expect(rotationSequenceUnchanged(before, before.slice(0, -1))).toBe(false)
    expect(rotationSequenceUnchanged(before, ['B', ...before.slice(1)])).toBe(false)
    expect(rotationSequenceUnchanged(before, [...before.slice(0, 6), 'C', ...before.slice(7)])).toBe(false)
  })
})
