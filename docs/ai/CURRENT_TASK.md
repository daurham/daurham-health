# Current Task — V2-G6 Multi-Angle Meal Photo Estimation

Status: ready_for_implementation

Baseline commit:

89747d87a7aa17404b3d88d0f302db2c19c3934a

Expected baseline:

- V2-F complete
- V2-G1 ongoing Apple workout ingestion complete
- V2-G2 Body Inbox + Shortcut Capture complete
- V2-G3 Theme Packs + Appearance complete
- V2-G4 Nutrition Gemini durable cost safety complete
- V2-G5 Motion + Micro-Interactions complete
- 939 tests passing across 110 files
- typecheck, lint, and production build passing
- schema head 0032_body_capture_inbox.sql
- Design manual 1.0.42
- package 1.0.0

Follow AGENTS.md and the persistent files under docs/ai/.

## Objective

Implement the first bounded “Richer meal estimation” slice:

One Nutrition meal-photo capture may contain one, two, or three photos of the same meal so Gemini can use multiple angles to estimate the plate.

The owner still reviews and may edit the resulting estimate before anything becomes canonical Nutrition data.

Core flow:

1–3 photos of the same meal
→ deterministic client preparation
→ one Nutrition capture job
→ one Gemini meal-estimation request containing all views
→ existing candidate schema
→ owner review
→ existing deterministic Nutrition commit

Multi-angle is evidence for one meal, not multiple meals.

## Why this is bounded

Do not redesign Nutrition.

This task adds only:

- a bounded meal photo set;
- durable operational storage for those photos;
- one Gemini request that can contain multiple image parts;
- UI to add/remove/review up to three angles;
- stored-photo reanalysis for Gemini.

It does not add a new food ontology, another model provider, automatic logging, or new canonical meal fields.

## Provider boundary

Multi-angle analysis is supported by Gemini only in G6.

The current Home-AI Nutrition meal API accepts one image.

Do not modify the external Home-AI service as part of this repository task.

Therefore:

- single-photo Gemini remains supported;
- single-photo Home-AI remains supported;
- multi-photo Gemini is supported;
- multi-photo Home-AI is not supported;
- a multi-photo job must not silently send only the first photo to Home-AI.

If a multi-photo Gemini attempt fails, the UI may offer:

- Retry Gemini
- Edit context
- Build meal manually
- Discard capture

Do not show “Try local AI” for a multi-photo job unless a future Home-AI contract explicitly supports the full image set.

For a one-photo job, existing Home-AI fallback behavior remains.

## Vercel request-size boundary

This app uses one Vercel function.

Vercel Functions currently reject request bodies above 4.5 MB.

Official reference:

https://vercel.com/docs/errors/function_payload_too_large

Do not add Vercel Blob, S3, or another storage service in G6.

Instead, the browser must prepare the complete multi-photo request to fit comfortably below the platform ceiling.

Use an application-level total prepared-photo ceiling no greater than:

3,800,000 bytes

before multipart overhead.

Server multipart parsing for the multi-photo meal route should use a correspondingly bounded request ceiling below Vercel’s hard limit, for example about 4,200,000 bytes.

Exact constants may follow repository naming conventions, but:

- client total must be less than server total;
- server total must be less than 4.5 MB;
- tests must assert the relationship.

Do not rely on Vercel’s 413 as normal validation.

## Photo count

Allowed meal photo count:

1–3

Zero images is invalid.

More than three is invalid.

This is intentionally small.

Do not turn the capture into an image gallery.

## Client preparation

Extend the current prepare-meal-photo architecture.

Do not send raw iPhone photos directly.

Create a deterministic multi-photo preparation policy that preserves useful meal detail while keeping the total set under the G6 byte ceiling.

Prefer reusing prepareImage rather than writing a second canvas codec.

Suggested multi-photo policy:

- JPEG output
- bounded long edge
- bounded primary/fallback JPEG quality
- per-photo prepared byte ceiling
- total-set byte ceiling
- EXIF orientation handled through the existing codec

