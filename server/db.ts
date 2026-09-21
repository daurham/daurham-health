import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { loadLocalEnv } from './env.ts'

export type Sql = NeonQueryFunction<false, false>

function redactSecrets(text: string): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    return text
  }
  return text.split(url).join('[DATABASE_URL]')
}

export async function getDatabaseUrl(): Promise<string> {
  await loadLocalEnv()
  const url = process.env.DATABASE_URL
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('Missing required environment variable: DATABASE_URL')
  }
  return url
}

export async function getSql(): Promise<Sql> {
  return neon(await getDatabaseUrl())
}

export function formatDatabaseError(error: unknown): string {
  if (error instanceof Error) {
    return redactSecrets(error.message)
  }
  return 'Unknown database error'
}
