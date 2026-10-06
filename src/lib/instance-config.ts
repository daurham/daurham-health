import {
  publicInstanceConfigSchema,
  type PublicInstanceConfig,
} from '@/domain/instance-config'
import { healthFetch, readApiError } from './health-api'

let cached: PublicInstanceConfig | null = null
let inflight: Promise<PublicInstanceConfig> | null = null

export async function fetchPublicInstanceConfig(): Promise<PublicInstanceConfig> {
  if (cached) return cached
  if (inflight) return inflight

  inflight = healthFetch('/api/health')
    .then(async (response) => {
      if (!response.ok) throw new Error(await readApiError(response))
      const body = (await response.json()) as { instance?: unknown }
      const parsed = publicInstanceConfigSchema.parse(body.instance)
      cached = parsed
      return parsed
    })
    .finally(() => {
      inflight = null
    })

  return inflight
}

export function clearInstanceConfigCacheForTests(): void {
  cached = null
  inflight = null
}
