function compact(value: string | null | undefined): string {
  return (value ?? '').trim()
}

/** Apple export device strings include a process-local hex pointer that changes between exports. */
export function stableDeviceKey(device: string | null | undefined): string | null {
  const value = compact(device)
  if (value.length === 0) {
    return null
  }
  return value.replace(/0x[0-9a-fA-F]+/g, '0x')
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
    stableDeviceKey(parts.deviceName) ?? '',
  ].join('|')
}
