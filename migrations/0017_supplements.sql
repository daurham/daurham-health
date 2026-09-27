-- V2-A1 Supplements. Canonical identity, effective-dated schedules, lifecycle events,
-- and explicit adherence. Expected daily state is derived. No row is created for
-- unknown, paused, or not_scheduled. Absence of an adherence row means unknown,
-- not skipped.
--
-- Weekday mask is ISO-style: bit 0 = Monday ... bit 6 = Sunday. 127 = every day.
-- Provenance uses the existing manual data source seeded in 0001. This migration
-- does not add a second owner-entry source.

CREATE TABLE supplements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  form TEXT NULL,
  brand TEXT NULL,
  product_name TEXT NULL,
  notes TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source_id UUID NOT NULL REFERENCES data_sources(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT supplements_name_present CHECK (btrim(name) <> '')
);

CREATE TABLE supplement_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplement_id UUID NOT NULL REFERENCES supplements(id) ON DELETE CASCADE,
  slot_label TEXT NULL,
  dose_amount NUMERIC NOT NULL,
  dose_unit TEXT NOT NULL,
  weekday_mask INTEGER NOT NULL,
  effective_from DATE NOT NULL,
  effective_through DATE NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source_id UUID NOT NULL REFERENCES data_sources(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT supplement_schedules_dose_positive CHECK (dose_amount > 0),
  CONSTRAINT supplement_schedules_unit_present CHECK (btrim(dose_unit) <> ''),
  CONSTRAINT supplement_schedules_weekday_mask_range CHECK (weekday_mask BETWEEN 1 AND 127),
  CONSTRAINT supplement_schedules_effective_interval CHECK (
    effective_through IS NULL OR effective_through >= effective_from
  )
);

CREATE INDEX supplement_schedules_supplement_id_idx
  ON supplement_schedules (supplement_id);

CREATE TABLE supplement_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplement_id UUID NOT NULL REFERENCES supplements(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  status TEXT NOT NULL,
  notes TEXT NULL,
  source_id UUID NOT NULL REFERENCES data_sources(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT supplement_status_events_status_known CHECK (
    status IN ('active', 'paused', 'discontinued')
  ),
  CONSTRAINT supplement_status_events_supplement_date_key UNIQUE (supplement_id, effective_date)
);

CREATE TABLE supplement_adherence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES supplement_schedules(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  status TEXT NOT NULL,
  actual_dose_amount NUMERIC NULL,
  actual_dose_unit TEXT NULL,
  taken_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  source_id UUID NOT NULL REFERENCES data_sources(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT supplement_adherence_status_known CHECK (status IN ('taken', 'skipped')),
  CONSTRAINT supplement_adherence_schedule_date_key UNIQUE (schedule_id, scheduled_date),
  CONSTRAINT supplement_adherence_actual_dose_pair CHECK (
    (
      actual_dose_amount IS NULL
      AND actual_dose_unit IS NULL
    )
    OR (
      actual_dose_amount IS NOT NULL
      AND actual_dose_amount > 0
      AND actual_dose_unit IS NOT NULL
      AND btrim(actual_dose_unit) <> ''
    )
  )
);

CREATE INDEX supplement_adherence_scheduled_date_idx
  ON supplement_adherence (scheduled_date);
