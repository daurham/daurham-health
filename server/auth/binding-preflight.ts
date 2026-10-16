import { pathToFileURL } from 'node:url'
import { loadLocalEnv } from '../env.js'
import { assessAuthBinding } from './binding.js'

/**
 * Read-only: checks only the effective Auth URL of THIS process, never accesses
 * accounts, sessions, personal health data, databases or the Auth provider.
 */
export async function runAuthBindingPreflight(): Promise<void> {
  await loadLocalEnv()
  const result = assessAuthBinding(process.env)
  console.log('PIQ auth binding preflight — ' + result.status.toUpperCase() +
    ' (' + result.reason + ')')
  if (result.status !== 'verified') process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runAuthBindingPreflight().catch(() => {
    console.error('PIQ auth binding preflight — BLOCKED (UNEXPECTED_ERROR)')
    process.exitCode = 2
  })
}
