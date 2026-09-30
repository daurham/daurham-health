-- V2-H5 Exercise Library + Beginner Calisthenics.
-- Adds presentation/media fields without changing canonical Training observations.

ALTER TABLE exercise_definitions
  ADD COLUMN gif_url TEXT NULL,
  ADD COLUMN youtube_url TEXT NULL,
  ADD COLUMN form_instructions TEXT NULL,
  ADD COLUMN notes TEXT NULL,
  ADD CONSTRAINT exercise_definitions_gif_url_length CHECK (gif_url IS NULL OR char_length(gif_url) <= 1000),
  ADD CONSTRAINT exercise_definitions_youtube_url_length CHECK (youtube_url IS NULL OR char_length(youtube_url) <= 1000),
  ADD CONSTRAINT exercise_definitions_form_instructions_length CHECK (form_instructions IS NULL OR char_length(form_instructions) <= 3000),
  ADD CONSTRAINT exercise_definitions_notes_length CHECK (notes IS NULL OR char_length(notes) <= 2000);

UPDATE exercise_definitions
SET form_instructions = CASE external_id
  WHEN 'EX01' THEN 'Setup: Set the box at a depth you can reach with control and place the bar securely across the upper back. Move: Brace, sit the hips down and back until you touch the box lightly, then drive through the feet to stand. Cues: Keep the whole foot planted, knees tracking with the toes, and torso braced. Avoid relaxing or rocking on the box.'
  WHEN 'EX02' THEN 'Setup: Lie with eyes under the bar, feet planted, and shoulder blades gently set against the bench. Move: Lower the bar under control toward the lower chest or sternum area, then press back up. Cues: Keep wrists stacked over forearms, forearms near vertical at the bottom, and shoulders from rolling forward.'
  WHEN 'EX03' THEN 'Setup: Sit tall, brace the trunk, and begin with shoulders relaxed rather than shrugged. Move: Pull the handle toward the lower ribs while keeping the elbows close, pause briefly, then return under control. Cues: Keep the torso mostly still and avoid collapsing forward at the end of the return.'
  WHEN 'EX04' THEN 'Setup: Stand tall with dumbbells close to the thighs and knees softly unlocked. Move: Push the hips back while keeping the spine long and the weights close to the legs, then drive the hips forward to stand. Cues: Keep pressure through the whole foot and stop the descent when the hamstrings are loaded without losing position.'
  WHEN 'EX05' THEN 'Setup: Stand or sit tall with the dumbbells at the sides and elbows near the torso. Move: Curl the weights without swinging, then lower under control to a comfortable full extension. Cues: Keep the upper arms mostly still, wrists neutral, and shoulders relaxed.'
  WHEN 'EX06' THEN 'Setup: Stand tall at the cable with elbows tucked near the ribs. Move: Extend the elbows to press the handle down, pause briefly, then return under control. Cues: Keep the shoulders quiet, torso stable, and avoid turning the movement into a shoulder or body swing.'
  WHEN 'EX07' THEN 'Setup: Stand tall with balanced loads at the sides and a secure grip. Move: Walk with controlled steps while keeping the trunk stacked. Cues: Keep shoulders level, ribs over pelvis, and resist side-to-side sway. Turn deliberately rather than twisting under load.'
  WHEN 'EX08' THEN 'Setup: Hold one dumbbell or kettlebell close to the chest and stand in front of the bench. Move: Sit the hips down toward the bench with control, touch lightly, then stand. Cues: Keep the whole foot planted, knees tracking with the toes, and the torso braced without dropping onto the bench.'
  WHEN 'EX09' THEN 'Setup: Set the bench to a comfortable incline and hold the dumbbells near the upper chest with feet planted. Move: Press the dumbbells up and slightly inward, then lower under control. Cues: Keep shoulder blades supported by the bench, wrists stacked, and elbows in a comfortable path rather than flared hard sideways.'
  WHEN 'EX10' THEN 'Setup: Position the upper back securely on the bench and place the bar or pad across the hip crease. Move: Drive through the feet and extend the hips until the torso and thighs form a strong line, then lower under control. Cues: Keep ribs from flaring, chin gently tucked, and finish with the glutes rather than arching the low back.'
  WHEN 'EX11' THEN 'Setup: Stand tall with enough room to step back and keep the front foot planted. Move: Step one leg back, lower with control, then drive through the front foot to return. Cues: Keep the front knee tracking with the toes, pelvis level, and torso controlled. Use a shorter range if balance breaks down.'
  WHEN 'EX12' THEN 'Setup: Stand or sit tall with palms facing each other and elbows near the torso. Move: Curl the dumbbells without rotating or swinging, then lower under control. Cues: Keep wrists neutral, upper arms mostly still, and shoulders relaxed.'
  WHEN 'EX13' THEN 'Setup: Hold one load at the side and stand tall with feet under the hips. Move: Walk slowly while resisting the pull of the weight, then repeat on the other side. Cues: Keep shoulders and pelvis level, ribs stacked, and avoid leaning toward or away from the load.'
  WHEN 'EX14' THEN 'Setup: Stand or sit tall with dumbbells at shoulder level and wrists stacked over elbows. Move: Press overhead to a comfortable lockout, then lower under control. Cues: Keep ribs stacked over pelvis, avoid excessive back arch, and let the elbows follow a natural slightly-forward path.'
  WHEN 'EX15' THEN 'Setup: Sit securely at the cable station with thighs supported and grip the bar comfortably. Move: Pull the bar toward the upper chest while driving the elbows down, then return under control. Cues: Keep the chest tall, shoulders away from the ears, and avoid turning the rep into a large backward lean.'
  WHEN 'EX16' THEN 'Setup: Support the free hand securely and set a stable staggered stance. Move: Pull the dumbbell toward the hip or lower ribs, pause, then lower under control. Cues: Keep the torso square and stable, shoulder away from the ear, and avoid twisting to lift the weight.'
  WHEN 'EX17' THEN 'Setup: Stand tall with light dumbbells at the sides and elbows softly bent. Move: Raise the arms out to the sides to a comfortable height, then lower slowly. Cues: Lead with the elbows, keep shoulders relaxed, and avoid shrugging or swinging the torso.'
  WHEN 'EX18' THEN 'Use a tall relaxed posture with a slight forward lean from the ankles rather than bending at the waist. Keep the steps landing generally underneath the body, arms relaxed, and cadence natural. Avoid deliberately reaching the foot far out in front to lengthen the stride.'
  WHEN 'EX19' THEN 'Stay tall and balanced, shorten the stride on steep terrain, and place the foot securely before transferring weight. Keep the knees tracking with the feet. On descents, favor controlled shorter steps instead of hard braking with a long stride.'
  ELSE form_instructions
