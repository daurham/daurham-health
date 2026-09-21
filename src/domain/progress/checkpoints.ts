import { z } from 'zod'
import { isCalendarDate } from '../training.js'
import { PROGRESS_ANALYTICS_CONFIG } from './config.js'

export type ProgressCheckpoint = {
  id: string
  checkpointDate: string
  label: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

const LABEL_MAX = PROGRESS_ANALYTICS_CONFIG.checkpoint.labelMaxLength
const NOTES_MAX = PROGRESS_ANALYTICS_CONFIG.checkpoint.notesMaxLength

function trimmedText(max: number, emptyMessage: string) {
  return z.string().transform((value, ctx) => {
    const trimmed = value.trim()
    if (trimmed.length === 0) {
      ctx.addIssue({ code: 'custom', message: emptyMessage })
      return z.NEVER
    }
    if (trimmed.length > max) {
      ctx.addIssue({ code: 'custom', message: `Must be ${max} characters or fewer` })
      return z.NEVER
    }
    return trimmed
  })
}

const checkpointDateSchema = z.string().refine(isCalendarDate, 'Date must be YYYY-MM-DD')

export const checkpointCreateSchema = z.object({
  checkpointDate: checkpointDateSchema,
  label: trimmedText(LABEL_MAX, 'Label is required'),
  notes: z
    .union([z.string(), z.null(), z.undefined()])
    .optional()
    .transform((value, ctx) => {
      if (value == null) {
        return null
      }
      const trimmed = value.trim()
      if (trimmed.length === 0) {
        return null
      }
      if (trimmed.length > NOTES_MAX) {
        ctx.addIssue({ code: 'custom', message: `Notes must be ${NOTES_MAX} characters or fewer` })
        return z.NEVER
      }
      return trimmed
    }),
})

export const checkpointPatchSchema = z
  .object({
    checkpointDate: checkpointDateSchema.optional(),
    label: trimmedText(LABEL_MAX, 'Label is required').optional(),
    notes: z
      .union([z.string(), z.null()])
      .transform((value, ctx) => {
        if (value == null) {
          return null
        }
        const trimmed = value.trim()
        if (trimmed.length === 0) {
          return null
        }
        if (trimmed.length > NOTES_MAX) {
          ctx.addIssue({ code: 'custom', message: `Notes must be ${NOTES_MAX} characters or fewer` })
          return z.NEVER
        }
        return trimmed
      })
      .optional(),
  })
  .refine((value) => value.checkpointDate != null || value.label != null || value.notes !== undefined, {
    message: 'No checkpoint fields to update',
  })

export type CheckpointCreateInput = z.infer<typeof checkpointCreateSchema>
export type CheckpointPatchInput = z.infer<typeof checkpointPatchSchema>
