import { z } from 'zod'

export const instanceCapabilitiesSchema = z.object({
  geminiNutrition: z.boolean(),
  askHealthAi: z.boolean(),
  usdaLookup: z.boolean(),
  homeAi: z.boolean(),
  trainingPhotoImport: z.boolean(),
  appleHealthSync: z.boolean(),
  bodyCapture: z.boolean(),
  publicDemo: z.boolean(),
})

export type InstanceCapabilities = z.infer<typeof instanceCapabilitiesSchema>

export const publicInstanceConfigSchema = z.object({
  appName: z.string().trim().min(1).max(80),
  externalHomeUrl: z.string().url().nullable(),
  calendarTimeZone: z.string().trim().min(1).max(64),
  capabilities: instanceCapabilitiesSchema,
})

export type PublicInstanceConfig = z.infer<typeof publicInstanceConfigSchema>
