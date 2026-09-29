import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  MEAL_PHOTO_PROMPT_VERSION,
  NUTRITION_GEMINI_REQUEST_TYPES,
  NUTRITION_USER_CONTEXT_MAX,
  commitNutritionMealEstimateRequestSchema,
  compileMealClarificationContext,
  displayClarificationAnswer,
  emptyMealEstimate,
  mealFailureMessage,
  mealPhotoPrompt,
  mealReviewDiffers,
  parseMealClarificationAnswers,
  resolveMealClarificationContext,
  sanitizeMealEstimate,
  selectedClarificationAnswers,
  type MealClarification,
} from '../src/domain/nutrition/index.ts'
import { BACKUP_TABLES, LATEST_SCHEMA_MIGRATION } from '../server/backup/inventory.ts'

function rawMeal(extra?: Record<string, unknown>) {
  return {
    name: 'Chicken, rice and broccoli',
    foodsSeen: ['chicken thigh'],
    assumptions: ['some cooking oil may be present'],
    calories: 722,
    proteinGrams: 48.2,
    carbsGrams: 76.4,
    fatGrams: 25.2,
    fiberGrams: 7.2,
    ...extra,
  }
}

function ask(kind: string, answerKind: string, question: string, extra?: Record<string, unknown>) {
  return { kind, answerKind, question, ...extra }
}

function clarified(questions: unknown[]) {
  return sanitizeMealEstimate(rawMeal({ clarifications: questions }))
}

describe('meal clarification prompt and candidate', () => {
  it('asks meal-photo-v3 for at most three same-meal clarifications and forbids goals and impact claims', () => {
    const prompt = mealPhotoPrompt(null, 1)
    expect(MEAL_PHOTO_PROMPT_VERSION).toBe('meal-photo-v3')
    expect(prompt).toContain('up to three')
    expect(prompt).toContain('same photographed meal')
    expect(prompt).toContain('same meal')
    expect(prompt).toContain('calorie goals')
    expect(prompt).toContain('Apple Health')
    expect(prompt).toContain('Health history')
    expect(prompt).toContain('calorie impact')
    expect(prompt).toContain('macro impact')
    expect(prompt).toContain('estimate total calories')
    expect(prompt).toContain('{"name":"Chicken, rice and broccoli"')
    expect(prompt).not.toContain('"id"')
    const schema = JSON.stringify(readFileSync('src/domain/nutrition/interpret.ts', 'utf8'))
    expect(schema).toContain('meal-photo-v3')
  })

  it('defaults clarifications to an empty list and keeps existing nutrition rounding', () => {
    const candidate = sanitizeMealEstimate(rawMeal())
    expect(candidate.clarifications).toEqual([])
    expect(emptyMealEstimate().clarifications).toEqual([])
    expect(candidate.calories).toBe(720)
    expect(candidate.proteinGrams).toBe(48)
    expect(candidate.carbsGrams).toBe(76)
    expect(candidate.fatGrams).toBe(25)
    expect(candidate.fiberGrams).toBe(7)
    expect(sanitizeMealEstimate({ ...rawMeal(), clarifications: 'nope' }).clarifications).toEqual([])
    expect(sanitizeMealEstimate({ ...rawMeal(), clarifications: [{ kind: 'nope' }] }).calories).toBe(720)
  })

  it('accepts each kind and answer kind, assigns c1 through c3, and drops the rest', () => {
    const candidate = clarified([
      ask('preparation', 'yes_no', 'Was the chicken breaded or unbreaded?', { id: 'model-id', confidence: 0.9, calorieImpact: 200 }),
      ask('hidden_fat', 'yes_no', 'Was oil or butter added after cooking?'),
      ask('sauce', 'yes_no', 'Did you eat the visible dressing?'),
      ask('portion', 'short_text', 'About how many dumplings did you eat?'),
    ])
    expect(candidate.clarifications.map((item) => item.kind)).toEqual(['preparation', 'hidden_fat', 'sauce'])
    expect(candidate.clarifications.map((item) => item.answerKind)).toEqual(['yes_no', 'yes_no', 'yes_no'])
    expect(candidate.clarifications.map((item) => item.id)).toEqual(['c1', 'c2', 'c3'])
    expect(candidate.clarifications[0]).toEqual({
      id: 'c1',
      kind: 'preparation',
      answerKind: 'yes_no',
      question: 'Was the chicken breaded or unbreaded?',
    })
    const more = clarified([
      ask('portion', 'short_text', 'About how many dumplings did you eat?'),
      ask('ingredient_identity', 'short_text', 'What type of noodles are these?'),
      ask('other', 'short_text', 'Was this the lunch portion or the dinner portion?'),
    ])
    expect(more.clarifications.map((item) => [item.id, item.kind, item.answerKind])).toEqual([
      ['c1', 'portion', 'short_text'],
      ['c2', 'ingredient_identity', 'short_text'],
      ['c3', 'other', 'short_text'],
    ])
  })

  it('drops blank, overlong, invalid, duplicate, numeric, impact, and health questions without failing the meal', () => {
    const candidate = clarified([
      ask('hidden_fat', 'yes_no', '   '),
      ask('hidden_fat', 'yes_no', `${'oil '.repeat(70)}added`),
      ask('mystery', 'yes_no', 'Was the chicken breaded or unbreaded?'),
      ask('sauce', 'scale', 'Did you eat the visible dressing?'),
      ask('sauce', 'yes_no', 'Did you eat the visible dressing?'),
      ask('sauce', 'yes_no', '  did you   eat the visible dressing? '),
      ask('portion', 'short_text', '42'),
      ask('hidden_fat', 'yes_no', 'Was 200 calories of oil added?'),
      ask('portion', 'short_text', 'Is this about 4 oz?'),
      ask('sauce', 'yes_no', 'Was there enough dressing to add 150 calories?'),
      ask('other', 'yes_no', 'Are you cutting carbs?'),
      ask('ingredient_identity', 'short_text', 'What type of noodles are these?'),
    ])
    expect(candidate.status).not.toBe('invalid')
    expect(candidate.clarifications.map((item) => item.question)).toEqual([
      'Did you eat the visible dressing?',
      'What type of noodles are these?',
    ])
    expect(candidate.calories).toBe(720)
  })
})

