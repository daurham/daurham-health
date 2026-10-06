import { describe, expect, it } from 'vitest'
import {
  publicInstanceConfig,
  resolveInstanceConfig,
} from '../server/instance-config.ts'
import { inspectInstanceConfiguration } from '../server/config-check.ts'

function configuredEnv(): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: 'postgresql://db-user:super-secret@db.example.test/health',
    NEON_AUTH_BASE_URL: 'https://auth.example.test',
    NEON_AUTH_COOKIE_SECRET: '12345678901234567890123456789012',
    HEALTH_OWNER_EMAIL: 'owner@example.test',
    HEALTH_APP_NAME: 'Family Health',
    HEALTH_EXTERNAL_HOME_URL: 'https://example.test',
    HEALTH_CALENDAR_TIMEZONE: 'America/New_York',
    GEMINI_API_KEY: 'gemini-secret',
    USDA_FDC_API_KEY: 'usda-secret',
    HOME_AI_BASE_URL: 'https://ai.example.test',
    HOME_AI_API_KEY: 'home-ai-secret',
    APPLE_HEALTH_SYNC_TOKEN: 'apple-secret',
    BODY_CAPTURE_TOKEN: 'body-secret',
  }
}

describe('instance configuration', () => {
  it('resolves safe capabilities without exposing provider secrets', () => {
    const env = configuredEnv()
    const resolved = resolveInstanceConfig(env)
    const safe = publicInstanceConfig(resolved)

    expect(safe).toEqual({
      appName: 'Family Health',
      externalHomeUrl: 'https://example.test',
      calendarTimeZone: 'America/New_York',
      capabilities: {
        geminiNutrition: true,
        askHealthAi: true,
        usdaLookup: true,
        homeAi: true,
        trainingPhotoImport: true,
        appleHealthSync: true,
        bodyCapture: true,
        publicDemo: true,
      },
    })

    const serialized = JSON.stringify(safe)
    expect(serialized).not.toContain('gemini-secret')
    expect(serialized).not.toContain('home-ai-secret')
    expect(serialized).not.toContain('apple-secret')
    expect(serialized).not.toContain('body-secret')
    expect(serialized).not.toContain('super-secret')
  })

  it('lets an instance disable training photo import without disabling Home-AI', () => {
    const env = configuredEnv()
    env.HEALTH_FEATURE_TRAINING_PHOTO_IMPORT = 'false'
    const resolved = resolveInstanceConfig(env)

    expect(resolved.capabilities.homeAi).toBe(true)
    expect(resolved.capabilities.trainingPhotoImport).toBe(false)
  })

  it('keeps training photo import off when Home-AI is incomplete', () => {
    const env = configuredEnv()
    delete env.HOME_AI_API_KEY
    const resolved = resolveInstanceConfig(env)

    expect(resolved.capabilities.homeAi).toBe(false)
    expect(resolved.capabilities.trainingPhotoImport).toBe(false)
  })

  it('reports missing required deployment configuration without printing values', () => {
    const diagnostics = inspectInstanceConfiguration({
      HEALTH_CALENDAR_TIMEZONE: 'America/Phoenix',
      HEALTH_FEATURE_TRAINING_PHOTO_IMPORT: 'false',
    })
    const errors = diagnostics.filter((item) => item.level === 'error')

    expect(errors.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        'DATABASE_URL',
        'NEON_AUTH_BASE_URL',
        'NEON_AUTH_COOKIE_SECRET',
        'HEALTH_OWNER',
      ]),
    )
    expect(JSON.stringify(diagnostics)).not.toContain('postgresql://')
  })

  it('flags invalid timezone and feature-flag configuration', () => {
    const env = configuredEnv()
    env.HEALTH_CALENDAR_TIMEZONE = 'Not/A_Timezone'
    env.HEALTH_FEATURE_TRAINING_PHOTO_IMPORT = 'sometimes'
    const diagnostics = inspectInstanceConfiguration(env)

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'error', key: 'HEALTH_CALENDAR_TIMEZONE' }),
        expect.objectContaining({ level: 'error', key: 'HEALTH_FEATURE_TRAINING_PHOTO_IMPORT' }),
      ]),
    )
  })
})
