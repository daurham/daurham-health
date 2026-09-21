import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let loaded = false

async function readEnvFile(filePath: string): Promise<void> {
  try {
    const text = await readFile(filePath, 'utf8')
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (line.length === 0 || line.startsWith('#')) {
        continue
      }
      const separator = line.indexOf('=')
      if (separator <= 0) {
        continue
      }
      const key = line.slice(0, separator).trim()
      if (process.env[key] !== undefined) {
        continue
      }
      let value = line.slice(separator + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
    if (code !== 'ENOENT') {
      throw error
    }
  }
}

export async function loadLocalEnv(): Promise<void> {
  if (loaded) {
    return
  }
  await readEnvFile(path.join(rootDir, '.env'))
  await readEnvFile(path.join(rootDir, '.env.local'))
  loaded = true
}
