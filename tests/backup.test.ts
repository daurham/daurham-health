import { createHash } from 'node:crypto'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { requireHealthOwner, type HealthOwnerConfig } from '../server/auth/owner.ts'
import { HttpError } from '../server/http.ts'
import {
  buildBackupArchive,
  planRestore,
  restoreStatements,
  verifyBackupArchive,
  type BackupRow,
} from '../server/backup/format.ts'
import { AUTH_TABLES_EXCLUDED, BACKUP_TABLES, LATEST_SCHEMA_MIGRATION, tablesForProfile } from '../server/backup/inventory.ts'

const SOURCE = '11111111-1111-4111-8111-111111111111'
const USDA_SOURCE = '10101010-1010-4010-8010-101010101010'
const FOOD = '22222222-2222-4222-8222-222222222222'
const USDA_FOOD_OZ = '20202020-2020-4020-8020-202020202020'
const USDA_FOOD_GRAMS = '30303030-3030-4030-8030-303030303030'
const USDA_LINK_OZ = '40404040-4040-4040-8040-404040404040'
const USDA_LINK_GRAMS = '50505050-5050-4050-8050-505050505050'
const USDA_FINGERPRINT_OZ = 'usda-fdc-serving-v1|{"amount":4,"fdcId":171477,"grams":112,"unit":"oz"}'
const USDA_FINGERPRINT_GRAMS = 'usda-fdc-serving-v1|{"amount":100,"fdcId":171477,"grams":100,"unit":"g"}'
const RECIPE = 'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1'
const RECIPE_VERSION = 'c2c2c2c2-c2c2-42c2-82c2-c2c2c2c2c2c2'
const RECIPE_LINE = 'c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3'
const RECIPE_LINE_REMOVED = 'c4c4c4c4-c4c4-44c4-84c4-c4c4c4c4c4c4'
const RECIPE_VERSION_2 = 'c5c5c5c5-c5c5-45c5-85c5-c5c5c5c5c5c5'
const RECIPE_VERSION_3 = 'c6c6c6c6-c6c6-46c6-86c6-c6c6c6c6c6c6'
const RECIPE_LINE_2 = 'c7c7c7c7-c7c7-47c7-87c7-c7c7c7c7c7c7'
const RECIPE_LINE_3 = 'c8c8c8c8-c8c8-48c8-88c8-c8c8c8c8c8c8'
const ENTRY = '33333333-3333-4333-8333-333333333333'
const RECIPE_ENTRY = 'd9d9d9d9-d9d9-49d9-89d9-d9d9d9d9d9d9'
const BODY = '44444444-4444-4444-8444-444444444444'
const METRIC = '55555555-5555-4555-8555-555555555555'
const EXERCISE = '66666666-6666-4666-8666-666666666666'
const OWNER_EXERCISE = '65656565-6565-4565-8565-656565656565'
const TEMPLATE = '77777777-7777-4777-8777-777777777777'
const SLOT = '88888888-8888-4888-8888-888888888888'
const WORKOUT = '99999999-9999-4999-8999-999999999999'
const ADHOC = '64646464-6464-4464-8464-646464646464'
const ADHOC_EXERCISE = '63636363-6363-4363-8363-636363636363'
const ADHOC_SET = '62626262-6262-4262-8262-626262626262'
const WORKOUT_EXERCISE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CHECKPOINT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const DAY = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const NIGHT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const SUPPLEMENT = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const GOAL_BODY = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'
const GOAL_BODY_V1 = 'd2d2d2d2-d2d2-42d2-82d2-d2d2d2d2d2d2'
const GOAL_BODY_V2 = 'd3d3d3d3-d3d3-43d3-83d3-d3d3d3d3d3d3'
const GOAL_BENCH = 'd4d4d4d4-d4d4-44d4-84d4-d4d4d4d4d4d4'
const GOAL_BENCH_V1 = 'd5d5d5d5-d5d5-45d5-85d5-d5d5d5d5d5d5'
const GOAL_SUP = 'd6d6d6d6-d6d6-46d6-86d6-d6d6d6d6d6d6'
const GOAL_SUP_V1 = 'd7d7d7d7-d7d7-47d7-87d7-d7d7d7d7d7d7'
const SUPPLEMENT_SCHEDULE = '12121212-1212-4121-8121-121212121212'
const SUPPLEMENT_STATUS = '34343434-3434-4343-8343-343434343434'
const SUPPLEMENT_ADHERENCE = '56565656-5656-4565-8565-565656565656'
const CADENCE = '67676767-6767-4767-8767-676767676767'
const CIRCUMFERENCE = '78787878-7878-4787-8787-787878787878'
const CONTEXT_MULTI = 'abababab-abab-4aba-8aba-abababababab'
const CONTEXT_TAG = 'acacacac-acac-4aca-8aca-acacacacacac'
const CONTEXT_NOTE = 'adadadad-adad-4ada-8ada-adadadadadad'
const LAB_PROTOCOL = 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1'
const LAB_VERSION_OLD = 'b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2'
const LAB_VERSION = 'b3b3b3b3-b3b3-43b3-83b3-b3b3b3b3b3b3'
const LAB_REQUIREMENT = 'b4b4b4b4-b4b4-44b4-84b4-b4b4b4b4b4b4'
const LAB_BENCHMARK = 'b5b5b5b5-b5b5-45b5-85b5-b5b5b5b5b5b5'
const LAB_EXPERIMENT_PROTOCOL = 'b7b7b7b7-b7b7-47b7-87b7-b7b7b7b7b7b7'
const LAB_EXPERIMENT_VERSION = 'b8b8b8b8-b8b8-48b8-88b8-b8b8b8b8b8b8'
const LAB_EXPERIMENT = 'b6b6b6b6-b6b6-46b6-86b6-b6b6b6b6b6b6'
const LAB_WORKOUT = 'b9b9b9b9-b9b9-49b9-89b9-b9b9b9b9b9b9'
const LAB_RESULT = 'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1'
const LAB_RESULT_NEXT = 'c2c2c2c2-c2c2-42c2-82c2-c2c2c2c2c2c2'
const LAB_VALUE = 'c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3'
const LAB_VALUE_NEXT = 'c4c4c4c4-c4c4-44c4-84c4-c4c4c4c4c4c4'
const LAB_EVIDENCE = 'c5c5c5c5-c5c5-45c5-85c5-c5c5c5c5c5c5'
const LAB_EVIDENCE_NEXT = 'c6c6c6c6-c6c6-46c6-86c6-c6c6c6c6c6c6'
const INSTANT = '2026-09-22 22:15:00+00'

const ownerConfig: HealthOwnerConfig = {
  authBaseUrl: 'https://auth.example',
  cookieSecret: 'x'.repeat(32),
  sameSite: 'lax',
  sessionDataTtl: 300,
  ownerUserId: 'owner-1',
  ownerEmail: 'owner@example.com',
}

function row(values: BackupRow): BackupRow {
  return values
}

