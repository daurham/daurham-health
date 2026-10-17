# PIQ-4.2 — Canonical working-set final source consistency (development only)

## Scope

A Training session may remain unchanged while the owner edits a working
set's load, repetition count, left/right measurements, set type, ordering or
exercise grouping. The preceding two-source session agreement does not detect
this. Before selected current personalized strength evidence is assembled,
a final local SQL read now compares all original canonical sets inside the
selected Health-date range with the current set rows. The same Progress mapper
is reused for each view so that the check agrees on the displayed semantics.
Rows are compared by stable set identity and ALL mapped fields, not selected
best-set values alone. Insertions, deletions, replacements, malformed or
duplicate identities, changed content and unavailable reads fail closed.

For current personalized General/Training lens responses, all selected-date
sets are checked (including previously empty sets). For other lenses with an
unambiguous focused exercise, only that exercise's sets are checked. When no
set-dependent evidence is needed, no additional SQL runs. An explicitly
historical as-of request is NOT described as source-verified by this current
check.

On conflict, both generic Training trends and exact-exercise appearances are
withheld; shared Intelligence Training facts, interventions and relationships
using Training are also withheld. Current focused weight/energy cross-signal
interpretation cannot use a conflicting Training source as an escape hatch.
The packet provides a non-substantive, privacy-safe boundary, and the cache
fingerprint changes with evidence selection.

## Limits

Exactly one additional bounded, read-only local SQL query per eligible
current personalized strength-evidence request; no paid AI provider calls,
schema migrations or production writes. Source verification remains optimistic,
not an atomic snapshot or an audit of edits after the final read. The current
check does not independently attest exercise-definition metadata edits,
set revisions for unrelated historical as-of periods, adherence, recovered
strength, exercise comparability, or any medical/deficit claim. Existing
canonical data-quality exclusion and Goal Control rules remain authoritative.
All owner preview and release gates remain pending.
