# PIQ-4.1 — First digestive cross-domain screen: sample-only Bristol patterns

**Status: development increment, synthetic CI/owner QA still gating. Not a verified personalized correlation or medical diagnosis.** All nine PIQ phases require formal owner acceptance.

## Contract and scope

Reuse PIQ-3 question-scoped focus, retrieved saved stool event IDs and their bounded (up to three dated days) Bristol types. Only add a derived screening evidence item when the owner specifically connects bowel concerns with water or fiber, not for general, water-only or unrelated questions. General Only bypasses it.

The marker reports observed saved Bristol 1–2 events among retrieved samples, the count of retrieved typed events, event records with unavailable types, explicitly logged zero bowel days, and co-presence of **displayed** water or verified fiber records on the same **sample dates**. Co-presence is not correlation; independent sampling can undercount coincident dates. No absence of recording is treated as no bowel movement, water or fiber. Today's data are provisional; a selected unresolvable, out-of-range or unsupported date/window blocks the derived marker.

Do **not** generalize the 3-day Bristol sample to the full interval. Do not describe recorded water events as total daily hydration, or unverified food as complete-day fiber. No presumption of dehydration, creatine causality, constipation diagnosis, low fiber relative to a medical target, or recommendation to lower calories. A real connection would require a registered, coverage-qualified relationship using aligned and appropriately lagged independent observations.

## Synthetic acceptance coverage

- Hard recorded Bristol 1 and 2, with no extra clinical claim.
- Explicit zero bowel day vs an unlogged day; missing Bristol types.
- Same-date water/fiber *sample presence* with no correlation claim; missing water or unverified fiber.
- General Only, water-only and unrelated question isolation.
- Historical out-of-range/ambiguous date handling without recent substitutions.
- Current-day provisional entry, partial Bristol type list and non-hard type observation.

## Deferred within PIQ-4.1

Robust whole-window stool type prevalence and 0–2-day lagged fiber/water associations require more than sampled three-day type joins; build the validated full-window, access-limited canonical retrieval, deduplication, event times, confounder checks and sufficient independent paired windows before those claims. Do not escalate this marker to Coach ranking, calorie adjustment or clinical triage. Live mobile/owner proof is blocked until runtime DB/Auth binding, private preview isolation, verified backup+restore and explicit owner approval.

Only the PIQ development branch changes. No schema/migration, owner health record, provider call or production deployment is changed by this increment.