describe('clarification answers and compiled context', () => {
  const clarifications: MealClarification[] = clarified([
    ask('hidden_fat', 'yes_no', 'Was oil or butter added after cooking?'),
    ask('ingredient_identity', 'short_text', 'What type of noodles are these?'),
    ask('sauce', 'yes_no', 'Did you eat the visible dressing?'),
  ]).clarifications

  it('accepts the old reanalyze body and at most three unique answers', () => {
    expect(parseMealClarificationAnswers(undefined)).toEqual({ ok: true, answers: [] })
    expect(
      resolveMealClarificationContext({
        provider: 'gemini',
        storedUserContext: 'late dinner',
        clarifications,
        answers: [],
      }),
    ).toEqual({ ok: true, mode: 'plain' })
    expect(parseMealClarificationAnswers([{ id: 'c1', answer: 'yes' }, { id: 'c2', answer: 'udon' }, { id: 'c3', answer: 'no' }]).ok).toBe(true)
    expect(parseMealClarificationAnswers([{ id: 'c1', answer: 'yes' }, { id: 'c1', answer: 'no' }, { id: 'c2', answer: 'udon' }, { id: 'c3', answer: 'no' }])).toMatchObject({
      ok: false,
      failure: { status: 400, code: 'CLARIFICATION_ANSWER' },
    })
    expect(parseMealClarificationAnswers([{ id: 'c1', answer: 'yes' }, { id: 'c1', answer: 'no' }])).toMatchObject({
      ok: false,
      failure: { code: 'CLARIFICATION_ANSWER' },
    })
  })

  it('validates yes/no and short text against the stored candidate', () => {
    for (const answer of ['yes', 'no', 'not_sure'] as const) {
      const resolved = resolveMealClarificationContext({
        provider: 'gemini',
        storedUserContext: null,
        clarifications,
        answers: [{ id: 'c1', answer }],
      })
      expect(resolved.ok).toBe(true)
      if (resolved.ok && resolved.mode === 'refine') {
        expect(resolved.userContext).toContain('Was oil or butter added after cooking?')
        expect(resolved.userContext).toContain(`Answer: ${displayClarificationAnswer(answer)}`)
        expect(resolved.userContext).not.toContain('c1')
      }
    }
    expect(
      resolveMealClarificationContext({
        provider: 'gemini',
        storedUserContext: null,
        clarifications,
        answers: [{ id: 'c1', answer: 'maybe' }],
      }),
    ).toMatchObject({ ok: false, failure: { status: 400, code: 'CLARIFICATION_ANSWER' } })
    const text = resolveMealClarificationContext({
      provider: 'gemini',
      storedUserContext: null,
      clarifications,
      answers: [{ id: 'c2', answer: 'udon', question: 'client question' } as { id: string; answer: string }],
    })
    expect(text).toMatchObject({ ok: true, mode: 'refine' })
    if (text.ok && text.mode === 'refine') {
      expect(text.userContext).toContain('What type of noodles are these?')
      expect(text.userContext).toContain('Answer: udon')
      expect(text.userContext).not.toContain('client question')
    }
    expect(parseMealClarificationAnswers([{ id: 'c2', answer: '   ' }])).toEqual({ ok: true, answers: [] })
    expect(parseMealClarificationAnswers([{ id: 'c2', answer: 'u'.repeat(161) }])).toMatchObject({
      ok: false,
      failure: { code: 'CLARIFICATION_ANSWER' },
    })
  })

  it('fails closed on stale ids and compiles only answered clarifications under the context ceiling', () => {
    expect(
      resolveMealClarificationContext({
        provider: 'gemini',
        storedUserContext: 'late dinner',
        clarifications,
        answers: [{ id: 'c9', answer: 'yes' }],
      }),
    ).toMatchObject({ ok: false, failure: { status: 409, code: 'stale_clarification' } })
    expect(mealFailureMessage('stale_clarification')).toContain('Review the latest estimate')
    const compiled = compileMealClarificationContext({
      userContext: 'late dinner',
      items: [{ question: clarifications[0]!.question, answer: 'yes' }],
    })
    expect(compiled).toContain('OWNER CONTEXT:\nlate dinner')
    expect(compiled).toContain('OWNER CLARIFICATIONS:')
    expect(compiled.match(/Answer:/g)).toHaveLength(1)
    expect(compiled).not.toContain('noodles')
    expect(compiled.length).toBeLessThanOrEqual(NUTRITION_USER_CONTEXT_MAX)
    const overflow = resolveMealClarificationContext({
      provider: 'gemini',
      storedUserContext: 'a'.repeat(1990),
      clarifications,
      answers: [{ id: 'c1', answer: 'yes' }],
      contextMax: NUTRITION_USER_CONTEXT_MAX,
    })
    expect(overflow).toMatchObject({ ok: false, failure: { status: 400, code: 'CONTEXT_TOO_LONG' } })
    expect(NUTRITION_USER_CONTEXT_MAX).toBe(2000)
  })

  it('rejects Home-AI answers and leaves ordinary Home-AI reanalysis available', () => {
    expect(
      resolveMealClarificationContext({
        provider: 'home_ai',
        storedUserContext: null,
        clarifications,
        answers: [{ id: 'c1', answer: 'yes' }],
      }),
    ).toMatchObject({ ok: false, failure: { status: 400, code: 'CLARIFICATION_PROVIDER_UNSUPPORTED' } })
    expect(
      resolveMealClarificationContext({
        provider: 'home_ai',
        storedUserContext: 'one photo',
        clarifications,
        answers: [],
      }),
    ).toEqual({ ok: true, mode: 'plain' })
  })

  it('sends only selected answers and treats an edited review as different from the candidate', () => {
    expect(selectedClarificationAnswers(clarifications, {})).toEqual([])
    expect(selectedClarificationAnswers(clarifications, { c1: 'yes', c2: '   ', c3: '' })).toEqual([{ id: 'c1', answer: 'yes' }])
    const candidate = { name: 'Chicken', calories: 720, proteinGrams: 48, carbsGrams: 76, fatGrams: 25, fiberGrams: 7 }
    expect(mealReviewDiffers(candidate, candidate)).toBe(false)
    expect(mealReviewDiffers(candidate, { ...candidate, name: 'Chicken bowl' })).toBe(true)
    expect(mealReviewDiffers(candidate, { ...candidate, calories: 680 })).toBe(true)
  })
})