The exact quality/long-edge values may be chosen by implementation after inspecting existing tests, but they must be explicit constants and covered by tests.

Important:

- existing single-photo preparation quality should not regress unnecessarily;
- when a second/third photo is added, the resulting set must still satisfy the multi-photo total ceiling;
- if implementation needs to re-prepare an earlier selected photo under the set policy, do so before upload;
- do not silently drop a photo to fit the request.

If the set cannot fit after the bounded preparation policy:

show a clear local error and make zero API calls.

## Supported image formats

Keep current input support:

- JPEG
- PNG

HEIC/HEIF/WebP/GIF remain unsupported unless the existing generic browser codec already explicitly supports them.

Do not add a new image-decoding dependency.

Prepared multi-angle uploads may normalize to JPEG exactly as the current meal-photo path does.

## Duplicate photos

Do not let the same prepared image occupy two positions in the same capture.

Use SHA-256 of prepared image bytes for deterministic exact-duplicate detection.

Exact duplicate images in one request should be rejected locally where practical and revalidated on the server.

Do not use perceptual/fuzzy image matching.

Two genuinely different angles of the same plate are allowed even if visually similar.

## Upload contract

Keep the existing endpoint:

POST /api/nutrition/meal/jobs

Do not add another Vercel function.

The new client may send numbered file fields:

- image0
- image1
- image2

The server should also preserve backward compatibility with the existing single field:

- image

Rules:

- legacy image alone => one-photo capture;
- numbered fields => contiguous image0..imageN;
- do not accept both legacy image and numbered images in one request;
- gaps such as image0 + image2 without image1 are invalid;
- max three;
- all images independently pass current JPEG/PNG validation.

userContext and provider remain normal multipart fields.

For provider=home_ai:

- exactly one photo is required;
- multi-photo request returns a clear 400-class unsupported-provider/capture response;
- no Home-AI request is made.

For provider=gemini:

- one to three photos allowed.

## Schema

Add migration:

0033_nutrition_capture_images.sql

Expected schema head after G6:

0033_nutrition_capture_images.sql

### Table

Add an operational child table, preferably:

nutrition_capture_images

Suggested shape:

- home_ai_job_id TEXT NOT NULL
  - references nutrition_capture_jobs(home_ai_job_id)
  - ON DELETE CASCADE
- position INTEGER NOT NULL
- source_filename TEXT NULL
- image_mime TEXT NOT NULL
- image_bytes BYTEA NOT NULL
- content_sha256 TEXT NOT NULL
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()

Primary key:

(home_ai_job_id, position)

Constraints:

- position >= 0
- position < 3
- image_mime is one of the supported stored MIME values
- content_sha256 is a bounded SHA-256 hex digest
- exact duplicate content within one job is not allowed

A unique constraint such as:

(home_ai_job_id, content_sha256)

is appropriate.

No user_id.

## Existing image columns

nutrition_capture_jobs currently has:

- image_bytes
- image_mime

Do not drop those columns in G6.

They remain the legacy/single-image storage used by existing Nutrition label captures and historical meal jobs.

New Gemini meal-photo jobs should store their one-to-three image set in nutrition_capture_images.

Existing pre-G6 meal jobs must remain readable through fallback to the legacy image columns.

Nutrition label behavior remains on its existing single-image storage unless there is a compelling implementation reason to generalize internally without changing label behavior.

Do not migrate label photos into the new table merely for symmetry.

No destructive backfill is required.

## Storage API

Refactor the operational image helpers so code can ask for a meal image set.

Prefer functions conceptually like:

- saveMealCaptureImages(jobId, images)
- listMealCaptureImages(jobId)
- getMealCaptureImage(jobId, position)
- mealCaptureImageCount(jobId)

For a meal job:

1. if child image rows exist, they are authoritative for that job;
2. otherwise position 0 may fall back to legacy nutrition_capture_jobs.image_bytes/image_mime.

Do not merge both stores into a larger set for the same job.

This keeps historical single-photo rows readable without duplicating them.

## Atomic job creation

For a new Gemini meal capture:

