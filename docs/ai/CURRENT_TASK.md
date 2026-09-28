# Current Task — V2-G2 Acceptance Correction: Preserve Capture Time Unless Edited

Status: ready_for_implementation

Baseline commit:

8a0bce97c32aa3bdf9f049d82ff21091e9b0d510

This is a narrow acceptance correction for V2-G2 Body Inbox + Shortcut Capture.

Do not redesign the inbox, token model, staging table, commit transaction, Body provenance, or review workflow.

## Blocking review finding

V2-G2 requires:

> preserve capturedAt as measured_at unless the owner explicitly reviewed/changed it through an allowed UI field

The current review page does not preserve that invariant.

A staged capture may contain seconds or fractional seconds, for example:

2026-09-27T12:04:37.456-07:00

The inbox correctly stores that instant.

But the current review flow:

1. formats the staged instant into a datetime-local string with minute precision;
2. always submits the displayed local value on Save;
3. measuredAtFromPhoenixLocal always reconstructs the timestamp with seconds set to :00.

Therefore an owner who changes only the measurement value—or changes nothing at all—can silently turn:

12:04:37.456

into:

12:04:00

That is an unintended mutation of canonical historical time.

## Required behavior

An untouched measurement-time field must commit the exact staged instant.

Equivalent instants may be normalized to ISO/UTC representation, but the instant itself must remain identical.

Examples:

Staged:
2026-09-27T12:04:37-07:00

Untouched save:
2026-09-27T19:04:37.000Z

Staged:
2026-09-27T12:04:37.456-07:00

Untouched save:
2026-09-27T19:04:37.456Z

The owner may explicitly edit the time.

Only then may the review UI construct a new Phoenix-local instant from the edited field.

## Preferred implementation shape

Keep the staged canonical instant separately from the editable display value.

Track whether the owner changed the measurement-time input.

Conceptually:

- originalCapturedAt = item.capturedAt
- measuredAtLocal = owner-facing Phoenix datetime-local value
- measuredAtEdited = false initially

On time-field change:

- update measuredAtLocal
- set measuredAtEdited = true

On commit:

- if measuredAtEdited is false, submit originalCapturedAt exactly
- if measuredAtEdited is true, submit the parsed Phoenix-local edited value

Do not infer editing merely because React rendered or reformatted the field.

Do not compare formatted minute strings to determine whether the instant changed.

## Editable time precision

Also fix the local conversion helpers so an explicitly edited value does not unnecessarily discard seconds.

The datetime-local field should support seconds where practical, for example with step=1.

phoenixDateTimeLocal should produce a value with second precision.

measuredAtFromPhoenixLocal should preserve a provided seconds component instead of always forcing :00.

Fractional seconds do not need to be editable in the HTML control.

The exact staged fractional instant is preserved by the untouched path described above.

If the owner explicitly edits the field, second-level precision is sufficient for V2-G2.

## Server contract

Do not weaken server validation.

The commit endpoint still revalidates measuredAt through the existing deterministic Body parser and future-skew rule.

Do not trust a browser-only canonical conversion.

No new endpoint is required.

No migration is required.

Schema head remains:

0032_body_capture_inbox.sql

## Existing G2 behavior that must remain unchanged

Preserve all accepted G2 architecture:

- POST /api/ingest/body stages only
- BODY_CAPTURE_TOKEN remains intake-only
- owner session remains required for inbox reads/commit/discard
- Apple ingest token has no Body authority
- pending capture is not canonical
- commit is the only canonical-write path
- existing Body metric/unit/range rules remain authority
- canonical saved session remains source manual
- body_shortcut provenance remains in source_record_links
- commit remains atomic/idempotent/concurrency-safe
- discard remains noncanonical
- Fit Profile XLSX remains unchanged
- ordinary manual Body entry remains unchanged
- pending/discarded rows stay out of Today/Progress/Goals/Timeline
- backup/export behavior remains unchanged
- demo remains read-only/provider-free
- no AI/provider involvement

## Tests required

Add focused regression coverage proving at least:

1. A staged timestamp containing nonzero seconds remains the exact same instant when the owner saves without editing the time.
2. A staged timestamp containing fractional seconds remains the exact same instant when the owner saves without editing the time.
3. Editing only measurement values does not alter the staged time.
4. Editing only notes does not alter the staged time.
5. An explicitly edited datetime-local value is converted as America/Phoenix with its entered seconds preserved.
6. The editable input can represent seconds.
7. Existing future-time validation still applies to an explicitly edited time.
8. Existing Body canonical unit conversion remains unchanged.
9. Existing commit idempotency/concurrency tests remain green.
10. Existing intake idempotency remains green.
11. Existing XLSX/manual Body tests remain green.
12. Full G1/F1-F5 regressions remain green.

Run:

- npm test
- npx tsc -b
- npx eslint .
- npm run build

No migration command should run.

## Manual QA

If owner runtime is available:

1. Stage a Shortcut capture with a timestamp whose seconds are visibly nonzero.
2. Open the review page.
3. Change only the weight.
4. Save.
5. Verify canonical measured_at is the exact original staged instant.
6. Stage another capture.
7. Explicitly edit the time, including seconds.
8. Save.
9. Verify canonical measured_at reflects the edited Phoenix time.
10. Verify all other G2 behavior remains unchanged.

If signed-in owner QA remains blocked, document that accurately and test the pure conversion/selection logic directly.

## Documentation

Do not rewrite the historical 1.0.38 ledger entry.

Append a correction amendment.

Expected Design Manual version:

1.0.39

Document:

- G2 remains implemented;
- staged capturedAt is the default canonical measured_at;
- merely reviewing/editing other fields does not mutate time;
- only an explicit time edit replaces the staged instant;
- editable time supports second precision;
- schema remains 0032_body_capture_inbox.sql.

Update:

- HEALTH-PLATFORM-DESIGN-MANUAL.md
- HEALTH-PLATFORM-V2-LAB-BLUEPRINT.md
- docs/ai/DEV_STATE.md
- docs/ai/DECISIONS.md only if needed
- docs/ai/ROADMAP.md only if status text needs correction

Package remains 1.0.0.

## Acceptance criteria

This correction is complete only when:

- untouched review preserves the exact staged capture instant;
- changing another field cannot silently truncate timestamp seconds/fractions;
- explicit time edits remain allowed;
- explicit edits preserve entered second precision;
- server-side Body validation remains authoritative;
- no migration is added;
- schema remains 0032_body_capture_inbox.sql;
- all other G2 invariants remain intact;
- tests pass;
- typecheck passes;
- lint passes;
- production build passes;
- docs record the correction historically.

## Required completion report

Update docs/ai/DEV_STATE.md with:

- baseline commit
- resulting commit / working-tree state
- exact timestamp bug
- exact implementation fix
- untouched timestamp behavior
- explicitly edited timestamp behavior
- server validation status
- schema/migration status
- G2 regression status
- tests/count
- typecheck/lint/build
- manual QA
- documentation version
- deviations
- remaining V2-G work

When finished, reset CURRENT_TASK.md to the standard no-active-task template, commit, and push according to AGENTS.md.

## Final invariant

Opening a Body capture for review is not itself an edit.

If the owner does not change the measurement time, the canonical Body observation keeps the exact instant supplied by the Shortcut.
