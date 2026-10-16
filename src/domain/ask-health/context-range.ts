import type { ProgressRange } from '../progress/types.js'
import type { AskContextMode } from './config.js'

/** Make Deep Dive's date boundary conspicuous before a user submits an AI
 * request. A broad context mode is not a substitute for selecting a range.
 */
export function deepDiveRangeHint(
  mode: AskContextMode,
  range: ProgressRange,
): { message: string; canExpand: boolean } | null {
  if (mode !== 'deep') return null
  if (range === 'all') return {
    message: 'All available recorded history selected. Health still uses a bounded evidence packet, so not every saved record is sent to AI.',
    canExpand: false,
  }
  const labels: Record<Exclude<ProgressRange, 'all'>, string> = {
    '30d': '30 days', '90d': '90 days', '6m': '6 months', '1y': '1 year',
  }
  return {
    message: 'Deep Dive currently covers only the selected ' + labels[range] + '. Earlier saved history is not included in the evidence window.',
    canExpand: true,
  }
}
