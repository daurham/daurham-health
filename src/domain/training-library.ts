import type { MeasurementKind } from './training.js'

export const TRAINING_PAPER_VERSION = '1.3.1'

export type ExerciseSeed = {
  externalId: string
  name: string
  measurementKind: MeasurementKind
  loadType: string
  unilateral: boolean
  equipmentLoad: string
}

export type TemplateSlotSeed = {
  slotId: string
  externalId: string
  position: number
  plannedSets: number
  prescription: {
    measurement: MeasurementKind
    min?: number
    max?: number
    min_sec?: number
    max_sec?: number
  }
}

export type TemplateSeed = {
  routineCode: string
  version: string
  name: string
  paperForm: string
  slots: readonly TemplateSlotSeed[]
}

/** Dumbbell load is one implement; cable is the displayed stack; barbell includes the bar. */
export const TRAINING_EXERCISE_SEEDS: readonly ExerciseSeed[] = [
  {
    externalId: 'EX01',
    name: 'Box Squat',
    measurementKind: 'reps',
    loadType: 'barbell',
    unilateral: false,
    equipmentLoad: 'barbell_total_including_bar',
  },
  {
    externalId: 'EX02',
    name: 'Barbell Bench Press',
    measurementKind: 'reps',
    loadType: 'barbell',
    unilateral: false,
    equipmentLoad: 'barbell_total_including_bar',
  },
  {
    externalId: 'EX03',
    name: 'Cable Row',
    measurementKind: 'reps',
    loadType: 'cable',
    unilateral: false,
    equipmentLoad: 'cable_stack_setting_no_ratio',
  },
  {
    externalId: 'EX04',
    name: 'Dumbbell Romanian Deadlift',
    measurementKind: 'reps',
    loadType: 'dumbbell',
    unilateral: false,
    equipmentLoad: 'one_dumbbell',
  },
  {
    externalId: 'EX05',
    name: 'Dumbbell Curl',
    measurementKind: 'reps',
    loadType: 'dumbbell',
    unilateral: false,
    equipmentLoad: 'one_dumbbell',
  },
  {
    externalId: 'EX06',
    name: 'Cable Triceps Pressdown',
    measurementKind: 'reps',
    loadType: 'cable',
    unilateral: false,
    equipmentLoad: 'cable_stack_setting_no_ratio',
  },
  {
    externalId: 'EX07',
    name: 'Farmer Carry',
    measurementKind: 'duration',
    loadType: 'dumbbell',
    unilateral: false,
    equipmentLoad: 'one_dumbbell',
  },
  {
    externalId: 'EX08',
    name: 'Goblet Squat to Bench',
    measurementKind: 'reps',
    loadType: 'dumbbell_or_kettlebell',
    unilateral: false,
    equipmentLoad: 'one_dumbbell_or_kettlebell',
  },
  {
    externalId: 'EX09',
    name: 'Incline Dumbbell Press',
    measurementKind: 'reps',
    loadType: 'dumbbell',
    unilateral: false,
    equipmentLoad: 'one_dumbbell',
  },
  {
    externalId: 'EX10',
    name: 'Hip Thrust',
    measurementKind: 'reps',
    loadType: 'barbell',
    unilateral: false,
    equipmentLoad: 'barbell_total_including_bar',
  },
  {
    externalId: 'EX11',
    name: 'Reverse Lunge',
    measurementKind: 'reps_per_side',
    loadType: 'dumbbell',
    unilateral: true,
    equipmentLoad: 'one_dumbbell',
  },
  {
    externalId: 'EX12',
    name: 'Hammer Curl',
    measurementKind: 'reps',
    loadType: 'dumbbell',
    unilateral: false,
    equipmentLoad: 'one_dumbbell',
  },
  {
    externalId: 'EX13',
    name: 'Suitcase Carry',
    measurementKind: 'duration_per_side',
    loadType: 'dumbbell',
    unilateral: true,
    equipmentLoad: 'one_dumbbell',
  },
  {
    externalId: 'EX14',
    name: 'Dumbbell Overhead Press',
    measurementKind: 'reps',
    loadType: 'dumbbell',
    unilateral: false,
    equipmentLoad: 'one_dumbbell',
  },
  {
    externalId: 'EX15',
    name: 'Cable Pulldown',
    measurementKind: 'reps',
    loadType: 'cable',
    unilateral: false,
    equipmentLoad: 'cable_stack_setting_no_ratio',
  },
  {
    externalId: 'EX16',
    name: 'One-Arm Dumbbell Row',
    measurementKind: 'reps_per_side',
    loadType: 'dumbbell',
    unilateral: true,
    equipmentLoad: 'one_dumbbell',
  },
  {
    externalId: 'EX17',
    name: 'Dumbbell Lateral Raise',
    measurementKind: 'reps',
    loadType: 'dumbbell',
    unilateral: false,
    equipmentLoad: 'one_dumbbell',
  },
]

