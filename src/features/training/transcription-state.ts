import { TRANSCRIPTION_JOB_STORAGE_KEY, isHomeAiJobId } from '@/domain/training-transcription'

export function readStoredTranscriptionJobId(): string | null {
  try {
    const value = sessionStorage.getItem(TRANSCRIPTION_JOB_STORAGE_KEY)
    return value && isHomeAiJobId(value) ? value : null
  } catch {
    return null
  }
}

export function storeTranscriptionJobId(jobId: string): void {
  try {
    sessionStorage.setItem(TRANSCRIPTION_JOB_STORAGE_KEY, jobId)
  } catch {
    // Private mode can block sessionStorage; polling still works in this tab.
  }
}

export function clearStoredTranscriptionJobId(): void {
  try {
    sessionStorage.removeItem(TRANSCRIPTION_JOB_STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }
}
