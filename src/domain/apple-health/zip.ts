import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate'
import { decodeAppleHealthXmlBytes, parseAppleHealthXml, type AppleHealthParseResult } from './parse.js'

const MAX_BROWSER_XML_BYTES = 40 * 1024 * 1024

function findExportXml(files: Record<string, Uint8Array>): Uint8Array {
  const names = Object.keys(files)
  const match =
    names.find((name) => name.replace(/\\/g, '/').toLowerCase().endsWith('/export.xml')) ??
    names.find((name) => name.replace(/\\/g, '/').toLowerCase() === 'export.xml')
  if (!match) {
    throw new Error('Apple Health ZIP must contain export.xml')
  }
  const bytes = files[match]
  if (!bytes) {
    throw new Error('Apple Health ZIP must contain export.xml')
  }
  return bytes
}

export function parseAppleHealthZip(bytes: Uint8Array): AppleHealthParseResult {
  const files = unzipSync(bytes)
  const xmlBytes = findExportXml(files)
  if (xmlBytes.byteLength > MAX_BROWSER_XML_BYTES) {
    throw new Error(
      `export.xml is ${(xmlBytes.byteLength / (1024 * 1024)).toFixed(0)} MB. Use the local Apple Health CLI for files this large.`,
    )
  }
  return parseAppleHealthXml(decodeAppleHealthXmlBytes(xmlBytes))
}

export function parseAppleHealthFile(bytes: Uint8Array, filename: string): AppleHealthParseResult {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.zip')) {
    return parseAppleHealthZip(bytes)
  }
  if (lower.endsWith('.xml')) {
    if (bytes.byteLength > MAX_BROWSER_XML_BYTES) {
      throw new Error('export.xml is too large for browser import. Use the local Apple Health CLI.')
    }
    return parseAppleHealthXml(decodeAppleHealthXmlBytes(bytes))
  }
  throw new Error('Choose an Apple Health export.zip or export.xml file')
}

export function zipAppleHealthXml(xml: string, nested = true): Uint8Array {
  const path = nested ? 'apple_health_export/export.xml' : 'export.xml'
  return zipSync({ [path]: strToU8(xml) })
}

export function xmlFromZip(bytes: Uint8Array): string {
  const files = unzipSync(bytes)
  return strFromU8(findExportXml(files))
}
