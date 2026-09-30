export const REWARD_STATE_CHANGED = 'health:reward-state-changed'

export function notifyRewardStateChanged(detail?: { kind?: 'award' | 'purchase' | 'refund' | 'catalog' }): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(REWARD_STATE_CHANGED, { detail }))
}

export function subscribeRewardStateChanges(refresh: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const changed = () => refresh()
  window.addEventListener(REWARD_STATE_CHANGED, changed)
  return () => window.removeEventListener(REWARD_STATE_CHANGED, changed)
}
