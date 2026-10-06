import { draftRecipeAssist } from '../nutrition/recipe-assist.js'
import { archiveRecipe, commitRecipeVersion, createRecipe, getRecipe, getRecipeVersion, listRecipes, previewRecipeEdit, restoreRecipe } from '../nutrition/recipes.js'
import { logRecipeConsumption } from '../nutrition/recipe-consumption.js'
import { listLegacyRecipes, promoteLegacyRecipe } from '../nutrition/legacy-recipes.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, HttpError, readJsonBody, requestApiPathname, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const ITEM = new RegExp(`^/api/nutrition/recipes/(${UUID})(?:/(archive|restore))?$`, 'i')
const VERSIONS = new RegExp(`^/api/nutrition/recipes/(${UUID})/versions(?:/(preview|[1-9]\\d*))?import { draftRecipeAssist } from '../nutrition/recipe-assist.js'
import { archiveRecipe, commitRecipeVersion, createRecipe, getRecipe, getRecipeVersion, listRecipes, previewRecipeEdit, restoreRecipe } from '../nutrition/recipes.js'
import { logRecipeConsumption } from '../nutrition/recipe-consumption.js'
import { listLegacyRecipes, promoteLegacyRecipe } from '../nutrition/legacy-recipes.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, HttpError, readJsonBody, requestApiPathname, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const ITEM = new RegExp(`^/api/nutrition/recipes/(${UUID})(?:/(archive|restore))?$`, 'i')
, 'i')
const LEGACY_PROMOTE = new RegExp(`^/api/nutrition/recipes/legacy/(${UUID})/promoteimport { draftRecipeAssist } from '../nutrition/recipe-assist.js'
import { archiveRecipe, commitRecipeVersion, createRecipe, getRecipe, getRecipeVersion, listRecipes, previewRecipeEdit, restoreRecipe } from '../nutrition/recipes.js'
import { logRecipeConsumption } from '../nutrition/recipe-consumption.js'
import { listLegacyRecipes, promoteLegacyRecipe } from '../nutrition/legacy-recipes.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, HttpError, readJsonBody, requestApiPathname, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const ITEM = new RegExp(`^/api/nutrition/recipes/(${UUID})(?:/(archive|restore))?$`, 'i')
, 'i')

export function matchRecipeRoute(pathname: string):
  | { kind: 'list' }
  | { kind: 'legacy-list' }
  | { kind: 'legacy-promote'; id: string }
  | { kind: 'item'; id: string; action: 'archive' | 'restore' | null }
  | { kind: 'versions'; id: string; action: 'preview' | 'commit' | number }
  | null {
  if (pathname === '/api/nutrition/recipes') return { kind: 'list' }
  if (pathname === '/api/nutrition/recipes/legacy') return { kind: 'legacy-list' }
  const legacyPromote = LEGACY_PROMOTE.exec(pathname)
  if (legacyPromote?.[1]) return { kind: 'legacy-promote', id: legacyPromote[1] }
  const versions = VERSIONS.exec(pathname)
  if (versions?.[1]) {
    if (versions[2] === 'preview') return { kind: 'versions', id: versions[1], action: 'preview' }
    if (versions[2]) return { kind: 'versions', id: versions[1], action: Number(versions[2]) }
    return { kind: 'versions', id: versions[1], action: 'commit' }
  }
  const match = ITEM.exec(pathname)
  if (!match?.[1]) return null
  const action = match[2]
  return { kind: 'item', id: match[1], action: action === 'archive' || action === 'restore' ? action : null }
}

export async function handleNutritionRecipes(req: ApiRequest, res: ApiResponse): Promise<void> {
  const pathname = requestApiPathname(req)
  if (pathname === '/api/nutrition/recipes/assist') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 200, await draftRecipeAssist(await readJsonBody(req)))
    return
  }
  if (pathname === '/api/nutrition/recipe-entries') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 201, await logRecipeConsumption(await readJsonBody(req)))
    return
  }
  const route = matchRecipeRoute(pathname)
  if (!route) throw new HttpError(404, 'Not found')
  if (route.kind === 'legacy-list') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 200, await listLegacyRecipes())
    return
  }
  if (route.kind === 'legacy-promote') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 201, await promoteLegacyRecipe(route.id))
    return
  }
  if (route.kind === 'versions') {
    if (route.action === 'preview') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST')
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      sendJson(res, 200, await previewRecipeEdit(route.id, await readJsonBody(req)))
      return
    }
    if (route.action === 'commit') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST')
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      sendJson(res, 201, await commitRecipeVersion(route.id, await readJsonBody(req)))
      return
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 200, await getRecipeVersion(route.id, route.action))
    return
  }
  if (route.kind === 'list') {
    if (req.method === 'GET') {
      sendJson(res, 200, await listRecipes())
      return
    }
    if (req.method === 'POST') {
      sendJson(res, 201, await createRecipe(await readJsonBody(req)))
      return
    }
    res.setHeader('Allow', 'GET, POST')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  if (route.action === 'archive' || route.action === 'restore') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 200, route.action === 'archive' ? await archiveRecipe(route.id) : await restoreRecipe(route.id))
    return
  }
  if (req.method === 'GET') {
    sendJson(res, 200, await getRecipe(route.id))
    return
  }
  res.setHeader('Allow', 'GET')
  sendJson(res, 405, { error: 'Method not allowed' })
}

const nutritionRecipesHandler = withOwnerAuth(async function nutritionRecipesHandler(req: ApiRequest, res: ApiResponse) {
  try {
    await handleNutritionRecipes(req, res)
  } catch (error) {
    handleApiError(res, error)
  }
})

export default async function nutritionRecipesRoute(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (requestApiPathname(req) === '/api/nutrition/recipes/assist' && req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  await nutritionRecipesHandler(req, res)
}
