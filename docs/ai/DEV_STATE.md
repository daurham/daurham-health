# Dev state

Snapshot recorded 2026-09-27 after V2-G6 Multi-Angle Meal Photo Estimation. This commit is the current health application.

## Git

- Branch: `main`
- Baseline the task named: `89747d87a7aa17404b3d88d0f302db2c19c3934a` (“Keep interaction motion short so a Health fact stays the value it is.”)
- Parent of this snapshot: `fc3c7d8` (“docs: define V2-G6 multi-angle meal photos”)
- This commit treats several photos as one reviewed meal
- Finished tasks are committed and pushed
- Local annotated tag `v1.0.0` points at `7124ca513efa6c833457303ee6ff79d78344fce6`. Whether that tag exists on the remote is unknown

## Schema

- Migration head: `0033_nutrition_capture_images.sql`
- `npm run migrate` applied `0033_nutrition_capture_images.sql`
- Design manual version: 1.0.43
- Package version: 1.0.0
- No new runtime dependency
- V2-F remains complete. V2-G1 through V2-G5 remain implemented. Goal-observation suggestions remain deferred. Overnight vital metrics remain disabled until a payload is verified

## nutrition_capture_images

- Columns: `home_ai_job_id`, `position`, `source_filename`, `image_mime`, `image_bytes`, `content_sha256`, `created_at`
- Primary key `(home_ai_job_id, position)`
- `position` is 0, 1, or 2
- `image_mime` is `image/jpeg` or `image/png`
- `content_sha256` is 64 lowercase hex characters
- Unique `(home_ai_job_id, content_sha256)`
- `home_ai_job_id` references `nutrition_capture_jobs` with `ON DELETE CASCADE`
- No `user_id` column
- New Gemini meal jobs store their one to three photos only in this table

## Legacy image fallback

- `nutrition_capture_jobs.image_bytes` and `image_mime` stay
- Labels and historical one-photo meal jobs still use those columns
- For a meal job, child rows are authoritative when any exist and are not merged with the legacy column
- When a meal job has no child rows, position 0 falls back to the legacy columns
- There is no destructive backfill

## Client photo limits

- Count is 1 to 3
- Zero photos and a fourth photo are invalid
- Prepared-byte ceiling: `MEAL_PHOTO_SET_CLIENT_MAX_BYTES` = 3,800,000
- Multipart ceiling: `MEAL_PHOTO_SET_SERVER_MAX_BYTES` = 4,200,000
- Platform body limit: `MEAL_PHOTO_PLATFORM_PAYLOAD_LIMIT_BYTES` = 4,500,000
- Client ceiling is below the server ceiling, which is below the platform limit
- An oversize set fails locally and makes no API call
- A photo is not dropped to fit

## Preparation policy

- One photo in the set keeps long edge 2000, JPEG quality 0.86, fallback 0.78, and the 3,800,000-byte client ceiling
- `prepareMealPhoto` alone still uses `MEAL_PHOTO_CLIENT_MAX_BYTES` (4 MiB) for the older single-photo helper
- Two or three photos use long edge 1600, JPEG quality 0.82, fallback 0.7, and 1,200,000 bytes per photo
- Changing the count re-prepares the original files before upload
- JPEG and PNG inputs only. HEIC, HEIF, WebP, and GIF stay unsupported
- Prepared uploads may normalize to JPEG
- The set reuses `prepareImage`. There is no second codec and no new image dependency

## Multipart contract

- `POST /api/nutrition/meal/jobs` accepts `image0`, `image1`, and `image2`
- The current client always sends numbered fields, including a one-photo capture
- A lone legacy field named `image` is still accepted
- Legacy plus numbered fields is `MIXED_IMAGE_FIELDS`
- A gap, including `image3` alone, is `IMAGE_GAP`
- A fourth image is `TOO_MANY_PHOTOS`
- Each image is checked for JPEG or PNG magic. One invalid image rejects the request before persistence
- `userContext` and `provider` stay multipart fields
- `provider=home_ai` requires exactly one photo or returns 400 `MULTI_PHOTO_UNSUPPORTED` before any Home-AI call
- `provider=gemini` allows one to three photos

## Atomic persistence

- `persistMealCapture` inserts the job and each child image in one `sql.transaction`
- Gemini does not start during POST
- Polling still advances the job
- A failed image insert rolls the job back, so a queued job cannot exist with zero photos

## Ordering and duplicates

- Position 0, 1, and 2 are View 1, 2, and 3
- Gemini receives images in stored position order
- The app does not infer top or side labels
- An exact SHA-256 match of prepared bytes is rejected on the client and the server
- There is no perceptual match. Visually similar different angles are allowed

## Image API

- `GET /api/nutrition/meal/jobs/:id/image` returns the first image
- `GET /api/nutrition/meal/jobs/:id/images/:position` returns that view
- Positions outside 0–2 are HTTP 400 `INVALID_IMAGE`
- A missing stored image at a position other than 0 is 404
- Position 0 with no Health image, when the provider is not Gemini, can still proxy Home-AI
- Health does not claim a durable copy of a Home-AI image
- Owner auth is unchanged

## Job imageCount

