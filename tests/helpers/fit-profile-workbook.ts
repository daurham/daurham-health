import * as XLSX from 'xlsx'
import { FIT_PROFILE_REQUIRED_HEADERS } from '../../src/domain/body-metrics.ts'

export function sanitizedFitProfileRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const header of FIT_PROFILE_REQUIRED_HEADERS) {
    row[header] = '1'
  }
  return {
    ...row,
    'Measure Time': '01/15/2026 08:00:00',
    'Weight(lb)': '180',
    'Body Fat(%)': '25.0',
    BMI: '24.5',
    'Skeletal Muscle(%)': '40.0',
    'Muscle Mass(lb)': '110',
    'Protein(%)': '16.0',
    'BMR(kcal)': '1600',
    'Fat-free Body Weight(lb)': '135',
    'Subcutaneous Fat Percentage(%)': '20.0',
    'Visceral Fat': '8',
    'Body Water(%)': '55.0',
    'Bone Mass(lb)': '7.5',
    'Metabolic Age': '30',
    'Subcutaneous Fat(lb)': '30',
    'Skeleton Muscle Mass(lb)': '70',
    'Obesity Level': 'Standard',
    'Waist-Hip Ratio': '0.85',
    'Obesity(%)': '10',
    SMI: '8.0',
    'Muscle Mass Percentage(%)': '60.0',
    'Bone Mass Percentage(%)': '4.0',
    'Body Water Mass(lb)': '90',
    'Protein Mass(lb)': '25',
    'Body Fat Mass(lb)': '45',
    'Muscle Control(lb)': '2',
    'Fat Control(lb)': '-3',
    'Weight Control(lb)': '-1',
    'Target Weight(lb)': '170',
    'Body Type': 'Balanced',
    'Health Score': '80',
    'Sinew trunk ratio(%)': '30.0',
    'Trunk body fat mass(lb)': '20',
    'Left arm muscle ratio(%)': '12.0',
    'Right Arm Muscle Rate(%)': '12.0',
    'left arm body fat mass(lb)': '3',
    'Body fat mass in right arm(lb)': '3',
    'Left leg muscle ratio(%)': '18.0',
    'Right lower limb muscle ratio(%)': '18.0',
    'Left leg body fat mass(lb)': '6',
    'body fat mass in right leg(lb)': '6',
    'Sinew trunk mass(lb)': '40',
    'Trunk fat ratio(%)': '22.0',
    'Left arm muscle mass(lb)': '8',
    'Right arm muscle mass(lb)': '8',
    'Fat ratio of left upper limb(%)': '15.0',
    'Body fat rate of right upper limb(%)': '15.0',
    'left leg muscle mass(lb)': '15',
    'Right leg muscle mass(lb)': '15',
    'Body fat rate of left lower limb(%)': '16.0',
    'Body fat rate of right lower limb(%)': '16.0',
    'Device MAC Address': 'AA:BB:CC:DD:EE:FF',
    'Device Name': 'TEST-SCALE',
    ...overrides,
  }
}

export function fitProfileWorkbookBytes(
  rows: Array<Record<string, unknown>>,
  headers: readonly string[] = FIT_PROFILE_REQUIRED_HEADERS,
): Uint8Array {
  const aoa = [
    [...headers],
    ...rows.map((row) => headers.map((header) => row[header] ?? '')),
  ]
  const sheet = XLSX.utils.aoa_to_sheet(aoa)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new Uint8Array(buffer)
}
