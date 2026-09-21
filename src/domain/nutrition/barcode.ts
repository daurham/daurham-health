import { NUTRITION_CONFIG } from './config.js'

/**
 * Barcode normalization for packaged-food lookup.
 *
 * Barcodes are strings, never numbers — leading zeroes are significant.
 *
 * Rule (aligned with Open Food Facts / GTIN practice):
 * 1. Trim whitespace.
 * 2. Keep the raw scanned value unchanged.
 * 3. Digits-only form is used for lookup keys.
 * 4. UPC-A (12 digits) is padded with a leading 0 to EAN-13.
 * 5. UPC-E (8 digits, number system 0 or 1) is expanded to UPC-A then EAN-13
 *    when the check digit matches. Other 8-digit codes stay EAN-8.
 * 6. EAN-13 (13) and GTIN-14 (14) are kept as-is.
 *
 * Local Health lookup matches any of: raw digits, normalized EAN/GTIN,
 * and the 12-digit UPC-A form of a 0-padded EAN-13. That way
 * `034000470693` and `0034000470693` resolve to the same product.
 */
export const RETAIL_BARCODE_LENGTHS = [8, 12, 13, 14] as const

export type NormalizedBarcode = {
  raw: string
  digits: string
  normalized: string
  lookupKeys: string[]
}

export function barcodeDigits(value: string): string {
  return value.replace(/\D/g, '')
}

export function isRetailBarcodeDigits(digits: string): boolean {
  return (RETAIL_BARCODE_LENGTHS as readonly number[]).includes(digits.length)
}

export function normalizeBarcode(raw: string): NormalizedBarcode | null {
  if (typeof raw !== 'string') {
    return null
  }
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.length > NUTRITION_CONFIG.barcodeMax) {
    return null
  }
  const digits = barcodeDigits(trimmed)
  if (!isRetailBarcodeDigits(digits)) {
    return null
  }
  const normalized = canonicalRetailBarcode(digits)
  const keys = new Set<string>([trimmed, digits, normalized])
  if (normalized.length === 13 && normalized.startsWith('0')) {
    keys.add(normalized.slice(1))
  }
  if (digits.length === 12) {
    keys.add(`0${digits}`)
  }
  return {
    raw: trimmed,
    digits,
    normalized,
    lookupKeys: [...keys],
  }
}

export function canonicalRetailBarcode(digits: string): string {
  if (digits.length === 12) {
    return `0${digits}`
  }
  if (digits.length === 8) {
    const expanded = expandUpcEToUpcA(digits)
    if (expanded) {
      return `0${expanded}`
    }
  }
  return digits
}

/**
 * Expand 8-digit UPC-E (number system + 6-digit payload + check) to UPC-A.
 * Returns null when the code is not a valid number-system 0/1 UPC-E
 * (those 8-digit values are treated as EAN-8).
 */
export function expandUpcEToUpcA(upcE: string): string | null {
  if (!/^[01]\d{7}$/.test(upcE)) {
    return null
  }
  const ns = upcE[0]!
  const d1 = upcE[1]!
  const d2 = upcE[2]!
  const d3 = upcE[3]!
  const d4 = upcE[4]!
  const d5 = upcE[5]!
  const d6 = upcE[6]!
  const check = upcE[7]!
  let manufacturer: string
  let product: string
  switch (d6) {
    case '0':
    case '1':
    case '2':
      manufacturer = `${d1}${d2}${d6}`
      product = `000${d3}${d4}${d5}`
      break
    case '3':
      manufacturer = `${d1}${d2}${d3}`
      product = `0000${d4}${d5}`
      break
    case '4':
      manufacturer = `${d1}${d2}${d3}${d4}`
      product = `00000${d5}`
      break
    default:
      manufacturer = `${d1}${d2}${d3}${d4}${d5}`
      product = `0000${d6}`
      break
  }
  const withoutCheck = `${ns}${manufacturer}${product}`
  if (upcACheckDigit(withoutCheck) !== check) {
    return null
  }
  return `${withoutCheck}${check}`
}

export function upcACheckDigit(elevenOrTwelveWithoutCheck: string): string {
  const digits = elevenOrTwelveWithoutCheck.replace(/\D/g, '').slice(0, 11)
  let sum = 0
  for (let i = 0; i < 11; i += 1) {
    const n = Number(digits[i])
    sum += i % 2 === 0 ? n * 3 : n
  }
  const mod = sum % 10
  return String(mod === 0 ? 0 : 10 - mod)
}

export function barcodesEquivalent(left: string, right: string): boolean {
  const a = normalizeBarcode(left)
  const b = normalizeBarcode(right)
  if (!a || !b) {
    return false
  }
  return a.normalized === b.normalized
}

export function shouldIgnoreDuplicateScan(previous: string | null, next: string, lookupInFlight: boolean): boolean {
  return lookupInFlight || previous === next
}
