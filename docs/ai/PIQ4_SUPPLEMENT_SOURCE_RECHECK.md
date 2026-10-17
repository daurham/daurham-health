# PIQ-4.2 — Saved Supplements late-source consistency (development only)

## Why

Health AI loads owner-recorded supplement schedules, status events and
adherence from four local database reads. An owner can change a dose,
schedule, lifecycle status or recorded taken/skipped event while the request
is still assembling its evidence packet. The earlier first read must not be
recast as current and should never imply a missing entry was taken or skipped.

## Change

The already-existing saved-supplement name matcher is reused by the loader,
so the late check is eligible only for a **current personalized** request
whose General/Nutrition lens or saved supplement-name match may surface
Supplement facts. No extra reads are added to unrelated Training, Recovery
or Experiment questions. The extra check reruns the existing bounded
supplement service once (currently four local read-only SQL queries) and
compares all effective saved supplement IDs, names, sort order, scheduled
dose/time/date/weekday fields, lifecycle event order and dates, and recorded
adherence states and amounts for the selected range.

The comparator sorts collections only where order is not meaningful and
rejects duplicate or malformed source identities, incorrect date scopes,
unavailable database reads, and changes to originally empty observations.
Source status event ordering is **preserved**, because same-date transitions
are resolved chronologically by the existing domain helper. No raw
medication/owner text is written to diagnostics.

If records disagree or cannot be rechecked, the packet omits **all** saved
Supplement regimens and adherence claims and substitutes a non-substantive,
privacy-safe source-warning. Other independently qualified evidence
remains eligible, and the packet fingerprint changes for cache separation.

## Explicit limits

These are two optimistic service snapshots, not an atomic transaction.
The existing `TodaySupplementInput` projection omits some raw event and
adherence row identifiers/notes/revision timestamps, so this compares
**effective evidence fields**, not raw database revision identity.
Historical-as-of supplement reconstruction is not newly attested. A
recorded dose/status is never proof of ingestion, benefit or safety.
The extra local SQL reads have no paid provider/model cost; no migration,
data write, main merge, production deployment or owner acceptance is implied.
