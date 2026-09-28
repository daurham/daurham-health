import { useState } from 'react'
import type { RecipeAssistDraft } from '@/domain/nutrition/recipe-assist'
import { primaryButtonClass, secondaryButtonClass } from '@/lib'
import { draftRecipeFromText } from './recipes-api'
import { NutritionSheet } from './Sheet'

const fieldClass = 'mt-1 block min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base'

export function RecipeAssistSheet({
  onClose,
  onApply,
}: {
  onClose: () => void
  onApply: (draft: RecipeAssistDraft) => string | null
}) {
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<RecipeAssistDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function draftIngredients() {
    setBusy(true)
    setError(null)
    try {
      setDraft(await draftRecipeFromText(text))
    } catch (caught) {
      setDraft(null)
      setError(caught instanceof Error ? caught.message : 'Recipe drafting is temporarily unavailable.')
    } finally {
      setBusy(false)
    }
  }

  function apply() {
    if (!draft) return
    const message = onApply(draft)
    if (message) setError(message)
  }

  return (
    <NutritionSheet title="Draft from recipe text" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-zinc-600">Paste the ingredient list or recipe text. Health does not fetch webpages.</p>
        <p className="text-sm text-zinc-600">Draft ingredients sends this text to Gemini and counts toward this month's AI budget. Nothing is saved until you resolve each food and save the recipe.</p>
        <label className="block text-sm">
          Recipe text
          <textarea className={fieldClass} value={text} onChange={(event) => setText(event.target.value)} rows={8} />
        </label>
        <button type="button" className={primaryButtonClass} disabled={busy || text.trim().length === 0} onClick={() => void draftIngredients()}>
          {busy ? 'Drafting…' : 'Draft ingredients'}
        </button>
        {error ? <p className="text-sm text-red-800">{error}</p> : null}
        {error ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void draftIngredients()}>
              Retry draft
            </button>
            <button type="button" className={secondaryButtonClass} onClick={onClose}>
              Continue manually
            </button>
          </div>
        ) : null}
        {draft ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">Suggested title: {draft.title ?? 'None'}</p>
            <p className="text-sm">Suggested servings: {draft.yieldServings ?? 'None'}</p>
            <ul className="space-y-2">
              {draft.ingredients.map((ingredient) => (
                <li key={ingredient.draftId} className="rounded-xl border border-zinc-200 bg-white p-3 text-sm">
                  <p className="font-medium">{ingredient.name}</p>
                  <p className="text-zinc-700">
                    {ingredient.quantity ?? 'No quantity'}
                    {ingredient.unit ? ` ${ingredient.unit}` : ''}
                  </p>
                  <p className="text-zinc-600">Source: {ingredient.sourceText}</p>
                  <p className="text-zinc-600">Unresolved until you choose a food.</p>
                </li>
              ))}
            </ul>
            <button type="button" className={primaryButtonClass} onClick={apply}>
              Apply draft
            </button>
          </div>
        ) : null}
      </div>
    </NutritionSheet>
  )
}
