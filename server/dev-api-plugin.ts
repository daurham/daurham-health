import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'
import { wrapNodeResponse } from './http.js'

function safeApiFile(root: string, relative: string): string | null {
  const filePath = path.resolve(root, relative)
  const relativeToRoot = path.relative(root, filePath)
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    return null
  }
  if (!relativeToRoot.startsWith(`api${path.sep}`) && relativeToRoot !== 'api') {
    return null
  }
  return fs.existsSync(filePath) ? filePath : null
}

function apiFileFromUrl(root: string, url: string): string | null {
  const pathname = url.split('?')[0] ?? ''
  if (!pathname.startsWith('/api/')) {
    return null
  }
  const exact = safeApiFile(root, `${pathname.slice(1)}.ts`)
  if (exact) {
    return exact
  }
  const parts = pathname.slice(1).split('/').filter((part) => part.length > 0)
  if (parts.length < 2) {
    return null
  }
  const dynamicRelative = `${[...parts.slice(0, -1), '[id]'].join('/')}.ts`
  return safeApiFile(root, dynamicRelative)
}

export function healthApiDevPlugin(): Plugin {
  return {
    name: 'health-api-dev',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const filePath = apiFileFromUrl(server.config.root, req.url ?? '')
        if (!filePath) {
          next()
          return
        }
        const apiRes = wrapNodeResponse(res)
        try {
          const module = (await server.ssrLoadModule(filePath)) as {
            default?: (request: IncomingMessage, response: ReturnType<typeof wrapNodeResponse>) => unknown
          }
          if (typeof module.default !== 'function') {
            apiRes.status(500).json({ error: 'API handler is missing' })
            return
          }
          await module.default(req, apiRes)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          const looksSensitive =
            message.includes('postgres://') ||
            message.includes('postgresql://') ||
            message.includes('DATABASE_URL')
          console.error(looksSensitive ? 'API handler failed' : message)
          if (!res.headersSent) {
            apiRes.status(500).json({ error: 'Unexpected server error' })
          }
        }
      })
    },
  }
}
