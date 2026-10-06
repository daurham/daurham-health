import { pathToFileURL } from 'node:url'
import { assertIanaTimeZone, DEFAULT_HEALTH_CALENDAR_TIME_ZONE } from '../src/domain/time.js'
import { loadLocalEnv } from './env.js'
import { optionalBoolean, resolveInstanceConfig } from './instance-config.js'

export type ConfigDiagnostic = {
  level: 'ok' | 'warning' | 'error'
  key: string
  message: string
}

function present(env: NodeJS.ProcessEnv, key: string): boolean {
  return Boolean(env[key]?.trim())
}

export function inspectInstanceConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): ConfigDiagnostic[] {
  const diagnostics: ConfigDiagnostic[] = []

  const required = [
    ['DATABASE_URL', 'Database connection'],
    ['NEON_AUTH_BASE_URL', 'Neon Auth base URL'],
    ['NEON_AUTH_COOKIE_SECRET', 'Neon Auth cookie secret'],
  ] as const

  for (const [key, label] of required) {
    diagnostics.push(
      present(env, key)
        ? { level: 'ok', key, message: `${label} configured` }
        : { level: 'error', key, message: `${label} is required` },
    )
  }

  const cookie = env.NEON_AUTH_COOKIE_SECRET?.trim() ?? ''
  if (cookie && cookie.length < 32) {
    diagnostics.push({
      level: 'error',
      key: 'NEON_AUTH_COOKIE_SECRET',
      message: 'Neon Auth cookie secret must be at least 32 characters',
    })
  }

  const ownerConfigured =
    present(env, 'HEALTH_OWNER_USER_ID') || present(env, 'HEALTH_OWNER_EMAIL')
  diagnostics.push(
    ownerConfigured
      ? { level: 'ok', key: 'HEALTH_OWNER', message: 'Owner identity configured' }
      : {
          level: 'error',
          key: 'HEALTH_OWNER',
          message: 'Set HEALTH_OWNER_USER_ID or HEALTH_OWNER_EMAIL',
        },
  )

  try {
    assertIanaTimeZone(
      env.HEALTH_CALENDAR_TIMEZONE?.trim() || DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
    )
    diagnostics.push({
      level: 'ok',
      key: 'HEALTH_CALENDAR_TIMEZONE',
      message: 'Health calendar timezone is valid',
    })
  } catch {
    diagnostics.push({
      level: 'error',
      key: 'HEALTH_CALENDAR_TIMEZONE',
      message: 'Health calendar timezone is not a valid IANA timezone',
    })
  }

  const homeAiBase = present(env, 'HOME_AI_BASE_URL')
  const homeAiKey = present(env, 'HOME_AI_API_KEY')
  if (homeAiBase !== homeAiKey) {
    diagnostics.push({
      level: 'error',
      key: 'HOME_AI',
      message: 'HOME_AI_BASE_URL and HOME_AI_API_KEY must be configured together',
    })
  } else {
    diagnostics.push({
      level: homeAiBase ? 'ok' : 'warning',
      key: 'HOME_AI',
      message: homeAiBase ? 'Home-AI configured' : 'Home-AI not configured (optional)',
    })
  }

  let photoRequested = true
  try {
    photoRequested = optionalBoolean(env.HEALTH_FEATURE_TRAINING_PHOTO_IMPORT, true)
  } catch {
    diagnostics.push({
      level: 'error',
      key: 'HEALTH_FEATURE_TRAINING_PHOTO_IMPORT',
      message: 'Training photo feature flag must be true/false',
    })
  }
  if (photoRequested && !(homeAiBase && homeAiKey)) {
    diagnostics.push({
      level: 'warning',
      key: 'HEALTH_FEATURE_TRAINING_PHOTO_IMPORT',
      message: 'Training photo import resolves disabled because Home-AI is not configured',
    })
  }

  for (const [key, label] of [
    ['GEMINI_API_KEY', 'Gemini'],
    ['USDA_FDC_API_KEY', 'USDA FoodData Central'],
    ['APPLE_HEALTH_SYNC_TOKEN', 'Apple Health sync'],
    ['BODY_CAPTURE_TOKEN', 'Body Shortcut capture'],
  ] as const) {
    diagnostics.push({
      level: present(env, key) ? 'ok' : 'warning',
      key,
      message: present(env, key) ? `${label} configured` : `${label} not configured (optional)`,
    })
  }

  try {
    resolveInstanceConfig(env)
  } catch (error) {
    diagnostics.push({
      level: 'error',
      key: 'INSTANCE_CONFIG',
      message: error instanceof Error ? error.message : 'Instance configuration is invalid',
    })
  }

  return diagnostics
}

async function main(): Promise<void> {
  await loadLocalEnv()
  const diagnostics = inspectInstanceConfiguration(process.env)
  for (const item of diagnostics) {
    const mark = item.level === 'ok' ? '✓' : item.level === 'warning' ? '!' : '✗'
    console.log(`${mark} [${item.key}] ${item.message}`)
  }
  if (diagnostics.some((item) => item.level === 'error')) {
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
