import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

export type Sql = NeonQueryFunction<false, false>

function redactSecrets(text: string): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    return text
  }
  return text.split(url).join('[DATABASE_URL]')
}

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('Missing required environment variable: DATABASE_URL')
  }
  return url
}

export function getSql(): Sql {
  return neon(getDatabaseUrl())
}

export function formatDatabaseError(error: unknown): string {
  if (error instanceof Error) {
    return redactSecrets(error.message)
  }
  return 'Unknown database error'
}
