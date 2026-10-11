/**
 * Deterministic, pure routine-block replay. No database writes, no session
 * fabrication: workout evidence and explicit owner decisions are separate.
 *
 * This engine is intentionally not wired to live planning until block
 * generations and historical anchors have durable storage/migration.
 */
export type RoutineBlockSpec = { routineCode: string; target: number }
export type RoutineBlockAnchor = {
  currentRoutineCode: string
  alreadyCompletedInCurrent: number
}
export type RoutineDayCredit = { date: string; routineCode: string; evidenceId: string }
export type RoutineBlockClosure = {
  date: string
  routineCode: string
  generation: number
  kind: 'end_early'
  reason?: string | null
}

export type RoutineBlock = {
  routineCode: string
  generation: number
  target: number
  inheritedCredits: number
  creditDates: string[]
  status: 'active' | 'completed' | 'ended_early'
  closedDate: string | null
}
export type RoutineBlockState = {
  routineCode: string
  target: number
  activeBlock: RoutineBlock
  blocks: RoutineBlock[]
}
export type RoutineRotationState = {
  currentRoutineCode: string
  cycle: number
  routines: RoutineBlockState[]
}

type MutableRoutine = { routineCode: string; target: number; blocks: RoutineBlock[] }
const makeBlock = (routineCode: string, target: number, generation: number, inheritedCredits = 0): RoutineBlock => ({
  routineCode, target, generation, inheritedCredits, creditDates: [], status: 'active', closedDate: null,
})

/** Total evidence-aware progress; closure is a different fact. */
export function creditedSessions(block: RoutineBlock): number {
  return block.inheritedCredits + block.creditDates.length
}

/**
 * Replay ordered qualified routine days. A block may be worked ahead before it
 * becomes current. Finishing the current block advances through already-closed
 * future blocks; new work on a closed routine creates its next generation.
 */
export function deriveRoutineRotation(
  specs: readonly RoutineBlockSpec[],
  anchor: RoutineBlockAnchor,
  credits: readonly RoutineDayCredit[],
  closures: readonly RoutineBlockClosure[] = [],
  asOf?: string,
): RoutineRotationState {
  if (!specs.length || new Set(specs.map((spec) => spec.routineCode)).size !== specs.length ||
      specs.some((spec) => !spec.routineCode || !Number.isInteger(spec.target) || spec.target < 1)) {
    throw new Error('Rotation must contain unique routines with positive whole-number targets.')
  }
  const startIndex = specs.findIndex((spec) => spec.routineCode === anchor.currentRoutineCode)
  if (startIndex < 0 || !Number.isInteger(anchor.alreadyCompletedInCurrent) ||
      anchor.alreadyCompletedInCurrent < 0 || anchor.alreadyCompletedInCurrent >= specs[startIndex]!.target) {
    throw new Error('Rotation anchor must identify a current routine with progress below its target.')
  }
  const states: MutableRoutine[] = specs.map((spec, index) => {
    const block = makeBlock(
      spec.routineCode, spec.target, 1,
      index < startIndex ? spec.target : index === startIndex ? anchor.alreadyCompletedInCurrent : 0,
    )
    if (index < startIndex) block.status = 'completed'
    return { ...spec, blocks: [block] }
  })
  const lookup = new Map(states.map((state) => [state.routineCode, state]))
  let pointerIndex = startIndex
  let cycle = 1

  function currentOf(state: MutableRoutine) {
    return state.blocks[state.blocks.length - 1]!
  }
  function ensureOpenForNewWork(state: MutableRoutine) {
    let block = currentOf(state)
    if (block.status !== 'active') {
      block = makeBlock(state.routineCode, state.target, block.generation + 1)
      state.blocks.push(block)
    }
    return block
  }
  function advancePointer() {
    // A closed block may already have extra future-generation work. The
    // current cycle references its own block, not simply the latest block.
    for (let attempts = 0; attempts < specs.length + 1; attempts++) {
      const state = states[pointerIndex]!
      let block = state.blocks.find((entry) => entry.generation === cycle)
      if (!block) {
        const latest = currentOf(state)
        if (latest.generation < cycle && latest.status !== 'active') {
          block = makeBlock(state.routineCode, state.target, cycle)
          state.blocks.push(block)
        } else if (latest.generation === cycle) {
          block = latest
        } else {
          throw new Error('An open routine block cannot cross an unfinished generation.')
        }
      }
      if (block && block.status === 'active') return
      if (pointerIndex === specs.length - 1) cycle += 1
      pointerIndex = (pointerIndex + 1) % specs.length
    }
    throw new Error('Rotation advancement could not find an active block.')
  }

  const events = [
    ...credits.map((credit) => ({ date: credit.date, sort: 0 as const, credit })),
    ...closures.map((closure) => ({ date: closure.date, sort: 1 as const, closure })),
  ].filter((event) => !asOf || event.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date) || a.sort - b.sort)
  const creditedDays = new Set<string>()

  for (const event of events) {
    if ('credit' in event && event.credit) {
      const credit = event.credit
      const state = lookup.get(credit.routineCode)
      if (!state) continue
      const key = credit.routineCode + ':' + credit.date
      if (creditedDays.has(key)) continue // at most one credit per routine/day
      creditedDays.add(key)
      const block = ensureOpenForNewWork(state)
      block.creditDates.push(credit.date)
      if (creditedSessions(block) >= block.target) {
        block.status = 'completed'
        block.closedDate = credit.date
      }
    } else if ('closure' in event && event.closure) {
      const closure = event.closure
      const state = lookup.get(closure.routineCode)
      const block = state?.blocks.find((item) => item.generation === closure.generation)
      if (block?.status === 'active') {
        block.status = 'ended_early'
        block.closedDate = closure.date
      }
    }
    advancePointer()
  }

  return {
    currentRoutineCode: states[pointerIndex]!.routineCode,
    cycle,
    routines: states.map((state) => ({
      routineCode: state.routineCode,
      target: state.target,
      activeBlock: { ...currentOf(state), creditDates: [...currentOf(state).creditDates] },
      blocks: state.blocks.map((block) => ({ ...block, creditDates: [...block.creditDates] })),
    })),
  }
}