creating the nutrition_capture_jobs row and saving all child images must be atomic or equivalently failure-safe.

Do not leave a queued Gemini job with zero photos because image insert 2 of 3 failed.

Preferred:

one database transaction containing:

- job row insert
- image row inserts

If current SQL helper boundaries make that impractical, implement explicit cleanup on failure and test it.

Atomic transaction is preferred.

Do not begin Gemini analysis during POST creation.

Existing polling/GET-driven processing remains.

## Image ordering

Position is deterministic and owner-visible:

- 0 = first/primary view
- 1 = second view
- 2 = third view

Gemini receives images in stored position order.

The UI may call them:

- View 1
- View 2
- View 3

Do not infer semantic camera-angle labels such as top/side unless the owner explicitly supplies them.

## Image endpoint

Preserve the existing first-image URL behavior:

/api/nutrition/meal/jobs/:id/image

It should continue to return the first/only image for backward-compatible UI and old links.

Add bounded indexed access for additional views using either:

- /api/nutrition/meal/jobs/:id/images/:position

or a repository-consistent equivalent.

Do not accept arbitrary file paths or keys.

Owner auth remains required.

Valid positions are only 0–2.

For Home-AI jobs, only position 0 can exist through the current provider API.

## Job response

Extend the existing NutritionMealJobResponse additively.

Keep:

- job.imageAvailable

Add:

- job.imageCount

Semantics:

- imageCount = 0 when no image can be retrieved;
- 1 for existing single-photo jobs;
- 1–3 for stored multi-photo jobs.

Do not send raw photo bytes/base64 in JSON job responses.

## Gemini request shape

Generalize the internal Nutrition Gemini generate request so it can carry an ordered bounded list of images.

Conceptually:

images?: Array<{
  mimeType: string
  base64: string
}>

It is acceptable to preserve the old singular image property internally for backward compatibility, but there must be one normalized provider-request path.

Gemini generateContent should receive:

- prompt text
- image part 0
- image part 1
- image part 2

in deterministic order.

Label interpretation still sends one image.

Ask Health, Weekly Coach, Literature, and Experiment Suggestions remain text-only.

Do not accidentally make their requests participate in Nutrition image handling.

## Meal prompt

Update the deterministic meal-photo prompt so multiple images are explicitly treated as multiple views of the same meal.

The prompt must tell Gemini:

- all images show the same meal unless owner context says otherwise;
- use the views jointly to improve food identification/portion estimation;
- do not count the same food twice because it appears in several views;
- do not invent unseen food;
- hidden oils/sauces remain uncertainty;
- output the existing MealEstimateCandidate-compatible JSON shape.

Single-photo behavior should remain compatible.

Add a bounded prompt/version constant for this semantic change if the current Nutrition architecture can carry it cleanly.

Preferred version:

meal-photo-v2

Store the prompt/version in operational interpretation metadata if that does not require schema change.

Do not put prompt text into the database.

## Gemini durable usage

G4 remains authoritative.

One multi-angle Gemini analysis is one provider call, therefore:

- one ai_usage reservation for that attempt;
- request_type remains nutrition_meal_photo;
- automatic retry is a second reservation;
- shared AI_MONTHLY_BUDGET_USD;
- shared provider rate gate;
- Home-AI remains outside ai_usage.

Update the request hash so it incorporates, in order:

- request type
- model
- prompt
- SHA-256 digest of image 0
- SHA-256 digest of image 1
- SHA-256 digest of image 2

as applicable.

The database receives only the final request hash, not the image digests array or raw images.

Changing image order may change the request hash.

Changing any image bytes must change the request hash.

Do not add one ai_usage row per image.

## Cost ceiling

Continue using the existing Nutrition meal Gemini reservation field:

AI_NUTRITION_MEAL_MAX_REQUEST_COST_USD

Do not create a second monthly wallet.

If tests/known provider accounting show the existing default reservation is insufficient for the bounded three-image request, document and adjust the default deliberately.

Do not silently let actual provider cost exceed the durable reservation ceiling.

## Reanalysis

Gemini reanalysis of a G6 job must reuse the full stored image set.

