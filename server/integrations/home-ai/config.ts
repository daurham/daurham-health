import { loadLocalEnv } from '../../env.js'
import { HttpError } from '../../http.js'

export type HomeAiConfig = {
  baseUrl: string
  apiKey: string
}

export async function getHomeAiConfig(env: NodeJS.ProcessEnv = process.env): Promise<HomeAiConfig> {
  await loadLocalEnv()
  const baseUrl = env.HOME_AI_BASE_URL?.trim()
  const apiKey = env.HOME_AI_API_KEY?.trim()
  if (!baseUrl || !apiKey) {
    throw new HttpError(503, 'Home AI is not configured')
  }
  if (baseUrl.toLowerCase().includes('vite_')) {
    throw new HttpError(503, 'Home AI is not configured')
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
  }
}