END
WHERE external_id IN (
  'EX01','EX02','EX03','EX04','EX05','EX06','EX07','EX08','EX09','EX10',
  'EX11','EX12','EX13','EX14','EX15','EX16','EX17','EX18','EX19'
)
AND (form_instructions IS NULL OR btrim(form_instructions) = '');

UPDATE exercise_definitions
SET metadata = metadata || CASE external_id
  WHEN 'EX01' THEN '{"primary_muscle_group":"quads","secondary_muscle_groups":["glutes","core"],"movement_pattern":"squat","aliases":["box squat"]}'::jsonb
  WHEN 'EX02' THEN '{"primary_muscle_group":"chest","secondary_muscle_groups":["triceps","shoulders"],"movement_pattern":"horizontal_push","aliases":["bench","bench press"]}'::jsonb
  WHEN 'EX03' THEN '{"primary_muscle_group":"back","secondary_muscle_groups":["biceps"],"movement_pattern":"horizontal_pull","aliases":["seated cable row"]}'::jsonb
  WHEN 'EX04' THEN '{"primary_muscle_group":"hamstrings","secondary_muscle_groups":["glutes","back"],"movement_pattern":"hinge","aliases":["dumbbell rdl","rdl"]}'::jsonb
  WHEN 'EX05' THEN '{"primary_muscle_group":"arms","secondary_muscle_groups":[],"movement_pattern":"elbow_flexion","aliases":["db curl"]}'::jsonb
  WHEN 'EX06' THEN '{"primary_muscle_group":"arms","secondary_muscle_groups":[],"movement_pattern":"elbow_extension","aliases":["triceps pressdown","pushdown"]}'::jsonb
  WHEN 'EX07' THEN '{"primary_muscle_group":"full_body","secondary_muscle_groups":["core","grip"],"movement_pattern":"carry","aliases":["farmers carry"]}'::jsonb
  WHEN 'EX08' THEN '{"primary_muscle_group":"quads","secondary_muscle_groups":["glutes","core"],"movement_pattern":"squat","aliases":["goblet squat"]}'::jsonb
  WHEN 'EX09' THEN '{"primary_muscle_group":"chest","secondary_muscle_groups":["triceps","shoulders"],"movement_pattern":"horizontal_push","aliases":["incline db press"]}'::jsonb
  WHEN 'EX10' THEN '{"primary_muscle_group":"glutes","secondary_muscle_groups":["hamstrings"],"movement_pattern":"hinge","aliases":["barbell hip thrust"]}'::jsonb
  WHEN 'EX11' THEN '{"primary_muscle_group":"quads","secondary_muscle_groups":["glutes"],"movement_pattern":"lunge","aliases":["reverse lunge"]}'::jsonb
  WHEN 'EX12' THEN '{"primary_muscle_group":"arms","secondary_muscle_groups":["forearms"],"movement_pattern":"elbow_flexion","aliases":["neutral grip curl"]}'::jsonb
  WHEN 'EX13' THEN '{"primary_muscle_group":"core","secondary_muscle_groups":["grip"],"movement_pattern":"carry","aliases":["one arm carry"]}'::jsonb
  WHEN 'EX14' THEN '{"primary_muscle_group":"shoulders","secondary_muscle_groups":["triceps"],"movement_pattern":"vertical_push","aliases":["db overhead press","ohp"]}'::jsonb
  WHEN 'EX15' THEN '{"primary_muscle_group":"back","secondary_muscle_groups":["biceps"],"movement_pattern":"vertical_pull","aliases":["lat pulldown","pulldown"]}'::jsonb
  WHEN 'EX16' THEN '{"primary_muscle_group":"back","secondary_muscle_groups":["biceps"],"movement_pattern":"horizontal_pull","aliases":["one arm row","single arm dumbbell row"]}'::jsonb
  WHEN 'EX17' THEN '{"primary_muscle_group":"shoulders","secondary_muscle_groups":[],"movement_pattern":"shoulder_abduction","aliases":["lateral raise"]}'::jsonb
  WHEN 'EX18' THEN '{"primary_muscle_group":"cardio","secondary_muscle_groups":["legs"],"movement_pattern":"locomotion","aliases":["run","jogging"]}'::jsonb
  WHEN 'EX19' THEN '{"primary_muscle_group":"cardio","secondary_muscle_groups":["legs"],"movement_pattern":"locomotion","aliases":["hike","walking trail"]}'::jsonb
  ELSE '{}'::jsonb