function reps(slotId: string, externalId: string, position: number, plannedSets: number, min: number, max: number): TemplateSlotSeed {
  return {
    slotId,
    externalId,
    position,
    plannedSets,
    prescription: { measurement: 'reps', min, max },
  }
}

function duration(slotId: string, externalId: string, position: number, plannedSets: number, minSec: number, maxSec: number): TemplateSlotSeed {
  return {
    slotId,
    externalId,
    position,
    plannedSets,
    prescription: { measurement: 'duration', min_sec: minSec, max_sec: maxSec },
  }
}

function repsPerSide(slotId: string, externalId: string, position: number, plannedSets: number, min: number, max: number): TemplateSlotSeed {
  return {
    slotId,
    externalId,
    position,
    plannedSets,
    prescription: { measurement: 'reps_per_side', min, max },
  }
}

function durationPerSide(slotId: string, externalId: string, position: number, plannedSets: number, minSec: number, maxSec: number): TemplateSlotSeed {
  return {
    slotId,
    externalId,
    position,
    plannedSets,
    prescription: { measurement: 'duration_per_side', min_sec: minSec, max_sec: maxSec },
  }
}

export const TRAINING_TEMPLATE_SEEDS: readonly TemplateSeed[] = [
  {
    routineCode: 'A',
    version: TRAINING_PAPER_VERSION,
    name: 'Full Body A — Chest & Arms Focus',
    paperForm: 'A-1.3.1',
    slots: [
      reps('A01', 'EX01', 1, 3, 6, 10),
      reps('A02', 'EX02', 2, 3, 6, 10),
      reps('A03', 'EX03', 3, 3, 8, 12),
      reps('A04', 'EX04', 4, 3, 8, 10),
      reps('A05', 'EX05', 5, 2, 10, 15),
      reps('A06', 'EX06', 6, 2, 10, 15),
      duration('A07', 'EX07', 7, 2, 30, 45),
    ],
  },
  {
    routineCode: 'B',
    version: TRAINING_PAPER_VERSION,
    name: 'Full Body B — Legs, Glutes & Dad Strength Focus',
    paperForm: 'B-1.3.1',
    slots: [
      reps('B01', 'EX08', 1, 3, 8, 12),
      reps('B02', 'EX09', 2, 3, 8, 12),
      reps('B03', 'EX03', 3, 3, 8, 12),
      reps('B04', 'EX10', 4, 3, 10, 15),
      repsPerSide('B05', 'EX11', 5, 2, 6, 8),
      reps('B06', 'EX12', 6, 2, 10, 15),
      durationPerSide('B07', 'EX13', 7, 2, 30, 45),
    ],
  },
  {
    routineCode: 'C',
    version: TRAINING_PAPER_VERSION,
    name: 'Full Body C — Back, Shoulders & Posterior Chain Focus',
    paperForm: 'C-1.3.1',
    slots: [
      reps('C01', 'EX01', 1, 3, 6, 10),
      reps('C02', 'EX14', 2, 3, 8, 12),
      reps('C03', 'EX15', 3, 3, 8, 12),
      reps('C04', 'EX04', 4, 3, 8, 10),
      repsPerSide('C05', 'EX16', 5, 2, 8, 12),
      reps('C06', 'EX17', 6, 2, 10, 15),
      duration('C07', 'EX07', 7, 2, 30, 45),
    ],
  },
]
