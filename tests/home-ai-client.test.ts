import { describe, expect, it, vi } from 'vitest'
import { HttpError } from '../server/http.ts'
import { createHomeAiClient } from '../server/integrations/home-ai/client.ts'
import { getHomeAiConfig } from '../server/integrations/home-ai/config.ts'
import { readWorkoutPhotoForm } from '../server/training/transcription.ts'
import type { ApiRequest } from '../server/http.ts'

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9])

function client(fetchImpl: typeof fetch) {
  return createHomeAiClient({
    config: { baseUrl: 'https://ai.example.invalid', apiKey: 'secret-home-ai-key' },
    fetch: fetchImpl,
  })
}

describe('home-ai config', () => {
  it('reads server-only env and does not accept empty values', async () => {
    await expect(getHomeAiConfig({} as NodeJS.ProcessEnv)).rejects.toBeInstanceOf(HttpError)
    const config = await getHomeAiConfig({
      HOME_AI_BASE_URL: 'https://ai.daurham.com/',
      HOME_AI_API_KEY: 'secret-home-ai-key',
    } as NodeJS.ProcessEnv)
    expect(config.baseUrl).toBe('https://ai.daurham.com')
    expect(config.apiKey).toBe('secret-home-ai-key')
  })
})

describe('home-ai client', () => {
  it('POSTs the image with x-api-key and parses 202', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://ai.example.invalid/api/workouts/v1.3/jobs')
      expect(init?.method).toBe('POST')
      const headers = new Headers(init?.headers)
      expect(headers.get('x-api-key')).toBe('secret-home-ai-key')
      expect(init?.body).toBeInstanceOf(FormData)
      const image = (init?.body as FormData).get('image')
      expect(image).toBeTruthy()
      return new Response(JSON.stringify({ ok: true, job: { id: JOB_ID, status: 'queued' } }), {
        status: 202,
      })
    }) as unknown as typeof fetch

    const created = await client(fetchImpl).createWorkoutTranscriptionJob({
      bytes: JPEG,
      filename: 'sheet.jpg',
      mimeType: 'image/jpeg',
    })
    expect(created).toEqual({ id: JOB_ID, status: 'queued' })
  })

  it('parses queued, processing, completed, and failed jobs', async () => {
    const payloads = [
      { job: { id: JOB_ID, status: 'queued' } },
      { job: { id: JOB_ID, status: 'processing' } },
      {
        job: {
          id: JOB_ID,
          status: 'completed',
          elapsed_ms: 284652,
          candidate: {
            schema_version: '1.3',
            transcription_status: 'VALID',
            workout: { date: '2026-09-20', routine: 'B', template_version: 'B-1.3.1', exercises: [] },
          },
          review: { status: 'AUTO_ACCEPT', save_ready: true, review_status: 'AUTO_ACCEPT', issues: [] },
        },
      },
      {
        job: {
          id: JOB_ID,
          status: 'failed',
          error: { code: 'REGISTRATION_FAILED', message: 'internal' },
        },
      },
    ]
    for (const payload of payloads) {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, ...payload }), { status: 200 })) as unknown as typeof fetch
      const job = await client(fetchImpl).getWorkoutTranscriptionJob(JOB_ID)
      expect(job.status).toBe(payload.job.status)
      if (job.status === 'failed') {
        expect(job.error?.code).toBe('REGISTRATION_FAILED')
        expect(job.error?.message).toContain('corner markers')
        expect(JSON.stringify(job)).not.toContain('internal')
      }
    }
  })

  it('rejects a malformed home-ai body without leaking the key', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ weird: true }), { status: 200 })) as unknown as typeof fetch
    await expect(client(fetchImpl).getWorkoutTranscriptionJob(JOB_ID)).rejects.toMatchObject({
      statusCode: 502,
    })
  })

  it('does not put the API key on invalid job ids', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    await expect(client(fetchImpl).getWorkoutTranscriptionJob('../job.json')).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('workout photo upload', () => {
  it('rejects missing, unsupported, and oversized images', async () => {
    await expect(
      readWorkoutPhotoForm({
        headers: { 'content-type': 'multipart/form-data; boundary=--x' },
        async *[Symbol.asyncIterator]() {
          yield Buffer.from('----x--\r\n')
        },
      } as ApiRequest),
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})
