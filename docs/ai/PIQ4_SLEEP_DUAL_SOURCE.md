# PIQ-4.2 — Sleep Progress vs shared Intelligence read agreement

**Status:** development-only safeguard, no owner acceptance implied.

On current personalized Ask Health requests, the Sleep Progress view and
shared Health Intelligence separately read `sleep_nightly_summaries`.
Before this change, a source correction between those reads could leave
conflicting eligible sleep durations in the same evidence packet, and a
Sleep-linked relationship could survive after the direct Sleep number changed.

`reconcileAskSleepSources` now compares all in-range completed and eligible
nightly totals from the first source with the dated source-identified
`sleep.total_minutes` intelligence frame. The canonical nightly summary
row ID now also flows through the existing Progress read and must exactly
agree with the row ID in Intelligence; same-duration row replacement fails. It checks date scope, Health
timezone, unique sleep date, analysis eligibility, partial/in-bed-only
status, total minutes, signal unit and row provenance. The recorded zero is
not replaced by a missing observation. On mismatch (or an incompatible
source scope/identity) it returns `changed_or_unavailable`.

The packet withholds its direct generic Sleep evidence (duration, baseline,
stages and source attribution) and all shared Intelligence Sleep signal
coverage, baseline, related interventions, and entire relationships with
a Sleep operand, including linked knows/missing summary entries. A neutral,
privacy-safe non-substantive warning explains why missing/contradictory
records cannot support a Sleep or recovery conclusion. Other well-sourced
Activity, Nutrition, Training and Context evidence remains available.
The packet fingerprint includes the selected evidence and changes on conflict.

**Performance:** ZERO extra SQL queries; this reconciles two already-loaded
views. **Limitations:** it is not an atomic or final revision attestation
and does NOT cross-check sleep stages, source switches, duration baselines
outside the selected window, sleep-vital samples or device accuracy. Those
claims are withheld on source conflict but otherwise retain their existing
per-domain quality rules. Historical as-of and General Only are not asserted
to be current-verified. No paid model calls, database migrations, clinical
claim, owner data access by developer or main/production deployment.