END
WHERE external_id BETWEEN 'EX01' AND 'EX19';

INSERT INTO exercise_definitions (
  external_id, name, measurement_kind, load_type, unilateral, metadata,
  performance_type, analytics_load_type, analytics_rep_mode, form_instructions
) VALUES
  (
    'EX20','Bodyweight Squat','reps','bodyweight',false,
    '{"primary_muscle_group":"quads","secondary_muscle_groups":["glutes","core"],"movement_pattern":"squat","aliases":["air squat"]}'::jsonb,
    'bodyweight_reps','bodyweight','standard',
    'Setup: Stand with feet in a comfortable squat stance and the whole foot planted. Move: Sit the hips down between the legs, then drive through the feet to stand. Cues: Keep knees tracking with the toes, torso braced, and use only the depth you can control.'
  ),
  (
    'EX21','Incline Push-Up','reps','bodyweight',false,
    '{"primary_muscle_group":"chest","secondary_muscle_groups":["triceps","shoulders"],"movement_pattern":"horizontal_push","aliases":["incline pushup","elevated push-up"]}'::jsonb,
    'bodyweight_reps','bodyweight','standard',
    'Setup: Place the hands on a stable elevated surface slightly wider than shoulder width and walk the feet back into a straight body line. Move: Lower the chest toward the support, then press away. Cues: Keep the ribs and pelvis moving together, elbows in a comfortable diagonal path, and avoid letting the hips sag.'
  ),
  (
    'EX22','Inverted Row','reps','bodyweight',false,
    '{"primary_muscle_group":"back","secondary_muscle_groups":["biceps","core"],"movement_pattern":"horizontal_pull","aliases":["bodyweight row","inverted bodyweight row"]}'::jsonb,
    'bodyweight_reps','bodyweight','standard',
    'Setup: Use only a stable, secure support that is intended to hold your bodyweight. Position the body in a straight line with a firm grip. Move: Pull the chest toward the support while keeping the body braced, then lower under control. Cues: Keep shoulders away from the ears and avoid bending at the hips. Skip or substitute this exercise if a secure setup is not available.'
  ),
  (
    'EX23','Glute Bridge','reps','bodyweight',false,
    '{"primary_muscle_group":"glutes","secondary_muscle_groups":["hamstrings","core"],"movement_pattern":"hinge","aliases":["floor bridge"]}'::jsonb,
    'bodyweight_reps','bodyweight','standard',
    'Setup: Lie on the back with knees bent and feet planted comfortably near the hips. Move: Brace lightly and drive through the feet to lift the hips, then lower under control. Cues: Finish with the glutes, keep the ribs from flaring, and avoid turning the top into a low-back arch.'
  ),
  (
    'EX24','Bird Dog','reps_per_side','bodyweight',true,
    '{"primary_muscle_group":"core","secondary_muscle_groups":["glutes","shoulders"],"movement_pattern":"anti_rotation","aliases":["quadruped bird dog"]}'::jsonb,
    'bodyweight_reps','bodyweight','per_side',
    'Setup: Start on hands and knees with the spine neutral and trunk lightly braced. Move: Reach the opposite arm and leg away from the body, pause with control, then return and switch sides. Cues: Keep the pelvis level, move slowly, and use a smaller reach if the low back twists or arches.'
  ),
  (
    'EX25','Dead Bug','reps_per_side','bodyweight',true,
    '{"primary_muscle_group":"core","secondary_muscle_groups":[],"movement_pattern":"anti_extension","aliases":["deadbug"]}'::jsonb,
    'bodyweight_reps','bodyweight','per_side',
    'Setup: Lie on the back with hips and knees bent and arms reaching upward. Move: Slowly extend the opposite arm and leg while keeping the trunk controlled, then return and switch sides. Cues: Keep the ribs down, maintain comfortable contact through the low back, and shorten the reach if the back begins to arch.'
  ),
  (
    'EX26','Forearm Plank','duration','bodyweight',false,
    '{"primary_muscle_group":"core","secondary_muscle_groups":["shoulders","glutes"],"movement_pattern":"anti_extension","aliases":["plank"]}'::jsonb,
    'timed','bodyweight','standard',
    'Setup: Place forearms on the floor with elbows under the shoulders and extend the legs behind you. Hold: Keep a straight, comfortable line from shoulders through hips to ankles. Cues: Brace the trunk, squeeze the glutes lightly, keep breathing, and stop the set when position breaks down.'
  )