Changing only user context and choosing Reanalyze:

- does not rewrite images;
- requeues the same job;
- next Gemini attempt receives all stored views;
- next attempt gets a new ai_usage reservation.

A one-photo legacy meal job may reanalyze through its fallback legacy image.

A multi-photo job cannot be reanalyzed with Home-AI in G6.

Return a clear unsupported message before calling Home-AI.

Single-photo Home-AI behavior remains unchanged.

## Current Home-AI jobs

Do not migrate Home-AI-owned image storage into Health in G6.

Existing Home-AI job polling and image proxy behavior remains.

If an existing Home-AI job exposes one image:

- imageCount may be 1;
- position 0 works through existing proxy/fallback;
- positions >0 are unavailable.

Do not claim Health has a durable copy when it does not.

## UI — capture

Update MealCaptureSheet.

The first-photo flow stays fast:

- Take photo
- Choose photo

After one photo is prepared, preview state should allow:

- Analyze meal
- Add another angle
- remove/replace selected views before analysis
- context note

Maximum three.

Keep a compact preview grid/list.

At 390px:

- no horizontal overflow;
- previews remain easy to tap;
- remove actions have usable touch targets.

Do not require three photos.

One photo remains the normal fast path.

## UI — provider choice

With one selected photo:

- existing Gemini flow remains;
- Home-AI fallback remains available through existing failure/retry behavior.

With two or three selected photos:

- Analyze meal uses Gemini;
- do not offer local AI as though it can see every angle.

If current UI does not expose a provider selector before analysis, do not add a large new selector solely for G6.

Keep the normal primary action Gemini-oriented.

## UI — working / failure

While working:

- show the selected/stored photo count;
- previews may remain visible;
- no fake progress percentage.

On a multi-photo failure:

- Retry Gemini
- Edit context
- Build manually
- Discard

Do not show Try local AI for multi-photo.

On a single-photo failure, preserve existing retry/local-AI behavior.

## UI — review

Review estimate should make it obvious what evidence was used.

For imageCount=1:

- current single image presentation is fine.

For imageCount>1:

- show compact thumbnails or a small selectable preview;
- do not render three huge images stacked vertically;
- no carousel dependency.

The review candidate and editable nutrient values remain exactly the current model.

Do not create per-image estimates.

## Canonical Nutrition boundary

Nothing canonical changes until owner commit.

The photo set is operational evidence only.

The existing commit path remains authoritative for:

- meal name
- calories
- protein
- carbs
- fat
- fiber
- portion scale
- meal label
- snapshot semantics
- meal group / source provenance

Do not persist:

- image count
- angle labels
- per-photo observations

into nutrition_entries merely because the capture used multiple photos.

Canonical history stores the reviewed result, not model-image internals.

## Candidate schema

Keep the existing MealEstimateCandidate schema unless a narrowly necessary backward-compatible field is justified.

Do not require Gemini to emit:

- per-image foods
- per-angle confidence
- image-quality scores
- certainty percentages
- bounding boxes

The current reviewable whole-meal estimate remains the product contract.

## No accuracy claims

Do not claim multi-angle photos are “accurate” or scientifically validated.

Product copy may say:

- “Add another angle to give the estimate more visual context.”

Do not say:

- “Three photos makes calories accurate.”
- “Multi-angle guarantees better portions.”

The output is still an estimate requiring owner review.

## Dismiss / commit retention

Existing nutrition_capture_jobs operational retention semantics remain.

When a noncommitted capture is dismissed:

- child image rows disappear through ON DELETE CASCADE.

When a capture is committed:

- keep the operational capture/image evidence under the current full-backup policy;
- do not add it to portable export.

Do not invent a photo-retention cleanup policy in G6.

## Backup / restore

Add nutrition_capture_images to the authoritative full backup inventory.

Classification:

operational

Portable:

false

Restore order:

nutrition_capture_jobs
→ nutrition_capture_images

Verify:

- one-photo new Gemini meal capture restores;
- three-photo capture restores in order;
- exact bytes/MIME/digests round-trip;
- legacy meal job with image_bytes still restores and remains readable;
- label image backup behavior is unchanged.

