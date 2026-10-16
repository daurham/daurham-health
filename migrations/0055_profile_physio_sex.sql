-- PIQ-2.1: owner-editable physiological reference sex, NOT gender identity.
-- Never seed a value from the current owner's account or demographics.
-- Default NULL ensures every new deployment and legacy record remains unset.
-- A calculation lacking a suitable sex-specific reference must ask instead of infer.
ALTER TABLE health_profile
  ADD COLUMN sex_for_physiology TEXT NULL,
  ADD CONSTRAINT health_profile_sex_for_physiology_allowed CHECK (
    sex_for_physiology IS NULL OR sex_for_physiology IN ('male', 'female', 'other')
  );
