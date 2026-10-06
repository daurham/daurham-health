import { publicInstanceConfigSchema, type PublicInstanceConfig } from '../src/domain/instance-config.js'
import { assertIanaTimeZone, DEFAULT_HEALTH_CALENDAR_TIME_ZONE } from '../src/domain/time.js'
import { loadLocalEnv } from './env.js'

export type InstanceConfig = PublicInstanceConfig & {
  providerState: {
    geminiConfigured: boolean
    usdaConfigured: boolean
    homeAiConfigured: boolean
    appleHealthSyncConfigured: boolean
    bodyCaptureConfigured: boolean
  }
}

function value(env: NodeJS.ProcessEnv, key: string): string | null {
  const next = env[key]?.trim()
  return next ? next : null
}

export function optionalBoolean(value: string | undefined, defaultValue: boolean): boolean {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return defaultValue
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  throw new Error(`Invalid boolean configuration value: ${value}`)
}

function optionalHttpUrl(raw: string | null, key: string): string | null {
  if (!raw) return null
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(`${key} must be an absolute HTTP(S) URL`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${key} must be an absolute HTTP(S) URL`)
  }
  return parsed.toString().replace(/\/$/, '')
}

export function resolveInstanceConfig(env: NodeJS.ProcessEnv = process.env): InstanceConfig {
  const appName = value(env, 'HEALTH_APP_NAME') ?? 'Health'
  const externalHomeUrl = optionalHttpUrl(value(env, 'HEALTH_EXTERNAL_HOME_URL'), 'HEALTH_EXTERNAL_HOME_URL')
  const calendarTimeZone = assertIanaTimeZone(
    value(env, 'HEALTH_CALENDAR_TIMEZONE') ?? DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
  )

  const geminiConfigured = value(env, 'GEMINI_API_KEY') != null
  const usdaConfigured = value(env, 'USDA_FDC_API_KEY') != null
  const homeAiConfigured =
    value(env, 'HOME_AI_BASE_URL') != null &&
    value(env, 'HOME_AI_API_KEY') != null
  const appleHealthSyncConfigured = value(env, 'APPLE_HEALTH_SYNC_TOKEN') != null
  const bodyCaptureConfigured = value(env, 'BODY_CAPTURE_TOKEN') != null

  const publicDemo = optionalBoolean(env.HEALTH_PUBLIC_DEMO_ENABLED, true)
  const trainingPhotoRequested = optionalBoolean(
    env.HEALTH_FEATURE_TRAINING_PHOTO_IMPORT,
    true,
  )
  const trainingPhotoImport = trainingPhotoRequested && homeAiConfigured

  const publicConfig = publicInstanceConfigSchema.parse({
    appName,
    externalHomeUrl,
    calendarTimeZone,
    capabilities: {
      geminiNutrition: geminiConfigured,
      askHealthAi: geminiConfigured,
      usdaLookup: usdaConfigured,
      homeAi: homeAiConfigured,
      trainingPhotoImport,
      appleHealthSync: appleHealthSyncConfigured,
      bodyCapture: bodyCaptureConfigured,
      publicDemo,
    },
  })

  return {
    ...publicConfig,
    providerState: {
      geminiConfigured,
      usdaConfigured,
      homeAiConfigured,
      appleHealthSyncConfigured,
      bodyCaptureConfigured,
    },
  }
}

export function publicInstanceConfig(config: InstanceConfig): PublicInstanceConfig {
  return publicInstanceConfigSchema.parse({
    appName: config.appName,
    externalHomeUrl: config.externalHomeUrl,
    calendarTimeZone: config.calendarTimeZone,
    capabilities: config.capabilities,
  })
}

export async function getInstanceConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<InstanceConfig> {
  await loadLocalEnv()
  return resolveInstanceConfig(env)
}

export async function getPublicInstanceConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<PublicInstanceConfig> {
  return publicInstanceConfig(await getInstanceConfig(env))
}
