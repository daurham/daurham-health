# Training routine blocks — migration gate

Owner rotation: six programmed A sessions, then six B, then six C, repeating, irrespective of weekday. Preferred Training weekdays are guidance, not deadlines. Non-training days are open unless the owner makes an explicit day override.

## Storage
- Migration `0050_training_plan_repeat_blocks.sql` drops UNIQUE(plan_version_id,routine_code), adds `sequence_start_position` to retain progress within a repeated block, and backfills old versions from their routine code; primary key(position) stays.
- New plans accept 1–12 **consecutive** repetitions of a routine; a routine cannot appear again after switching to a different block. Old one-per-routine plans remain readable.
- Completed programmed workout sessions advance only when the routine matches the next expected slot. Other workouts are still logged but do not advance the rotation.
- UI edits compact routine blocks and expands them into existing sequence positions when saving.

## Rollout guard
Migrate a Neon branch or equivalent production-like database, validate schema and test editing/replay, then apply 0050 to production before promoting this feature to main. Do not assume source-code deployment runs migrations. No other migration is required.

## Continuity
Editing an active version carries the next routine and repeat-slot offset into the new plan. If the new block is shorter, the offset is capped at the new block length, never silently reset to the beginning. Historic plan versions are retained unchanged.

## Nightly sleep source issue
The separate Circular 6h43 vs 7h23 problem is not addressed. Need the exact sleep date, raw intervals/stages from HAE or database, and Circular’s own definition of total sleep. Aggregate sync counts do not reveal 40 minutes of stage time.

## Same-day editing
Only completed programmed sessions created **after** the active plan version's creation time advance that version's sequence. An earlier session on the same calendar day does not advance the newly anchored slot again.
