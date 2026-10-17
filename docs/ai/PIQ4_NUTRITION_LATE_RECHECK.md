# PIQ-4.2 — activity provenance and late Nutrition read consistency

**Scope:** present-day personalized Ask Health weight/energy focus on the PIQ
development branch only. Corrections can happen during the several read-only
queries used to assemble an answer. Initial owner-complete Nutrition days
are revision-confirmed during intelligence snapshot loading, but a later
edit/delete can invalidate that confirmation before the model sees evidence.

The current Ask Health loader now repeats **one bounded, set-based canonical
Nutrition completeness SQL query** through the existing
`loadVerifiedNutritionDays` authority at the end of its source retrieval.
For the same initial snapshot, the exact set of original confirmed dates
must still agree with persisted source IDs, calories, protein/carbohydrate/sodium
values (including absent-vs-zero), completeness flags, canonical entry
revisions, and exclusions. Even a same-ID, same-kcal nutrient correction after
a second owner confirmation is detected by comparing the changed nutrient
totals against the initial intelligence snapshot. A mismatch or failed read
becomes `changed_or_unavailable` — NOT unlogged food, not no change.
In that case `addFocusedWeightEnergy` emits only a neutral non-substantive
source consistency explanation, withholding *all* its weight/intake
maintenance, qualified nutrient shift, protein, step/water comparison and
canonical cross-signal inferences from the potentially stale snapshot. It
cannot authorize any calorie or plateau recommendation. Synthetic fixtures
retain a `not_checked` status so existing pure-domain tests stay isolated.

Separately, `activity_daily_summaries.id` now flows into each intelligence
activity observation as a stable summary-level source ID (steps, active
energy, exercise minutes, and resting HR). Previously the source IDs were
dropped, making every genuinely recorded step day appear unattributed and
unqualified for the scale-window source-identity count. An absent or blank
source ID remains absent; none is fabricated. This fixes attribution but
does **not** attest complete-day activity or lock subsequent corrections.

This is **not** a transactional snapshot or a verification of weight,
activity, daily context or training source revisions. Those remain separate
release gates. No schema migrations, owner records viewed, production
promotion, new provider calls, health guidance or manual actions.
