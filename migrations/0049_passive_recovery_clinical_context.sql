-- I10 — Passive Recovery + Clinical Context Expansion.
-- Structured owner-entered clinical context belongs to the singleton Health Profile.
-- Passive physiological metrics remain in their existing canonical source tables.

ALTER TABLE health_profile
  ADD COLUMN clinical_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN clinical_allergies JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN clinical_medications JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE health_profile
  ADD CONSTRAINT health_profile_conditions_array CHECK (jsonb_typeof(clinical_conditions) = 'array'),
  ADD CONSTRAINT health_profile_allergies_array CHECK (jsonb_typeof(clinical_allergies) = 'array'),
  ADD CONSTRAINT health_profile_medications_array CHECK (jsonb_typeof(clinical_medications) = 'array');
