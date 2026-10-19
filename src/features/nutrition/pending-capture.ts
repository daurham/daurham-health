/**
 * The panel's job ID can be absent when a photo was created inside the sheet.
 * Use the actual approved/dismissed job ID, falling back to the ID used to
 * reopen an older pending card. Never remove an unrelated card.
 */
export function withoutResolvedCapture<T extends { id: string }>(
  jobs: readonly T[],
  resolvedJobId: string | null | undefined,
  openedJobId: string | null | undefined,
): T[] {
  const id = resolvedJobId || openedJobId
  return id ? jobs.filter((job) => job.id !== id) : [...jobs]
}