ON CONFLICT (external_id) DO UPDATE SET
  name = EXCLUDED.name,
  measurement_kind = EXCLUDED.measurement_kind,
  load_type = EXCLUDED.load_type,
  unilateral = EXCLUDED.unilateral,
  metadata = exercise_definitions.metadata || EXCLUDED.metadata,
  performance_type = EXCLUDED.performance_type,
  analytics_load_type = EXCLUDED.analytics_load_type,
  analytics_rep_mode = EXCLUDED.analytics_rep_mode,
  form_instructions = CASE
    WHEN exercise_definitions.form_instructions IS NULL OR btrim(exercise_definitions.form_instructions) = ''
      THEN EXCLUDED.form_instructions
    ELSE exercise_definitions.form_instructions
  END,
  is_active = true,
  updated_at = now();

INSERT INTO workout_templates (
  routine_code, version, name, metadata, is_active, origin_kind
) VALUES (
  'CAL-BEG',
  '1.0.0',
  'Beginner Calisthenics — Full Body',
  '{"builtin":"beginner_calisthenics"}'::jsonb,
  true,
  'seeded'
)
ON CONFLICT (routine_code, version) DO UPDATE SET
  name = EXCLUDED.name,
  metadata = workout_templates.metadata || EXCLUDED.metadata,
  is_active = true,
  updated_at = now();

INSERT INTO workout_template_exercises (
  workout_template_id, exercise_definition_id, slot_id, position, planned_sets, prescription
)
SELECT
  templates.id,
  exercises.id,
  seed.slot_id,
  seed.position,
  seed.planned_sets,
  seed.prescription
FROM (
  VALUES
    ('EX20'::text,'CAL01'::text,1,2,'{"measurement":"reps","min":8,"max":12}'::jsonb),
    ('EX21','CAL02',2,2,'{"measurement":"reps","min":6,"max":10}'::jsonb),
    ('EX22','CAL03',3,2,'{"measurement":"reps","min":6,"max":10}'::jsonb),
    ('EX23','CAL04',4,2,'{"measurement":"reps","min":10,"max":15}'::jsonb),
    ('EX24','CAL05',5,2,'{"measurement":"reps_per_side","min":6,"max":8}'::jsonb),
    ('EX25','CAL06',6,2,'{"measurement":"reps_per_side","min":6,"max":8}'::jsonb),
    ('EX26','CAL07',7,2,'{"measurement":"duration","min_sec":20,"max_sec":30}'::jsonb)
) AS seed(external_id, slot_id, position, planned_sets, prescription)
JOIN workout_templates templates
  ON templates.routine_code = 'CAL-BEG'
 AND templates.version = '1.0.0'
JOIN exercise_definitions exercises
  ON exercises.external_id = seed.external_id
ON CONFLICT (workout_template_id, slot_id) DO UPDATE SET
  exercise_definition_id = EXCLUDED.exercise_definition_id,
  position = EXCLUDED.position,
  planned_sets = EXCLUDED.planned_sets,
  prescription = EXCLUDED.prescription;