- Responses include `imageAvailable` and `imageCount`
- Count is 0 when no image is stored, 1 for a legacy or single photo, and 1–3 for a multi-photo Gemini job
- A Home-AI job that exposes one image may report count 1
- JSON does not include raw bytes or base64

## Gemini image array

- `NutritionGeminiRequest` and `GeminiGenerateRequest` accept `images`
- The singular `image` field remains for a one-image request
- `geminiInlineParts` sends the prompt text, then one inline image part per view, in order
- Labels stay one image
- Ask Health, Weekly Coach, literature, and experiment suggestions stay text-only

## Meal prompt

- `mealPhotoPrompt(userContext, imageCount)`
- Prompt version `meal-photo-v2` is stored in interpretation metadata
- When `imageCount` is greater than 1, the prompt says the images are the same meal unless the owner context says otherwise, that the views are used together, that the same food must not be counted twice, and that unseen food must not be invented
- The single-photo sentences and the existing JSON shape stay
- Output remains one `MealEstimateCandidate`
- The prompt does not require per-image foods, confidence percentages, or bounding boxes

## ai_usage hash

- One multi-angle analysis is one provider call and one reservation
- `request_type` stays `nutrition_meal_photo`
- A retry is a second reservation, not one reservation per image
- The hash is SHA-256 of `requestType`, model, prompt, and one SHA-256 digest per image, joined by newlines
- A request with no images still appends an empty digest so description hashes stay the same
- Changing order or any image bytes changes the hash
- The ledger stores the hex hash only
- `AI_NUTRITION_MEAL_MAX_REQUEST_COST_USD` was not raised
- Actual cost is still clamped to the reservation
- Three-image token cost stays inside that existing meal reservation
- There is no second wallet

## Home-AI boundary

- Home-AI meal capture accepts one image
- The external Home-AI service was not modified
- Single-photo Gemini and single-photo Home-AI remain
- A multi-photo set is not sent as only the first photo
- Multi-photo failure offers Retry Gemini, Edit context, Build meal manually, and Discard capture
- It does not offer Try local AI
- The message is: “Local AI can review one photo. This capture has several views, so retry Gemini or build the meal manually.”
- One-photo failure still offers Try local AI

## Reanalysis

- Gemini reanalysis requeues the same job and does not rewrite `nutrition_capture_images`
- The next attempt loads the full stored set and gets a new reservation
- A context-only change does not replace the images
- Multi-photo reanalysis to Home-AI throws `MULTI_PHOTO_UNSUPPORTED` before `createHomeAiMealJob`
- One-photo Home-AI reanalysis uses the single stored image, from a child row or the legacy column
- A Home-AI job with no local image still fails as `MISSING_IMAGE`

## UI

- Capture holds one to three views, each with replace and remove
- Adding or removing a view re-prepares the set
- Add, replace, and remove are blocked once a job exists
- Working copy says it is estimating nutrition from N photos
- Review shows one image as a single preview
- More than one image shows the selected view plus thumbnail buttons
- There is no carousel library
- The candidate and nutrient review are unchanged
- Allowed context copy: “Add another angle to give the estimate more visual context.”

## Canonical Nutrition

- Commit schemas are unchanged
- `commitNutritionMealEstimateRequestSchema` has no `imageCount`
- Saving writes the reviewed nutrients the owner chose
- Image count, angle labels, and per-photo observations are not stored on `nutrition_entries`
- Dismiss deletes the job, and child rows cascade

## Backup and portable export

- `nutrition_capture_images` is operational and `portable: false`
- It is restored immediately after `nutrition_capture_jobs`
- Primary key is `home_ai_job_id` and `position`
- `image_bytes` is bytea and is base64-encoded in the archive, same as other bytea columns
- Portable export does not include photo bytes
- Committed captures stay in the full backup

## Demo, auth, and privacy

- The demo stays provider-free and does not upload photos
- Demo meal capture stays a prepared sample
- Owner routes stay behind owner auth
- Image bytes, raw user context, and request bodies are not logged
- A multi-photo set goes only to Gemini
- Europe PMC and Home-AI do not receive a multi-photo set

## Validation

- Tests: 947 passing across 111 files
- `npx tsc -b` passed
- `npx eslint .` passed
- `npm run build` passed. The existing Vite chunk-size warning remains
- Migration `0033_nutrition_capture_images.sql` applied

## Manual QA

- Demo Nutrition opened the prepared meal-photo sample and closed it again. The sample lists rolled oats, blueberries, and Greek yogurt. It does not claim that more photos make calories accurate
- Owner Nutrition showed the lock screen: “Private Health data”
- Sign-in rendered the email and password form
- At 390px, demo Nutrition did not overflow, the bottom nav stayed 390px wide, and the sample still opened. Sign-in at 390px did not overflow
- Live Gemini, a real multi-photo upload, and owner review were not exercised. The owner lock screen blocks that path without a session. Injected ledger and provider tests cover the provider path

## Deviations

- None. The meal cost ceiling was left at its existing default

## Remaining V2-G work

- Native iOS share-sheet targeting is deferred
- Route geometry and nested Health Auto Export workout telemetry stay deferred
- No correction or deletion lifecycle for Health Auto Export workouts
- Goal-observation experiment suggestions and overnight vital metrics remain deferred from earlier slices
- Recipe assistance and richer contextual meal estimation, beyond multi-angle photos, remain ideas