describe('clarification reanalysis boundaries', () => {
  const meal = readFileSync('server/nutrition/meal.ts', 'utf8')
  const reanalyze = meal.slice(meal.indexOf('export async function reanalyzeNutritionMeal'), meal.indexOf('export async function dismissNutritionMealJob'))
  const ui = readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')
  const sheet = ui.slice(ui.indexOf('function MealEstimateSheet'), ui.indexOf('function EstimateField'))
  const refine = ui.slice(ui.indexOf('async function refineEstimate'), ui.indexOf('async function discardCapture'))

  it('requeues the same job after validation and does not rewrite images or reserve usage', () => {
    expect(reanalyze.indexOf('CLARIFICATION_PROVIDER_UNSUPPORTED')).toBeLessThan(reanalyze.indexOf('getLabelJobRecord'))
    expect(reanalyze.indexOf('CLARIFICATION_PROVIDER_UNSUPPORTED')).toBeLessThan(reanalyze.indexOf('createHomeAiMealJob'))
    expect(reanalyze.indexOf('MULTI_PHOTO_UNSUPPORTED')).toBeLessThan(reanalyze.indexOf('createHomeAiMealJob'))
    expect(reanalyze).toContain('requeueCaptureJob({ jobId, userContext: input.userContext })')
    const refined = reanalyze.slice(reanalyze.indexOf('resolveMealClarificationContext'))
    expect(refined.indexOf('clarificationHttpError')).toBeLessThan(refined.indexOf('requeueCaptureJob'))
    expect(refined).toContain('userContext: resolved.userContext')
    expect(reanalyze).not.toContain('nutrition_capture_images')
    expect(reanalyze).not.toContain('ai_usage')
    expect(reanalyze).not.toContain('ledger.reserve')
    expect(reanalyze).not.toContain('runNutritionGeminiAttempt')
    const requeue = readFileSync('server/nutrition/label-jobs.ts', 'utf8').match(/function requeueCaptureJob[\s\S]*?^}/m)?.[0] ?? ''
    expect(requeue).toContain('candidate_json = NULL')
    expect(requeue).not.toContain('nutrition_capture_images')
    expect(requeue).not.toContain('ai_usage')
    const geminiJobs = readFileSync('server/nutrition/gemini-jobs.ts', 'utf8')
    expect(geminiJobs).toContain('listMealCaptureImages')
    expect(geminiJobs).toContain('interpretMealPhoto')
    expect(NUTRITION_GEMINI_REQUEST_TYPES.meal_photo).toBe('nutrition_meal_photo')
    const usage = readFileSync('server/nutrition/gemini-usage.ts', 'utf8')
    expect(usage).toContain('NUTRITION_GEMINI_REQUEST_TYPES[kind]')
    expect(usage).toContain('ledger.reserve')
    expect(readFileSync('server/integrations/gemini/client.ts', 'utf8')).toContain("usageKind: 'meal_photo'")
    expect(readFileSync('server/integrations/gemini/client.ts', 'utf8')).toContain('withGeminiRetry')
    expect(readFileSync('src/domain/nutrition/interpret.ts', 'utf8')).toContain(
      "export const GEMINI_AUTO_RETRY_CODES = ['GEMINI_UNAVAILABLE', 'GEMINI_QUOTA']",
    )
  })

  it('shows optional Gemini refinement without calling the provider while the owner answers', () => {
    expect(sheet).toContain('candidate.clarifications.length > 0')
    expect(sheet).toContain("provider === 'gemini'")
    expect(sheet).toContain('jobId')
    expect(sheet).toContain('Help refine this estimate')
    expect(sheet).toContain('Answer only what you know. You can save or edit the estimate without refining it.')
    expect(sheet).toContain('Answering can give the estimate more context.')
    expect(sheet).toContain('Refine estimate')
    expect(sheet).toContain('Yes')
    expect(sheet).toContain('No')
    expect(sheet).toContain('Not sure')
    expect(sheet).toContain('not_sure')
    expect(sheet).toContain('selectedClarificationAnswers')
    expect(sheet).toContain('disabled={answeredClarifications.length === 0 || busy}')
    expect(sheet).not.toContain('reanalyzeNutritionMealJob')
    expect(sheet.indexOf('Refining will replace this unsaved estimate with a new AI estimate. Your current edits are not saved.')).toBeLessThan(
      sheet.indexOf('onRefine(answeredClarifications)'),
    )
    expect(sheet).toContain('Save meal')
    expect(sheet).not.toContain('clarificationAnswers')
    expect(refine).toContain("provider: 'gemini'")
    expect(refine).toContain('clarificationAnswers: answers')
    expect(refine).toContain("setPhase('working')")
    expect(ui).toContain('payload?.candidate?.clarifications.map')
    expect(ui).not.toContain('more accurate')
    expect(ui).not.toContain('confidence')
    expect(ui).toContain('Edit context')
    expect(ui).toContain('Add context (optional)')
  })

  it('leaves canonical nutrition, schema, backup, and the demo unchanged', () => {
    expect(commitNutritionMealEstimateRequestSchema.shape).not.toHaveProperty('clarifications')
    expect(commitNutritionMealEstimateRequestSchema.shape).not.toHaveProperty('clarificationAnswers')
    const commit = meal.slice(meal.indexOf('export async function commitNutritionMealEstimate'))
    expect(commit).not.toContain('clarification')
    expect(commit).toContain("'photo_ai'")
    expect(readdirSync('migrations')).toContain('0035_coach_tasks.sql')
    expect(LATEST_SCHEMA_MIGRATION).toBe('0035_coach_tasks.sql')
    expect(BACKUP_TABLES.map((table) => table.name)).not.toContain('meal_clarifications')
    expect(BACKUP_TABLES.find((table) => table.name === 'nutrition_capture_jobs')).toMatchObject({
      backupClass: 'operational',
      portable: false,
    })
    const demo = readFileSync('src/demo/repository.ts', 'utf8')
    const demoPage = readFileSync('src/features/demo/DemoNutritionPage.tsx', 'utf8')
    expect(demo).toContain('no database client')
    expect(demo).not.toContain('clarificationAnswers')
    expect(demoPage).not.toContain('Refine estimate')
    expect(demoPage).not.toContain('gemini')
    expect(readFileSync('src/domain/nutrition/interpret.ts', 'utf8')).toContain("meal_photo: 'nutrition_meal_photo'")
  })
})
