-- I0C — fresh-instance bootstrap + owner-specific seed separation.
--
-- Historical migration 0003 created the original owner's A/B/C paper routines.
-- Those rows must remain usable in an established database that has Training
-- history tied to that routine family, but a brand-new owner should not inherit
-- them as if they were product defaults.
--
-- Product/reference seeds remain shared:
-- - exercise_definitions;
-- - data_sources;
-- - Beginner Calisthenics (CAL-BEG).
--
-- Owner-created routines already use origin_kind = 'owner' and are untouched.

UPDATE workout_templates
SET metadata = metadata || '{"seed_scope":"legacy_owner","seed_family":"original_abc"}'::jsonb,
    updated_at = now()
WHERE origin_kind = 'seeded'
  AND routine_code IN ('A', 'B', 'C')
  AND version = '1.3.1';

UPDATE workout_templates
SET metadata = metadata || '{"seed_scope":"product_builtin","builtin":"beginner_calisthenics"}'::jsonb,
    updated_at = now()
WHERE origin_kind = 'seeded'
  AND routine_code = 'CAL-BEG'
  AND version = '1.0.0';

-- Fresh instance: hide the original-owner routine family.
-- Established instance: preserve current active/inactive state when any
-- historical workout references A/B/C either by snapshotted routine_code or
-- template identity. Never delete templates because historical sessions may
-- retain foreign-key/provenance references.
UPDATE workout_templates AS legacy
SET is_active = false,
    updated_at = now()
WHERE legacy.origin_kind = 'seeded'
  AND legacy.routine_code IN ('A', 'B', 'C')
  AND legacy.version = '1.3.1'
  AND NOT EXISTS (
    SELECT 1
    FROM workout_sessions AS session
    WHERE session.routine_code IN ('A', 'B', 'C')
       OR session.workout_template_id IN (
         SELECT preserved.id
         FROM workout_templates AS preserved
         WHERE preserved.origin_kind = 'seeded'
           AND preserved.routine_code IN ('A', 'B', 'C')
           AND preserved.version = '1.3.1'
       )
  );
