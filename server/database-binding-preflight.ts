import { pathToFileURL } from 'node:url'
import { loadLocalEnv } from './env.js'
import { assessDatabaseBinding } from './database-binding.js'

/**
 * Read-only: examines its own process's effective DATABASE_URL only in memory.
 * Never queries SQL, prints an endpoint/credential or changes any resource.
 */
export async function runDatabaseBindingPreflight(): Promise<void> {
  await loadLocalEnv()
  const result = assessDatabaseBinding(process.env)
  console.log('PIQ database binding preflight — ' + result.status.toUpperCase() +
    ' (' + result.reason + ')')
  if (result.status !== 'verified') process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runDatabaseBindingPreflight().catch(() => {
    // Intentionally suppress all error details that might contain secrets.
    console.error('PIQ database binding preflight — BLOCKED (UNEXPECTED_ERROR)')
    process.exitCode = 2
  })
}
