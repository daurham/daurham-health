import { healthCalendarDateFromNow } from '../../src/domain/time.js'
import { createOwnerExport, openBackupSql } from '../backup/database.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

export default withOwnerAuth(async function backupExportHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const exported = await createOwnerExport(await openBackupSql())
    const day = healthCalendarDateFromNow()
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="health-${exported.profile}-${day}.health-backup.zip"`)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Health-Backup-Profile', exported.profile)
    res.end(Buffer.from(exported.bytes))
  } catch (error) {
    handleApiError(res, error)
  }
})
