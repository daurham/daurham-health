/** Fixed clock for the public demo. The real calendar must not age these screens. */
export const DEMO_AS_OF = '2026-09-15'
export const DEMO_DATA_VERSION = '1.0'
export const DEMO_RANGE_START = '2026-01-06'
/** Noon America/Phoenix on DEMO_AS_OF. */
export const DEMO_NOW = new Date('2026-09-15T19:00:00.000Z')

export const DEMO_ROUTES = [
  '/demo',
  '/demo/nutrition',
  '/demo/training',
  '/demo/body',
  '/demo/progress',
  '/demo/progress/strength',
  '/demo/progress/body',
  '/demo/progress/activity',
  '/demo/progress/sleep',
  '/demo/progress/timeline',
  '/demo/progress/compare',
] as const