function fixture(): Record<string, BackupRow[]> {
  return {
    data_sources: [
      row({
        id: SOURCE,
        key: 'manual',
        display_name: 'Manual',
        source_kind: 'manual',
        created_at: INSTANT,
      }),
      row({
        id: USDA_SOURCE,
        key: 'usda_fooddata_central',
        display_name: 'USDA FoodData Central',
        source_kind: 'reference',
        created_at: INSTANT,
      }),
    ],
    exercise_definitions: [
      row({
        id: EXERCISE,
        external_id: 'EX01',
        name: 'Box Squat',
        measurement_kind: 'reps',
        load_type: 'barbell',
        unilateral: false,
        metadata: '{"equipment_load":"barbell_total_including_bar"}',
        is_active: true,
        created_at: INSTANT,
        updated_at: INSTANT,
        performance_type: 'loaded_reps',
        analytics_load_type: 'external',
        analytics_rep_mode: 'standard',
      }),
      row({
        id: OWNER_EXERCISE,
        external_id: null,
        name: 'Push-up',
        measurement_kind: 'reps',
        load_type: 'bodyweight',
        unilateral: false,
        metadata: '{"origin":"owner","created_via":"ad_hoc_training"}',
        is_active: true,
        created_at: INSTANT,
        updated_at: INSTANT,
        performance_type: 'other',
        analytics_load_type: 'none',
        analytics_rep_mode: 'standard',
      }),
    ],
    workout_templates: [
      row({
        id: TEMPLATE,
        routine_code: 'A',
        version: '1.3.1',
        name: 'Full Body A',
        metadata: '{}',
        is_active: true,
        created_at: INSTANT,
      }),
    ],
    workout_template_exercises: [
      row({
        id: SLOT,
        workout_template_id: TEMPLATE,
        exercise_definition_id: EXERCISE,
        slot_id: 'A01',
        position: '1',
        planned_sets: '3',
        prescription: '{"measurement":"reps"}',
        metadata: '{}',
        created_at: INSTANT,
      }),
    ],
    nutrition_foods: [
      row({
        id: FOOD,
        name: 'Eggs',
        brand: null,
        barcode: null,
        catalog_kind: 'ingredient',
        serving_quantity: '2',
        serving_unit: 'large',
        serving_grams: null,
        calories: '140',
        protein: '12.5',
        carbs: null,
        fat: '9.5',
        fiber: null,
        source_kind: 'manual',
        is_staple: false,
        archived: false,
        notes: null,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
      row({
        id: USDA_FOOD_OZ,
        name: '93% lean ground turkey',
        brand: 'Jennie-O',
        barcode: null,
        catalog_kind: 'ingredient',
        serving_quantity: '4',
        serving_unit: 'oz',
        serving_grams: '112',
        calories: '170',
        protein: '21',
        carbs: '0',
        fat: '9',
        fiber: null,
        source_kind: 'usda',
        is_staple: false,
        archived: false,
        notes: 'Owner likes this cut',
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
      row({
        id: USDA_FOOD_GRAMS,
        name: '93% lean ground turkey',
        brand: null,
        barcode: null,
        catalog_kind: 'ingredient',
        serving_quantity: '100',
        serving_unit: 'g',
        serving_grams: '100',
        calories: '150',
        protein: '19',
        carbs: '0',
        fat: '8',
        fiber: null,
        source_kind: 'usda',
        is_staple: false,
        archived: false,
        notes: 'Per 100 g review',
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    source_record_links: [
      row({
        id: USDA_LINK_OZ,
        source_id: USDA_SOURCE,
        import_job_id: null,
        external_id: '171477',
        external_fingerprint: USDA_FINGERPRINT_OZ,
        entity_type: 'nutrition_food',
        entity_id: USDA_FOOD_OZ,
        source_payload: null,
        created_at: INSTANT,
      }),
      row({
        id: USDA_LINK_GRAMS,
        source_id: USDA_SOURCE,
        import_job_id: null,
        external_id: '171477',
        external_fingerprint: USDA_FINGERPRINT_GRAMS,
        entity_type: 'nutrition_food',
        entity_id: USDA_FOOD_GRAMS,
        source_payload: null,
        created_at: INSTANT,
      }),
    ],
    nutrition_entries: [
      row({
        id: ENTRY,
        log_date: '2026-09-22',
        consumed_at: null,
        timezone: 'America/Phoenix',
        meal: 'breakfast',
        food_id: FOOD,
        food_name: 'Eggs',
        brand: null,
        serving_quantity: '2',
        serving_unit: 'large',
        grams: null,
        calories: '668.125',
        protein: null,
        carbs: '0',
        fat: '9.5',
        fiber: null,
        source_kind: 'manual',
        notes: null,
        created_at: INSTANT,
        updated_at: INSTANT,
        meal_group_id: null,
        recipe_version_id: null,
        recipe_portion_kind: null,
        recipe_portion_amount: null,
        recipe_fraction: null,
      }),
      row({
        id: RECIPE_ENTRY,
        log_date: '2026-09-20',
        consumed_at: null,
        timezone: 'America/Phoenix',
        meal: null,
        food_id: null,
        food_name: 'Turkey tofu stew',
        brand: null,
        serving_quantity: '475',
        serving_unit: 'g · Recipe v1',
        grams: '475',
        calories: '236.75',
        protein: null,
        carbs: '8',
        fat: '4',
        fiber: null,
        source_kind: 'manual',
        notes: null,
        created_at: INSTANT,
        updated_at: INSTANT,
        meal_group_id: null,
        recipe_version_id: RECIPE_VERSION,
        recipe_portion_kind: 'grams',
        recipe_portion_amount: '475',
        recipe_fraction: '0.16666666666666666',
      }),
    ],
    recipes: [
      row({
        id: RECIPE,
        is_active: false,
        source_id: SOURCE,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    recipe_versions: [
      row({
        id: RECIPE_VERSION,
        recipe_id: RECIPE,
        version: '1',
        is_current: false,
        name: 'Turkey tofu stew',
        notes: null,
        yield_servings: '6',
        finished_weight_g: null,
        calories_kcal: '186.5',
        protein_g: null,
        carbs_g: '8',
        fat_g: null,
        calculation_version: 'recipe-v1',
        source_id: SOURCE,
        created_at: INSTANT,
      }),
      row({
        id: RECIPE_VERSION_2,
        recipe_id: RECIPE,
        version: '2',
        is_current: false,
        name: 'Sundubu-jjigae',
        notes: 'Weeknight',
        yield_servings: '6',
        finished_weight_g: '2800',
        calories_kcal: '240',
        protein_g: '40',
        carbs_g: '8',
        fat_g: null,
        calculation_version: 'recipe-v1',
        source_id: SOURCE,
        created_at: INSTANT,
      }),
      row({
        id: RECIPE_VERSION_3,
        recipe_id: RECIPE,
        version: '3',
        is_current: true,
        name: 'Sundubu-jjigae spicy',
        notes: null,
        yield_servings: '6',
        finished_weight_g: '2850',
        calories_kcal: '260',
        protein_g: null,
        carbs_g: '9',
        fat_g: '4',
        calculation_version: 'recipe-v1',
        source_id: SOURCE,
        created_at: INSTANT,
      }),
    ],
    recipe_version_ingredients: [
      row({
        id: RECIPE_LINE,
        recipe_version_id: RECIPE_VERSION,
        position: '1',
        food_id: FOOD,
        amount: '0.5',
        unit: 'serving',
        scale_factor: '0.5',
        food_name_snapshot: 'Ground Turkey',
        food_source_type_snapshot: 'manual',
        food_source_external_id_snapshot: null,
        base_serving_amount_snapshot: '1',
        base_serving_unit_snapshot: 'serving',
        base_weight_grams_snapshot: null,
        base_calories_kcal_snapshot: '173',
        base_protein_g_snapshot: '10',
        base_carbs_g_snapshot: '3',
        base_fat_g_snapshot: null,
        line_calories_kcal: '86.5',
        line_protein_g: '5',
        line_carbs_g: '1.5',
        line_fat_g: null,
        created_at: INSTANT,
      }),
      row({
        id: RECIPE_LINE_REMOVED,
        recipe_version_id: RECIPE_VERSION,
        position: '2',
        food_id: null,
        amount: '1',
        unit: 'serving',
        scale_factor: '1',
        food_name_snapshot: 'Zucchini',
        food_source_type_snapshot: 'manual',
        food_source_external_id_snapshot: null,
        base_serving_amount_snapshot: '1',
        base_serving_unit_snapshot: 'serving',
        base_weight_grams_snapshot: '100',
        base_calories_kcal_snapshot: '100',
        base_protein_g_snapshot: null,
        base_carbs_g_snapshot: '5',
        base_fat_g_snapshot: null,
        line_calories_kcal: '100',
        line_protein_g: null,
        line_carbs_g: '5',
        line_fat_g: null,
        created_at: INSTANT,
      }),
      row({
        id: RECIPE_LINE_2,
        recipe_version_id: RECIPE_VERSION_2,
        position: '1',
        food_id: FOOD,
        amount: '2',
        unit: 'serving',
        scale_factor: '2',
        food_name_snapshot: 'Kirkland Ground Turkey 93/7',
        food_source_type_snapshot: 'manual',
        food_source_external_id_snapshot: null,
        base_serving_amount_snapshot: '1',
        base_serving_unit_snapshot: 'serving',
        base_weight_grams_snapshot: null,
        base_calories_kcal_snapshot: '120',
        base_protein_g_snapshot: '20',
        base_carbs_g_snapshot: '4',
        base_fat_g_snapshot: null,
        line_calories_kcal: '240',
        line_protein_g: '40',
        line_carbs_g: '8',
        line_fat_g: null,
        created_at: INSTANT,
      }),
      row({
        id: RECIPE_LINE_3,
        recipe_version_id: RECIPE_VERSION_3,
        position: '1',
        food_id: FOOD,
        amount: '2',
        unit: 'serving',
        scale_factor: '2',
        food_name_snapshot: 'Kirkland Ground Turkey 93/7',
        food_source_type_snapshot: 'manual',
        food_source_external_id_snapshot: null,
        base_serving_amount_snapshot: '1',
        base_serving_unit_snapshot: 'serving',
        base_weight_grams_snapshot: '113',
        base_calories_kcal_snapshot: '130',
        base_protein_g_snapshot: null,
        base_carbs_g_snapshot: '4.5',
        base_fat_g_snapshot: '2',
        line_calories_kcal: '260',
        line_protein_g: null,
        line_carbs_g: '9',
        line_fat_g: '4',
        created_at: INSTANT,
      }),
    ],
    body_measurement_sessions: [
      row({
        id: BODY,
        measured_at: INSTANT,
        timezone: 'America/Phoenix',
        source_id: SOURCE,
        import_job_id: null,
        device_name: null,
        notes: null,
        metadata: '{}',
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    body_metrics: [
      row({
        id: METRIC,
        measurement_session_id: BODY,
        metric_key: 'weight',
        value: '86.63614267',
        unit: 'kg',
        value_kind: 'measured',
        metadata: '{}',
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
      row({
        id: CIRCUMFERENCE,
        measurement_session_id: BODY,
        metric_key: 'waist_circumference',
        value: '94.488',
        unit: 'cm',
        value_kind: 'manual',
        metadata: '{}',
        created_at: INSTANT,
        updated_at: null,
      }),
    ],
    body_measurement_cadences: [
      row({
        id: CADENCE,
        metric_key: 'waist_circumference',
        interval_days: '14',
        enabled_from: '2026-09-01',
        source_id: SOURCE,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    lab_protocols: [
      row({
        id: LAB_PROTOCOL,
        protocol_kind: 'benchmark',
        title: 'Push-up 10-minute capacity',
        description: 'Repeatable upper-body capacity check.',
        source_id: SOURCE,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
      row({
        id: LAB_EXPERIMENT_PROTOCOL,
        protocol_kind: 'experiment',
        title: 'Push-up capacity retest',
        description: null,
        source_id: SOURCE,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    lab_protocol_versions: [
      row({
        id: LAB_VERSION_OLD,
        protocol_id: LAB_PROTOCOL,
        version: '1',
        instructions: 'As many good-form push-ups as possible in 10 minutes.',
        minimum_retest_days: null,
        suggested_retest_days: '90',
        is_current: false,
        created_at: INSTANT,
      }),
      row({
        id: LAB_VERSION,
        protocol_id: LAB_PROTOCOL,
        version: '2',
        instructions: 'As many good-form push-ups as possible in 10 minutes. Pause at the bottom.',
        minimum_retest_days: '30',
        suggested_retest_days: '90',
        is_current: true,
        created_at: INSTANT,
      }),
      row({
        id: LAB_EXPERIMENT_VERSION,
        protocol_id: LAB_EXPERIMENT_PROTOCOL,
        version: '1',
        instructions: 'Retest push-up capacity once during the window.',
        minimum_retest_days: null,
        suggested_retest_days: null,
        is_current: true,
        created_at: INSTANT,
      }),
    ],
    lab_protocol_requirements: [
      row({
        id: LAB_REQUIREMENT,
        protocol_version_id: LAB_VERSION,
        position: '1',
        role: 'primary_outcome',
        domain: 'training',
        requirement_kind: 'training_measure',
        selector: '{"exerciseDefinitionId":"66666666-6666-4666-8666-666666666666","measure":"total_reps"}',
        label: 'Push-up total reps',
        required: true,
        criteria: '{}',
        created_at: INSTANT,
      }),
    ],
    lab_protocol_context_controls: [
      row({
        protocol_version_id: LAB_EXPERIMENT_VERSION,
        tag_key: 'travel',
        control_mode: 'observe',
        created_at: INSTANT,
      }),
    ],
    benchmark_definitions: [
      row({
        id: LAB_BENCHMARK,
        protocol_id: LAB_PROTOCOL,
        domain: 'training',
        description: 'Repeatable upper-body capacity check.',
        is_active: true,
        source_id: SOURCE,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    experiments: [
      row({
        id: LAB_EXPERIMENT,
        title: 'Push-up capacity retest',
        question: 'Does the current block change push-up capacity?',
        hypothesis: null,
        rationale: null,
        origin: 'owner_created',
        status: 'active',
        protocol_version_id: LAB_EXPERIMENT_VERSION,
        window_start: '2026-09-28',
        window_end: '2026-10-05',
        source_id: SOURCE,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    experiment_benchmarks: [
      row({
        experiment_id: LAB_EXPERIMENT,
        benchmark_definition_id: LAB_BENCHMARK,
        role: 'primary',
        created_at: INSTANT,
      }),
    ],
    experiment_supplements: [
      row({
        experiment_id: LAB_EXPERIMENT,
        supplement_id: SUPPLEMENT,
        role: 'intervention',
        created_at: INSTANT,
      }),
    ],
    benchmark_results: [
      row({
        id: LAB_RESULT_NEXT,
        benchmark_definition_id: LAB_BENCHMARK,
        protocol_version_id: LAB_VERSION,
        result_date: '2026-12-20',
        experiment_id: null,
        status: 'valid',
        protocol_confirmation_kind: 'owner_attested',
        evidence_fingerprint: 'fingerprint-next',
        source_id: SOURCE,
        supersedes_result_id: LAB_RESULT,
        created_at: INSTANT,
        invalidated_at: null,
        invalidation_reason: null,
      }),
      row({
        id: LAB_RESULT,
        benchmark_definition_id: LAB_BENCHMARK,
        protocol_version_id: LAB_VERSION,
        result_date: '2026-09-26',
        experiment_id: LAB_EXPERIMENT,
        status: 'invalidated',
        protocol_confirmation_kind: 'linked_protocol',
        evidence_fingerprint: 'fingerprint-old',
        source_id: SOURCE,
        supersedes_result_id: null,
        created_at: INSTANT,
        invalidated_at: INSTANT,
        invalidation_reason: 'Workout reps were corrected after this result was saved.',
      }),
    ],
    benchmark_result_values: [
      row({
        id: LAB_VALUE,
        benchmark_result_id: LAB_RESULT,
        requirement_id: LAB_REQUIREMENT,
        value: '67',
        unit: 'reps',
        value_kind: 'derived',
        created_at: INSTANT,
      }),
      row({
        id: LAB_VALUE_NEXT,
        benchmark_result_id: LAB_RESULT_NEXT,
        requirement_id: LAB_REQUIREMENT,
        value: '81',
        unit: 'reps',
        value_kind: 'derived',
        created_at: INSTANT,
      }),
    ],
    benchmark_result_evidence: [
      row({
        id: LAB_EVIDENCE,
        benchmark_result_value_id: LAB_VALUE,
        evidence_kind: 'training_session',
        evidence_ref: '{"sessionId":"b9b9b9b9-b9b9-49b9-89b9-b9b9b9b9b9b9","setIds":["s1","s2"]}',
        evidence_snapshot: '{"exerciseName":"Push-up","sets":[{"reps":22,"setId":"s1"}]}',
        observation_date: '2026-09-26',
        created_at: INSTANT,
      }),
      row({
        id: LAB_EVIDENCE_NEXT,
        benchmark_result_value_id: LAB_VALUE_NEXT,
        evidence_kind: 'training_session',
        evidence_ref: '{"setIds":["s3"],"sessionId":"b9b9b9b9-b9b9-49b9-89b9-b9b9b9b9b9b9"}',
        evidence_snapshot: '{"sets":[{"reps":81,"setId":"s3"}],"exerciseName":"Push-up"}',
        observation_date: '2026-12-20',
        created_at: INSTANT,
      }),
    ],
    workout_sessions: [
      row({
        id: WORKOUT,
        workout_date: '2026-09-21',
        workout_template_id: TEMPLATE,
        routine_code: 'A',
        template_version: '1.3.1',
        template_name: 'Full Body A',
        session_type: 'programmed',
        session_name: null,
        experiment_id: null,
        benchmark_protocol_version_id: null,
        duration_min: null,
        effort: null,
        pain_level: null,
        bodyweight_kg: null,
        notes: null,
        source_kind: 'manual',
        metadata: '{}',
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
      row({
        id: ADHOC,
        workout_date: '2026-09-25',
        workout_template_id: null,
        routine_code: null,
        template_version: null,
        template_name: null,
        session_type: 'ad_hoc',
        session_name: 'Garage kettlebells',
        experiment_id: null,
        benchmark_protocol_version_id: null,
        duration_min: null,
        effort: null,
        pain_level: null,
        bodyweight_kg: null,
        notes: null,
        source_kind: 'manual',
        metadata: '{}',
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
      row({
        id: LAB_WORKOUT,
        workout_date: '2026-09-28',
        workout_template_id: null,
        routine_code: null,
        template_version: null,
        template_name: null,
        session_type: 'experiment',
        session_name: 'Push-up capacity',
        experiment_id: LAB_EXPERIMENT,
        benchmark_protocol_version_id: LAB_VERSION,
        duration_min: null,
        effort: null,
        pain_level: null,
        bodyweight_kg: null,
        notes: null,
        source_kind: 'manual',
        metadata: '{}',
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    workout_session_exercises: [
      row({
        id: WORKOUT_EXERCISE,
        workout_session_id: WORKOUT,
        exercise_definition_id: EXERCISE,
        position: '1',
        slot_id: 'A01',
        exercise_external_id: 'EX01',
        exercise_name: 'Box Squat',
        notes: null,
        metadata: '{}',
        created_at: INSTANT,
      }),
      row({
        id: ADHOC_EXERCISE,
        workout_session_id: ADHOC,
        exercise_definition_id: OWNER_EXERCISE,
        position: '1',
        slot_id: null,
        exercise_external_id: null,
        exercise_name: 'Push-up',
        notes: null,
        metadata: '{}',
        created_at: INSTANT,
      }),
    ],
    workout_sets: [
      row({
        id: SET,
        workout_session_exercise_id: WORKOUT_EXERCISE,
        set_number: '1',
        set_type: 'working',
        load_state: 'external',
        weight_kg: '60.5',
        reps: '8',
        duration_sec: null,
        left_reps: null,
        right_reps: null,
        left_duration_sec: null,
        right_duration_sec: null,
        notes: null,
        metadata: '{}',
        created_at: INSTANT,
      }),
      row({
        id: ADHOC_SET,
        workout_session_exercise_id: ADHOC_EXERCISE,
        set_number: '1',
        set_type: 'working',
        load_state: 'bodyweight',
        weight_kg: null,
        reps: '12',
        duration_sec: null,
        left_reps: null,
        right_reps: null,
        left_duration_sec: null,
        right_duration_sec: null,
        notes: null,
        metadata: '{}',
        created_at: INSTANT,
      }),
    ],
    progress_checkpoints: [
      row({
        id: CHECKPOINT,
        checkpoint_date: '2026-09-01',
        label: 'Start',
        notes: null,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    activity_daily_summaries: [
      row({
        id: DAY,
        summary_date: '2026-09-22',
        timezone: 'America/Phoenix',
        steps_count: '129',
        active_energy_kcal: '12.083702334016023',
        exercise_minutes: null,
        walking_running_distance_m: null,
        resting_heart_rate_bpm: null,
        calculation_version: '1',
        evidence: '{}',
        source_id: SOURCE,
        import_job_id: null,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    sleep_nightly_summaries: [
      row({
        id: NIGHT,
        sleep_date: '2026-06-14',
        timezone: 'America/Phoenix',
        logical_source_key: 'apple-watch',
        source_name: 'Apple Watch',
        start_at: INSTANT,
        end_at: INSTANT,
        total_sleep_minutes: '592.05',
        time_in_bed_minutes: null,
        awake_minutes: null,
        core_minutes: null,
        deep_minutes: null,
        rem_minutes: null,
        unspecified_sleep_minutes: null,
        stage_coverage_pct: null,
        stage_conflict_minutes: '0',
        observation_status: 'analysis_eligible',
        analysis_eligible: true,
        stage_analysis_eligible: false,
        selection_reason: 'source_priority',
        calculation_version: '1',
        evidence: '{}',
        source_id: SOURCE,
        import_job_id: null,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    supplements: [
      row({
        id: SUPPLEMENT,
        name: 'Creatine monohydrate',
        form: null,
        brand: null,
        product_name: null,
        notes: null,
        sort_order: '0',
        source_id: SOURCE,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    supplement_schedules: [
      row({
        id: SUPPLEMENT_SCHEDULE,
        supplement_id: SUPPLEMENT,
        slot_label: null,
        dose_amount: '5',
        dose_unit: 'g',
        weekday_mask: '127',
        effective_from: '2026-01-01',
        effective_through: null,
        sort_order: '0',
        source_id: SOURCE,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    supplement_status_events: [
      row({
        id: SUPPLEMENT_STATUS,
        supplement_id: SUPPLEMENT,
        effective_date: '2026-01-01',
        status: 'active',
        notes: null,
        source_id: SOURCE,
        created_at: INSTANT,
      }),
    ],
    supplement_adherence: [
      row({
        id: SUPPLEMENT_ADHERENCE,
        schedule_id: SUPPLEMENT_SCHEDULE,
        scheduled_date: '2026-09-20',
        status: 'taken',
        actual_dose_amount: null,
        actual_dose_unit: null,
        taken_at: null,
        notes: null,
        source_id: SOURCE,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    daily_context: [
      row({
        id: CONTEXT_MULTI,
        context_date: '2026-09-20',
        note: 'Drove to Phoenix late and ate dinner around 10.',
        source_id: SOURCE,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
      row({
        id: CONTEXT_TAG,
        context_date: '2026-01-15',
        note: null,
        source_id: SOURCE,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
      row({
        id: CONTEXT_NOTE,
        context_date: '2026-09-12',
        note: 'Café 日本語',
        source_id: SOURCE,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    daily_context_tags: [
      row({ context_id: CONTEXT_MULTI, tag_key: 'travel', created_at: INSTANT }),
      row({ context_id: CONTEXT_MULTI, tag_key: 'late_meal', created_at: INSTANT }),
      row({ context_id: CONTEXT_TAG, tag_key: 'sick', created_at: INSTANT }),
    ],
    goals: [
      row({
        id: GOAL_BODY,
        goal_kind: 'body_metric',
        status: 'active',
        started_on: '2026-09-01',
        body_metric_key: 'weight',
        exercise_definition_id: null,
        benchmark_definition_id: null,
        benchmark_protocol_version_id: null,
        benchmark_requirement_id: null,
        supplement_id: null,
        source_id: SOURCE,
        paused_at: null,
        completed_at: null,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
      row({
        id: GOAL_BENCH,
        goal_kind: 'benchmark_result',
        status: 'paused',
        started_on: '2026-08-01',
        body_metric_key: null,
        exercise_definition_id: null,
        benchmark_definition_id: LAB_BENCHMARK,
        benchmark_protocol_version_id: LAB_VERSION,
        benchmark_requirement_id: LAB_REQUIREMENT,
        supplement_id: null,
        source_id: SOURCE,
        paused_at: INSTANT,
        completed_at: null,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
      row({
        id: GOAL_SUP,
        goal_kind: 'supplement_adherence',
        status: 'completed',
        started_on: '2026-07-01',
        body_metric_key: null,
        exercise_definition_id: null,
        benchmark_definition_id: null,
        benchmark_protocol_version_id: null,
        benchmark_requirement_id: null,
        supplement_id: SUPPLEMENT,
        source_id: SOURCE,
        paused_at: null,
        completed_at: INSTANT,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    goal_versions: [
      row({
        id: GOAL_BODY_V1,
        goal_id: GOAL_BODY,
        version: '1',
        is_current: false,
        target_mode: 'at_most',
        target_min: null,
        target_max: '175',
        target_unit: 'lb',
        target_date: '2026-12-31',
        evaluation_window_days: null,
        notes: 'initial cut target',
        source_id: SOURCE,
        created_at: INSTANT,
      }),
      row({
        id: GOAL_BODY_V2,
        goal_id: GOAL_BODY,
        version: '2',
        is_current: true,
        target_mode: 'range',
        target_min: '175',
        target_max: '180',
        target_unit: 'lb',
        target_date: null,
        evaluation_window_days: null,
        notes: 'revised after strength block',
        source_id: SOURCE,
        created_at: INSTANT,
      }),
      row({
        id: GOAL_BENCH_V1,
        goal_id: GOAL_BENCH,
        version: '1',
        is_current: true,
        target_mode: 'at_least',
        target_min: '80',
        target_max: null,
        target_unit: 'reps',
        target_date: null,
        evaluation_window_days: null,
        notes: null,
        source_id: SOURCE,
        created_at: INSTANT,
      }),
      row({
        id: GOAL_SUP_V1,
        goal_id: GOAL_SUP,
        version: '1',
        is_current: true,
        target_mode: 'at_least',
        target_min: '90',
        target_max: null,
        target_unit: '%',
        target_date: null,
        evaluation_window_days: '30',
        notes: null,
        source_id: SOURCE,
        created_at: INSTANT,
      }),
    ],
  }
}

function archive() {
  return buildBackupArchive({
    profile: 'full',
    createdAt: '2026-09-22T22:30:00.000Z',
    schemaMigration: LATEST_SCHEMA_MIGRATION,
    appVersionOrCommit: '0.0.0',
    rowsByTable: fixture(),
  })
}

function emptyCounts(seedCount = 0): Record<string, number> {
  return Object.fromEntries(BACKUP_TABLES.map((definition) => [definition.name, definition.seeded ? seedCount : 0]))
}

describe('health backup archive', () => {
  it('round-trips ids, nulls, dates, timestamps, and numeric text', () => {
    const verified = verifyBackupArchive(archive())
    expect(verified.errors).toEqual([])
    expect(verified.manifest.formatVersion).toBe(1)
    expect(verified.manifest.calendarTimezone).toBe('America/Phoenix')
    const entry = verified.tables.nutrition_entries?.[0]
    expect(entry).toMatchObject({
      id: ENTRY,
      food_id: FOOD,
      log_date: '2026-09-22',
      created_at: INSTANT,
      calories: '668.125',
      protein: null,
      carbs: '0',
    })
    expect(verified.tables.body_metrics?.[0]?.value).toBe('86.63614267')
    expect(verified.tables.activity_daily_summaries?.[0]?.exercise_minutes).toBeNull()
    expect(verified.tables.activity_daily_summaries?.[0]?.active_energy_kcal).toBe('12.083702334016023')
    expect(verified.manifest.tables.nutrition_entries?.rows).toBe(2)
    expect(verified.tables.nutrition_entries?.find((item) => item.id === RECIPE_ENTRY)).toMatchObject({
      recipe_version_id: RECIPE_VERSION,
      recipe_portion_kind: 'grams',
      recipe_portion_amount: '475',
      recipe_fraction: '0.16666666666666666',
      food_name: 'Turkey tofu stew',
      serving_unit: 'g · Recipe v1',
      calories: '236.75',
      protein: null,
      log_date: '2026-09-20',
      food_id: null,
    })
    expect(verified.tables.nutrition_entries?.find((item) => item.id === ENTRY)?.recipe_version_id).toBeNull()
    const restored = restoreStatements(verified.tables)
    const entryInsert = restored.find((statement) => statement.text.includes('INSERT INTO nutrition_entries'))
    expect(entryInsert?.params).toContain(ENTRY)
    expect(entryInsert?.params).toContain(FOOD)
    expect(entryInsert?.params).toContain(null)
    expect(entryInsert?.params).toContain('668.125')
    expect(verified.tables.workout_sessions?.find((session) => session.id === WORKOUT)).toMatchObject({
      session_type: 'programmed',
      session_name: null,
      workout_template_id: TEMPLATE,
    })
    expect(verified.tables.workout_sessions?.find((session) => session.id === ADHOC)).toMatchObject({
      session_type: 'ad_hoc',
      session_name: 'Garage kettlebells',
      workout_template_id: null,
      template_name: null,
    })
    expect(verified.tables.exercise_definitions?.map((exercise) => exercise.id).sort()).toEqual([EXERCISE, OWNER_EXERCISE].sort())
    const exerciseInsert = restored.find((statement) => statement.text.includes('INSERT INTO exercise_definitions'))
    expect(exerciseInsert?.params).toEqual(expect.arrayContaining([EXERCISE, OWNER_EXERCISE]))
    const sessionInsert = restored.find((statement) => statement.text.includes('INSERT INTO workout_sessions'))
    expect(sessionInsert?.params).toEqual(expect.arrayContaining([WORKOUT, ADHOC, 'programmed', 'ad_hoc', 'Garage kettlebells']))
    expect(verified.tables.workout_sets?.[0]?.workout_session_exercise_id).toBe(WORKOUT_EXERCISE)
    expect(verified.tables.workout_session_exercises?.[0]?.workout_session_id).toBe(WORKOUT)
    expect(verified.tables.supplements?.[0]).toMatchObject({
      id: SUPPLEMENT,
      name: 'Creatine monohydrate',
      source_id: SOURCE,
      form: null,
    })
    expect(verified.tables.supplement_schedules?.[0]).toMatchObject({
      id: SUPPLEMENT_SCHEDULE,
      supplement_id: SUPPLEMENT,
      dose_amount: '5',
      effective_from: '2026-01-01',
      effective_through: null,
    })
    expect(verified.tables.supplement_status_events?.[0]).toMatchObject({
      id: SUPPLEMENT_STATUS,
      effective_date: '2026-01-01',
      status: 'active',
      notes: null,
    })
    expect(verified.tables.body_measurement_sessions?.[0]?.updated_at).toBe(INSTANT)
    expect(verified.tables.body_metrics?.find((metric) => metric.unit === 'cm')).toMatchObject({
      id: CIRCUMFERENCE,
      value: '94.488',
      unit: 'cm',
      updated_at: null,
    })
    expect(verified.tables.body_measurement_cadences?.[0]).toMatchObject({
      id: CADENCE,
      metric_key: 'waist_circumference',
      interval_days: '14',
      enabled_from: '2026-09-01',
      source_id: SOURCE,
      updated_at: INSTANT,
    })
    expect(verified.tables.supplement_adherence?.[0]).toMatchObject({
      id: SUPPLEMENT_ADHERENCE,
      schedule_id: SUPPLEMENT_SCHEDULE,
      scheduled_date: '2026-09-20',
      status: 'taken',
      actual_dose_amount: null,
      taken_at: null,
      created_at: INSTANT,
    })
    expect(verified.tables.daily_context).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: CONTEXT_MULTI,
          context_date: '2026-09-20',
          note: 'Drove to Phoenix late and ate dinner around 10.',
          source_id: SOURCE,
          created_at: INSTANT,
          updated_at: INSTANT,
        }),
        expect.objectContaining({
          id: CONTEXT_TAG,
          context_date: '2026-01-15',
          note: null,
          source_id: SOURCE,
        }),
        expect.objectContaining({
          id: CONTEXT_NOTE,
          context_date: '2026-09-12',
          note: 'Café 日本語',
        }),
      ]),
    )
    expect(verified.tables.daily_context_tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ context_id: CONTEXT_MULTI, tag_key: 'travel' }),
        expect.objectContaining({ context_id: CONTEXT_MULTI, tag_key: 'late_meal' }),
        expect.objectContaining({ context_id: CONTEXT_TAG, tag_key: 'sick' }),
      ]),
    )
    expect(verified.tables.daily_context_tags?.filter((item) => item.context_id === CONTEXT_NOTE)).toEqual([])
    const insertAt = (name: string) => restored.findIndex((statement) => statement.text.startsWith(`INSERT INTO ${name} (`))
    expect(insertAt('supplements')).toBeGreaterThan(-1)
    expect(insertAt('supplements')).toBeLessThan(insertAt('supplement_schedules'))
    expect(insertAt('supplement_schedules')).toBeLessThan(insertAt('supplement_adherence'))
    expect(insertAt('supplements')).toBeLessThan(insertAt('supplement_status_events'))
    expect(insertAt('data_sources')).toBeLessThan(insertAt('body_measurement_cadences'))
    expect(insertAt('body_measurement_sessions')).toBeLessThan(insertAt('body_metrics'))
    expect(insertAt('daily_context')).toBeLessThan(insertAt('daily_context_tags'))
    expect(insertAt('lab_protocols')).toBeLessThan(insertAt('lab_protocol_versions'))
    expect(insertAt('lab_protocol_versions')).toBeLessThan(insertAt('experiments'))
    expect(insertAt('experiments')).toBeLessThan(insertAt('workout_sessions'))
    expect(insertAt('supplements')).toBeLessThan(insertAt('experiment_supplements'))
    expect(insertAt('experiments')).toBeLessThan(insertAt('benchmark_results'))
    expect(insertAt('benchmark_results')).toBeLessThan(insertAt('benchmark_result_values'))
    expect(insertAt('benchmark_result_values')).toBeLessThan(insertAt('benchmark_result_evidence'))
    expect(insertAt('nutrition_foods')).toBeLessThan(insertAt('recipes'))
    expect(insertAt('supplements')).toBeLessThan(insertAt('goals'))
    expect(insertAt('exercise_definitions')).toBeLessThan(insertAt('goals'))
    expect(insertAt('lab_protocol_requirements')).toBeLessThan(insertAt('goals'))
    expect(insertAt('benchmark_definitions')).toBeLessThan(insertAt('goals'))
    expect(insertAt('goals')).toBeLessThan(insertAt('goal_versions'))
    expect(verified.tables.goal_versions?.find((version) => version.id === GOAL_BODY_V1)).toMatchObject({
      is_current: false,
      target_mode: 'at_most',
      target_min: null,
      target_max: '175',
      target_unit: 'lb',
      notes: 'initial cut target',
    })
    expect(verified.tables.goal_versions?.find((version) => version.id === GOAL_BODY_V2)).toMatchObject({
      is_current: true,
      target_mode: 'range',
      target_min: '175',
      target_max: '180',
      target_date: null,
    })
    expect(verified.tables.goals?.find((goal) => goal.id === GOAL_BENCH)).toMatchObject({
      status: 'paused',
      benchmark_requirement_id: LAB_REQUIREMENT,
      paused_at: INSTANT,
      completed_at: null,
    })
    expect(verified.tables.goals?.find((goal) => goal.id === GOAL_SUP)).toMatchObject({
      status: 'completed',
      supplement_id: SUPPLEMENT,
      completed_at: INSTANT,
    })
    expect(verified.tables.goals?.[0]).not.toHaveProperty('selector_label')
    expect(insertAt('recipes')).toBeLessThan(insertAt('recipe_versions'))
    expect(insertAt('recipe_versions')).toBeLessThan(insertAt('recipe_version_ingredients'))
    expect(insertAt('recipe_version_ingredients')).toBeLessThan(insertAt('nutrition_entries'))
    expect(verified.tables.recipes?.[0]).toMatchObject({ id: RECIPE, is_active: false, source_id: SOURCE })
    expect(verified.tables.recipe_versions?.map((version) => [version.version, version.is_current, version.name])).toEqual([
      ['1', false, 'Turkey tofu stew'],
      ['2', false, 'Sundubu-jjigae'],
      ['3', true, 'Sundubu-jjigae spicy'],
    ])
    expect(verified.tables.recipe_versions?.filter((version) => version.is_current)).toHaveLength(1)
    expect(verified.tables.recipe_versions?.[0]).toMatchObject({
      id: RECIPE_VERSION,
      calories_kcal: '186.5',
      protein_g: null,
      calculation_version: 'recipe-v1',
    })
    expect(verified.tables.recipe_versions?.[2]).toMatchObject({
      id: RECIPE_VERSION_3,
      finished_weight_g: '2850',
      calories_kcal: '260',
      protein_g: null,
    })
    expect(verified.tables.recipe_version_ingredients?.map((line) => line.position)).toEqual(['1', '2', '1', '1'])
    expect(verified.tables.recipe_version_ingredients?.[1]).toMatchObject({
      food_id: null,
      food_name_snapshot: 'Zucchini',
      line_protein_g: null,
      line_calories_kcal: '100',
    })
    const resultInsert = restored.find((statement) => statement.text.startsWith('INSERT INTO benchmark_results ('))
    expect(resultInsert?.params.indexOf(LAB_RESULT)).toBeLessThan(resultInsert?.params.indexOf(LAB_RESULT_NEXT) ?? -1)
    const portableNames = tablesForProfile('portable').map((definition) => definition.name)
    expect(portableNames).toEqual(expect.arrayContaining([
      'supplements',
      'supplement_schedules',
      'supplement_status_events',
      'supplement_adherence',
      'body_measurement_cadences',
      'daily_context',
      'daily_context_tags',
      'lab_protocols',
      'lab_protocol_versions',
      'lab_protocol_requirements',
      'lab_protocol_context_controls',
      'benchmark_definitions',
      'experiments',
      'experiment_benchmarks',
      'experiment_supplements',
      'recipes',
      'recipe_versions',
      'recipe_version_ingredients',
      'benchmark_results',
      'benchmark_result_values',
      'benchmark_result_evidence',
      'goals',
      'goal_versions',
    ]))
  })

  it('excludes auth tables and secret markers', () => {
    expect(BACKUP_TABLES.map((definition) => definition.name)).not.toEqual(expect.arrayContaining([...AUTH_TABLES_EXCLUDED]))
    for (const name of BACKUP_TABLES.map((definition) => definition.name)) {
      expect(['user', 'session', 'account', 'verification', 'jwks']).not.toContain(name)
    }
    const text = strFromU8(archive())
    expect(text).not.toContain('GEMINI_API_KEY')
    expect(text).not.toContain('password_hash')
    expect(text).not.toContain('DATABASE_URL')
  })

  it('rejects a bad checksum, malformed NDJSON, and an unsupported version', () => {
    const files = unzipSync(archive())
    const broken = { ...files }
    const ndjson = strFromU8(files['tables/nutrition_entries.ndjson'] ?? new Uint8Array())
    broken['tables/nutrition_entries.ndjson'] = strToU8(`${ndjson.slice(0, -2)}`)
    expect(verifyBackupArchive(zipSync(broken)).errors.some((error) => error.includes('checksum'))).toBe(true)

    const malformed = { ...files }
    const bad = strToU8('{')
    malformed['tables/nutrition_entries.ndjson'] = bad
    const manifest = JSON.parse(strFromU8(files['manifest.json'] ?? new Uint8Array())) as {
      tables: Record<string, { sha256: string; rows: number }>
      contentSha256: string
    }
    manifest.tables.nutrition_entries = {
      ...manifest.tables.nutrition_entries,
      rows: 1,
      sha256: createHash('sha256').update(bad).digest('hex'),
    }
    const lines = Object.keys(manifest.tables)
      .sort()
      .map((name) => `${name}\n${manifest.tables[name]?.sha256 ?? ''}\n`)
    manifest.contentSha256 = createHash('sha256').update(lines.join('')).digest('hex')
    malformed['manifest.json'] = strToU8(`${JSON.stringify(manifest)}\n`)
    expect(verifyBackupArchive(zipSync(malformed)).errors.some((error) => error.includes('not valid NDJSON'))).toBe(true)

    const future = JSON.parse(strFromU8(files['manifest.json'] ?? new Uint8Array())) as { formatVersion: number }
    future.formatVersion = 2
    const futureFiles = { ...files, 'manifest.json': strToU8(`${JSON.stringify(future)}\n`) }
    expect(verifyBackupArchive(zipSync(futureFiles)).errors.some((error) => error.includes('unsupported backup format version'))).toBe(true)
  })

  it('stops a conflicting restore without producing writes and keeps ids on an empty database', () => {
    const verified = verifyBackupArchive(archive())
    const conflict = planRestore({
      verified,
      destinationSchema: LATEST_SCHEMA_MIGRATION,
      destinationCounts: { ...emptyCounts(), nutrition_entries: 2 },
    })
    expect(conflict.blocked).toBe(true)
    expect(conflict.conflicts.some((item) => item.includes('nutrition_entries'))).toBe(true)
    const supplementConflict = planRestore({
      verified,
      destinationSchema: LATEST_SCHEMA_MIGRATION,
      destinationCounts: { ...emptyCounts(), supplement_adherence: 1 },
    })
    expect(supplementConflict.blocked).toBe(true)
    expect(supplementConflict.conflicts.some((item) => item.includes('supplement_adherence'))).toBe(true)
    const cadenceConflict = planRestore({
      verified,
      destinationSchema: LATEST_SCHEMA_MIGRATION,
      destinationCounts: { ...emptyCounts(), body_measurement_cadences: 1 },
    })
    expect(cadenceConflict.blocked).toBe(true)
    expect(cadenceConflict.conflicts.some((item) => item.includes('body_measurement_cadences'))).toBe(true)
    const writes = conflict.blocked ? [] : restoreStatements(verified.tables)
    expect(writes).toEqual([])

    const empty = planRestore({
      verified,
      destinationSchema: LATEST_SCHEMA_MIGRATION,
      destinationCounts: emptyCounts(4),
    })
    expect(empty.blocked).toBe(false)
    expect(empty.notes.some((note) => note.includes('data_sources'))).toBe(true)
    const statements = restoreStatements(verified.tables)
    expect(statements[0]?.text).toBe('DELETE FROM workout_template_exercises')
    expect(statements.some((statement) => statement.params.includes(ENTRY))).toBe(true)
    expect(statements.some((statement) => statement.params.includes(FOOD))).toBe(true)
  })

  it('projects USDA identity into the portable food record without a source UUID', () => {
    const full = verifyBackupArchive(archive())
    expect(full.errors).toEqual([])
    const fullOz = full.tables.nutrition_foods?.find((food) => food.id === USDA_FOOD_OZ)
    expect(fullOz).toMatchObject({
      name: '93% lean ground turkey',
      brand: 'Jennie-O',
      notes: 'Owner likes this cut',
      serving_quantity: '4',
      serving_unit: 'oz',
      serving_grams: '112',
      source_kind: 'usda',
    })
    expect(fullOz).not.toHaveProperty('external_provenance')
    expect(full.tables.source_record_links?.find((link) => link.id === USDA_LINK_OZ)).toMatchObject({
      source_id: USDA_SOURCE,
      external_id: '171477',
      external_fingerprint: USDA_FINGERPRINT_OZ,
      entity_type: 'nutrition_food',
      entity_id: USDA_FOOD_OZ,
    })
    const restored = restoreStatements(full.tables)
    const foodInsert = restored.find((statement) => statement.text.startsWith('INSERT INTO nutrition_foods ('))
    const linkInsert = restored.find((statement) => statement.text.startsWith('INSERT INTO source_record_links ('))
    expect(foodInsert?.text).not.toContain('external_provenance')
    expect(linkInsert?.text).toContain('source_id')
    expect(linkInsert?.params).toContain(USDA_SOURCE)
    expect(linkInsert?.params).toContain('171477')

    const portable = buildBackupArchive({
      profile: 'portable',
      createdAt: '2026-09-22T22:30:00.000Z',
      schemaMigration: LATEST_SCHEMA_MIGRATION,
      appVersionOrCommit: '0.0.0',
      rowsByTable: fixture(),
    })
    const verified = verifyBackupArchive(portable)
    expect(verified.errors).toEqual([])
    expect(verified.tables.source_record_links).toBeUndefined()
    expect(verified.tables.data_sources).toBeUndefined()
    expect(verified.tables.nutrition_foods?.find((food) => food.id === FOOD)).not.toHaveProperty('external_provenance')

    const ounce = verified.tables.nutrition_foods?.find((food) => food.id === USDA_FOOD_OZ)
    const grams = verified.tables.nutrition_foods?.find((food) => food.id === USDA_FOOD_GRAMS)
    const ounceSource = JSON.parse(String(ounce?.external_provenance)) as {
      source: { kind: string; provider: string; external_id: string; external_fingerprint: string }
    }
    const gramSource = JSON.parse(String(grams?.external_provenance)) as {
      source: { kind: string; provider: string; external_id: string; external_fingerprint: string }
    }
    expect(ounceSource.source).toEqual({
      kind: 'usda',
      provider: 'usda_fooddata_central',
      external_id: '171477',
      external_fingerprint: USDA_FINGERPRINT_OZ,
    })
    expect(gramSource.source.external_id).toBe('171477')
    expect(gramSource.source.external_fingerprint).toBe(USDA_FINGERPRINT_GRAMS)
    expect(gramSource.source.external_fingerprint).not.toBe(ounceSource.source.external_fingerprint)
    expect(ounce?.serving_quantity).toBe('4')
    expect(ounce?.serving_unit).toBe('oz')
    expect(ounce?.serving_grams).toBe('112')
    expect(grams?.serving_quantity).toBe('100')
    expect(grams?.serving_grams).toBe('100')
    expect(ounce?.notes).toBe('Owner likes this cut')
    expect(ounce?.brand).toBe('Jennie-O')
    expect(grams?.notes).toBe('Per 100 g review')
    expect(grams?.brand).toBeNull()
    expect(JSON.stringify(ounceSource)).not.toContain(USDA_SOURCE)
    expect(JSON.stringify(ounceSource)).not.toContain('Jennie-O')
    expect(JSON.stringify(ounceSource)).not.toContain('Owner likes this cut')
    expect(JSON.stringify(gramSource)).not.toContain(USDA_SOURCE)
    expect(strFromU8(unzipSync(portable)['README.txt'] ?? new Uint8Array())).toContain('FoodData Central id')
    const portableGoals = verified.tables.goals ?? []
    expect(portableGoals.find((goal) => goal.id === GOAL_BODY)).toMatchObject({
      selector_label: 'Bodyweight',
      source_key: 'manual',
      body_metric_key: 'weight',
    })
    expect(portableGoals.find((goal) => goal.id === GOAL_BENCH)?.selector_label).toBe('Push-up total reps')
    expect(portableGoals.find((goal) => goal.id === GOAL_SUP)?.selector_label).toBe('Creatine monohydrate adherence')
    expect(JSON.stringify(portableGoals.find((goal) => goal.id === GOAL_BODY)?.selector_label)).not.toContain(SOURCE)
    expect(verified.tables.goal_versions?.find((version) => version.id === GOAL_BODY_V2)).toMatchObject({
      source_key: 'manual',
      target_min: '175',
      target_max: '180',
      target_date: null,
    })
    expect(verified.tables.goal_versions?.find((version) => version.id === GOAL_BENCH_V1)?.target_unit).toBe('reps')
  })

  it('refuses a portable export as a recovery backup', () => {
    const portable = buildBackupArchive({
      profile: 'portable',
      createdAt: '2026-09-22T22:30:00.000Z',
      schemaMigration: LATEST_SCHEMA_MIGRATION,
      appVersionOrCommit: '0.0.0',
      rowsByTable: fixture(),
    })
    const verified = verifyBackupArchive(portable)
    expect(verified.errors).toEqual([])
    expect(verified.tables.exercise_definitions?.map((exercise) => exercise.id).sort()).toEqual([EXERCISE, OWNER_EXERCISE].sort())
    expect(verified.tables.workout_sessions?.map((session) => session.session_type).sort()).toEqual(['ad_hoc', 'experiment', 'programmed'])
    expect(verified.tables.workout_sessions?.find((session) => session.id === LAB_WORKOUT)).toMatchObject({
      experiment_id: LAB_EXPERIMENT,
      benchmark_protocol_version_id: LAB_VERSION,
    })
    expect(verified.tables.lab_protocol_versions?.find((version) => version.id === LAB_VERSION_OLD)).toMatchObject({
      version: '1',
      is_current: false,
      instructions: 'As many good-form push-ups as possible in 10 minutes.',
    })
    expect(JSON.parse(String(verified.tables.lab_protocol_requirements?.[0]?.selector))).toEqual({
      exerciseDefinitionId: EXERCISE,
      measure: 'total_reps',
    })
    expect(JSON.parse(String(verified.tables.benchmark_result_evidence?.find((item) => item.id === LAB_EVIDENCE_NEXT)?.evidence_ref))).toEqual({
      sessionId: LAB_WORKOUT,
      setIds: ['s3'],
    })
    expect(JSON.parse(String(verified.tables.benchmark_result_evidence?.find((item) => item.id === LAB_EVIDENCE_NEXT)?.evidence_snapshot))).toEqual({
      exerciseName: 'Push-up',
      sets: [{ reps: 81, setId: 's3' }],
    })
    expect(verified.tables.benchmark_result_values?.find((item) => item.id === LAB_VALUE)?.value).toBe('67')
    const plan = planRestore({
      verified,
      destinationSchema: LATEST_SCHEMA_MIGRATION,
      destinationCounts: emptyCounts(),
    })
    expect(plan.blocked).toBe(true)
    expect(plan.conflicts.some((conflict) => conflict.includes('Portable exports cannot be restored'))).toBe(true)
  })
})

describe('backup export authorization', () => {
  it('rejects anonymous and non-owner callers, including a machine bearer token', async () => {
    const request = { headers: { authorization: 'Bearer machine-token' } }
    await expect(requireHealthOwner(request, { readSession: async () => null, config: ownerConfig })).rejects.toMatchObject({
      statusCode: 401,
    })
    await expect(
      requireHealthOwner(request, {
        readSession: async () => ({ id: 'someone-else', email: 'other@example.com' }),
        config: ownerConfig,
      }),
    ).rejects.toBeInstanceOf(HttpError)
    await expect(
      requireHealthOwner(request, {
        readSession: async () => ({ id: 'someone-else', email: 'other@example.com' }),
        config: ownerConfig,
      }),
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})