Do not put photo bytes in portable export.

## Demo

Demo remains provider-free and read-only.

Do not add real image uploads to demo.

A compiled multi-angle UI example is optional, but no fabricated “AI accuracy” claim.

It is acceptable for demo meal capture to remain disabled/read-only if current demo behavior already does so.

## Auth / privacy

All meal capture/image routes remain owner-only.

Photos are private health/lifestyle data.

Do not log:

- image bytes/base64
- raw userContext
- request bodies

Do not send the images anywhere except the explicitly selected provider.

For multi-angle in G6 that provider is Gemini.

No Europe PMC, Home-AI, or other service receives a multi-photo set.

## Tests required

Add focused tests covering at least:

1. one numbered image parses.
2. two numbered images parse in order.
3. three numbered images parse in order.
4. zero images rejects.
5. fourth image rejects.
6. gaps in numbered fields reject.
7. mixing legacy image with image0 rejects.
8. legacy image-only request remains valid.
9. every image validates JPEG/PNG independently.
10. one invalid image rejects the whole request before job persistence.
11. exact duplicate image bytes in a set reject.
12. client multi-photo set count max is three.
13. client total prepared bytes stay under the accepted G6 ceiling.
14. server multipart ceiling is below Vercel 4.5 MB.
15. client ceiling is below server ceiling.
16. oversize set makes zero API calls.
17. new child table has no user_id.
18. child table references nutrition_capture_jobs and cascades on delete.
19. position is bounded 0–2.
20. duplicate content digest is unique per job.
21. new Gemini one-photo meal job stores one child image.
22. new Gemini three-photo job stores three child images atomically.
23. failed image persistence does not leave a queued zero/incomplete-photo job.
24. existing legacy meal image remains readable when no child rows exist.
25. child rows are authoritative when they exist.
26. label image storage behavior remains unchanged.
27. first-image endpoint still works for a G6 job.
28. indexed image endpoint returns positions 0–2 only.
29. multi-photo job response reports imageCount=3.
30. old single-photo job reports imageCount=1 when image is available.
31. JSON job response contains no raw image bytes/base64.
32. Gemini request contains all image parts in position order.
33. Gemini prompt says multiple views are one meal and forbids double counting.
34. single-photo Gemini still uses the same candidate schema.
35. request hash changes when any image changes.
36. request hash changes when image order changes.
37. raw image bytes/digests are not stored as ai_usage payload fields.
38. one multi-photo Gemini call creates one reservation.
39. retry creates a second reservation, not one per image.
40. shared monthly budget/rate behavior from G4 remains.
41. multi-photo Home-AI request is rejected before provider call.
42. one-photo Home-AI behavior remains.
43. Gemini reanalysis reuses all stored images.
44. changing context alone does not rewrite child images.
45. multi-photo reanalysis to Home-AI is rejected.
46. multi-photo failure UI does not offer local AI.
47. single-photo failure UI still may offer local AI.
48. review UI can address all stored images without a new carousel dependency.
49. canonical meal commit payload/schema is unchanged.
50. commit does not write image count/angle metadata into nutrition_entries.
51. dismiss cascades child images.
52. nutrition_capture_images is full-backup operational data.
53. nutrition_capture_images is excluded from portable export.
54. backup/restore preserves image order and bytes.
55. existing nutrition_capture_jobs backup remains compatible.
56. demo remains provider-free/read-only.
57. no new external storage/runtime dependency.
58. G4 cost-safety tests remain green.
59. G5 motion/reduced-motion tests remain green.
60. full G1–G5 and F1–F5 regressions remain green.

Run:

- npm test
- npx tsc -b
- npx eslint .
- npm run build

Apply migration only after migration/tests are ready.

## Manual QA

When owner/Gemini runtime is available:

