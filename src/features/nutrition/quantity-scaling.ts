/** Rescale the displayed nutrient draft when an existing log changes quantity.
 * The draft (not the original food) is the source so intentional manual edits
 * are retained and unknown values remain unknown.
 */
export type EditableNutrients = {
  calories: string
  protein: string
  carbs: string
  fat: string
  fiber: string
  sodium: string
}

export function scaleEditableNutrients(
  values: EditableNutrients,
  previousQuantity: number,
  nextQuantity: number,
): EditableNutrients {
  if (!Number.isFinite(previousQuantity) || previousQuantity <= 0 ||
      !Number.isFinite(nextQuantity) || nextQuantity <= 0) {
    return values
  }
  const factor = nextQuantity / previousQuantity
  const scale = (value: string): string => {
    if (value.trim() === '') return ''
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return value
    // Bound floating-point noise without rounding away fractional microdata.
    return String(Number((numeric * factor).toFixed(6)))
  }
  return {
    calories: scale(values.calories),
    protein: scale(values.protein),
    carbs: scale(values.carbs),
    fat: scale(values.fat),
    fiber: scale(values.fiber),
    sodium: scale(values.sodium),
  }
}
