function compact(value: string | null | undefined): string {
  return (value ?? '').trim()
}

export function appleHealthFingerprint(parts: {
  appleType: string
  startAt: string
  endAt: string
  value: string
  unit: string
  sourceName: string
  sourceVersion: string | null
  deviceName: string | null
}): string {
  return [
    'apple_health',
    parts.appleType,
    parts.startAt,
    parts.endAt,
    parts.value,
    parts.unit,
    compact(parts.sourceName),
    compact(parts.sourceVersion),
    compact(parts.deviceName),
  ].join('|')
}