1. Open Nutrition → Meal photo.
2. Take one photo and verify the current fast path still works.
3. Start another capture.
4. Take first photo.
5. Add a second angle.
6. Add a third angle.
7. Verify thumbnails/previews show three distinct views.
8. Remove one and add it again.
9. Add optional context.
10. Analyze with Gemini.
11. Verify one job is created.
12. Verify one ai_usage reservation for that provider attempt.
13. Verify review shows all stored views and one meal estimate.
14. Edit calories/macros and save.
15. Verify canonical Nutrition log matches reviewed values only.
16. Verify no image metadata was added to the Nutrition entry.
17. Reanalyze an uncommitted multi-photo job with different context.
18. Verify all stored images are reused.
19. Verify another ai_usage row is created for the new Gemini attempt.
20. Force a retryable Gemini failure and confirm “Try local AI” is not offered for the multi-photo job.
21. Verify a one-photo failure still supports existing local-AI fallback.
22. Attempt an oversize prepared set and verify the request is blocked client-side.
23. Check 390px capture/review layout.
24. Verify Light/Dark/palettes and reduced motion remain functional.
25. Run full automated validation.

If live Gemini QA is unavailable, cover provider requests with injected test provider/ledger and report the gap accurately.

## Documentation

On completion:

- update HEALTH-PLATFORM-DESIGN-MANUAL.md
- expected Design Manual version 1.0.43
- append a historical ledger row; do not rewrite older rows
- update HEALTH-PLATFORM-V2-LAB-BLUEPRINT.md with V2-G6 Multi-Angle Meal Photo Estimation
- update docs/ai/PROJECT.md
- update docs/ai/DEV_STATE.md
- update docs/ai/DECISIONS.md
- update docs/ai/ROADMAP.md
- update docs/V2-ROADMAP.md to mark the multi-angle portion of Richer meal estimation implemented
- document Vercel upload ceiling and application-level total-photo ceiling
- document Gemini-only multi-photo support
- document child-image operational storage and legacy fallback
- document that canonical Nutrition semantics are unchanged

Expected schema head:

0033_nutrition_capture_images.sql

Package remains:

1.0.0

## Acceptance criteria

V2-G6 is complete only when:

- one to three photos can represent one meal capture;
- single-photo behavior remains fast and backward compatible;
- the client prepares a bounded set under the Vercel payload ceiling;
- oversize sets fail before API call;
- new Gemini meal jobs durably store ordered child images;
- historical legacy meal images remain readable;
- labels remain single-photo and unchanged;
- one Gemini request receives all meal views in deterministic order;
- the prompt treats views as the same meal and forbids double counting;
- one provider attempt creates one G4 ai_usage reservation;
- retries get separate reservations;
- multi-photo Home-AI is explicitly unsupported rather than silently degraded;
- Gemini reanalysis reuses the full image set;
- review remains one editable meal estimate;
- canonical Nutrition commit semantics do not change;
- child images are full-backup operational data and not portable;
- no new external storage/service is added;
- auth/privacy boundaries remain correct;
- tests pass;
- typecheck passes;
- lint passes;
- production build passes;
- migration 0033 is applied;
- docs are updated.

## Required completion report

Update docs/ai/DEV_STATE.md with:

- baseline commit
- resulting commit / working-tree state
- migration/schema head
- nutrition_capture_images schema
- legacy image fallback behavior
- client photo-count/byte limits
- exact preparation policy
- multipart field contract
- atomic job/image persistence
- image ordering/deduplication
- image API behavior
- job imageCount behavior
- Gemini internal image-array behavior
- meal prompt/version behavior
- ai_usage request-hash behavior
- one-call/one-reservation behavior
- Home-AI boundary
- reanalysis behavior
- UI capture/review behavior
- canonical Nutrition boundary
- backup/portable export
- demo/auth/privacy
- tests/count
- typecheck/lint/build
- migration application
- manual QA
- docs version
- deviations
- remaining V2-G work

When finished, reset CURRENT_TASK.md to the standard no-active-task template, commit, and push according to AGENTS.md.

## Final invariant

Several photos may give Gemini more views of one meal.

They never become several meals, they never bypass owner review, and they never change the rule that the canonical Nutrition record is the reviewed value the owner chose to save.
