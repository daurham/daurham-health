# Training routine blocks — migration gate

Owner rotation: six programmed A sessions, then six B, then six C, repeating, irrespective of weekday. Preferred Training weekdays are guidance, not deadlines. Non-training days are open unless the owner makes an explicit day override.

## Storage
- Migration `0050_training_plan_repeat_blocks.sql` drops UNIQUE(plan_version_id,routine_code) while retaining PRIMARY KEY(plan_version_id,position).
- New plans accept 1–12 **consecutive** repetitions of a routine; a routine cannot appear again after switching to a different block. Old one-per-routine plans remain readable.
- Completed programmed workout sessions advance only when the routine matches the next expected slot. Other workouts are still logged but do not advance the rotation.
- UI edits compact routine blocks and expands them into existing sequence positions when saving.

## Rollout guard
Migrate a Neon branch or equivalent production-like database, validate schema and test editing/replay, then apply 0050 to production before promoting this feature to main. Do not assume source-code deployment runs migrations. No other migration is required.

## Caveat
Saving a *new* plan version mid-block currently anchors at the next routine code and does not preserve the exact repeated-slot offset of the old version. Owner should avoid resetting the plan mid-block until a follow-up adds offset-based continuity. Do not claim historical positions are migrated or automatically reconstructed.

## Nightly sleep source issue
The separate Circular 6h43 vs 7h23 problem is not addressed. Need the exact sleep date, raw intervals/stages from HAE or database, and Circular’s own definition of total sleep. Aggregate sync counts do not reveal 40 minutes of stage time.
