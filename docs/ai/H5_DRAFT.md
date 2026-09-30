# V2-H5 draft — Pantry + Exercise Library + Flexible Programmed Workouts

This is the next implementation slice after H4 visual closeout. It records owner-requested functional work without mixing it into the H4 experience-system acceptance gate.

## Product intent

H5 makes two existing canonical catalogs directly manageable:

- Nutrition’s saved food definitions become a visible **Pantry**.
- Training’s exercise definitions become a visible **Exercise Library**.

It also makes programmed workouts less rigid by allowing one-session-only extra exercises and adds one built-in beginner calisthenics routine.

The design principle is:

> **Manage reusable definitions in a catalog; preserve historical snapshots when definitions later change or are archived.**

---

## H5A — Pantry

### Existing authority

Do not invent a second food store.

`nutrition_foods` is already the reusable food-definition authority. Pantry is a management UI over that table/API.

Historical `nutrition_entries` remain immutable snapshots of what was logged at the time. Editing a Pantry food must not rewrite old entries.

Recipes remain managed by the existing Recipes system.

### Route / navigation

Add owner route:

`/nutrition/pantry`

Nutrition header actions become:

- Pantry
- Recipes
- Add food

On mobile, keep these compact without causing horizontal overflow. Pantry and Recipes may be quiet/secondary actions while Add food stays primary.

### Pantry contents

Default view lists active reusable non-recipe foods:

- ingredient
- packaged
- custom

Do not duplicate Recipe rows into Pantry’s normal list.

Support:

- search by food name/brand;
- optional filters for Ingredients / Packaged / Custom / Staples;
- archived toggle/view;
- useful serving/macros summary in each row;
- source label only when useful for debugging/provenance, not as visual noise.

### Pantry CRUD

Support:

- add a new manual reusable food;
- edit existing food values;
- mark/unmark Staple;
- remove from Pantry;
- restore an archived food.

“Delete” in the owner UI means **archive**, not physical deletion.

Reason:

- old Nutrition entries may reference the food id;
- recipes/other provenance may reference it;
- historical logs already store snapshots and must remain valid.

Archived foods:

- disappear from normal logging/search;
- remain available in Pantry’s archived view;
- can be restored.

Use the existing Nutrition food schemas and `FoodEditorSheet` where practical rather than creating duplicate macro-edit logic.

If existing GET `/api/nutrition/foods` cannot list archived rows cleanly, extend it with explicit management query options rather than creating a duplicate storage authority.

No Pantry schema migration should be required unless a discovered constraint makes it unavoidable.

---

## H5B — Exercise Library

### Route / navigation

Add owner route:

`/training/exercises`

Training top actions should include:

- Start workout
- Exercises
- Manage routines
- Import workout photo

Keep mobile wrapping/priority sensible.

### Catalog view

List all exercise definitions with:

- name;
- active/archived state;
- measurement family;
- load/equipment type;
- unilateral state where relevant;
- media availability icon(s);
- built-in vs owner-created provenance.

Support search and useful filters such as:

- active / archived;
- reps / duration / distance / skill;
- bodyweight / free-weight / cable-machine / other.

### Existing CRUD foundation

The backend already supports owner-created exercise create/update/archive. H5 should generalize this into an explicit Library experience rather than duplicating it.

### Editing safety

Exercise definitions participate in historical analytics. Editing semantics after use can reinterpret old sets, so H5 must distinguish **presentation fields** from **measurement semantics**.

Presentation fields may be edited for any exercise:

- display name;
- GIF URL;
- YouTube URL;
- form description/instructions;
- notes.

Semantic fields:

- measurement kind;
- load type;
- unilateral behavior / analytics-related semantics.

Rules:

- owner-created exercise with no historical use: semantic fields may be edited;
- once an exercise has historical use: semantic fields are locked; create a new exercise if the measurement semantics need to change;
- seeded/built-in exercises keep their canonical semantic fields locked;
- presentation fields on seeded exercises remain editable.

This preserves analytics correctness while still allowing the owner to improve the Library.

### Delete/archive

“Delete exercise” means archive.

Archive may apply to seeded or owner-created exercises.

Archived exercise definitions:

- remain in historical sessions;
- remain resolvable for old Progress evidence;
- disappear from normal new-workout/routine pickers;
- appear in the Exercise Library archived filter;
- can be restored.

Do not physically delete an exercise definition referenced by Training history.

### Exercise media / instruction fields

Add explicit durable fields to `exercise_definitions`:

- `gif_url TEXT NULL`
- `youtube_url TEXT NULL`
- `form_instructions TEXT NULL`
- `notes TEXT NULL`

Use bounded text constraints.

URLs should be validated as HTTP(S) presentation URLs. Do not fetch/proxy/store remote media bytes in H5.

YouTube URL is a link, not an embedded autoplay requirement.

GIF is optional.

Migration target:

`0041_exercise_library_calisthenics.sql`

Update:

- row/domain schemas;
- server columns;
- backup/full + portable inventory;
- restore round trip;
- demo fixtures where needed.

### Seeded form library for existing exercises

H5 should not add empty form fields and make the owner manually populate every built-in exercise.

Migration 0041 must seed concise, practical `form_instructions` for **every existing built-in exercise where technique/form guidance is meaningful**, including the current EX01–EX19 catalog and every new calisthenics exercise added by H5.

Current built-ins to cover:

- Box Squat
- Barbell Bench Press
- Cable Row
- Dumbbell Romanian Deadlift
- Dumbbell Curl
- Cable Triceps Pressdown
- Farmer Carry
- Goblet Squat to Bench
- Incline Dumbbell Press
- Hip Thrust
- Reverse Lunge
- Hammer Curl
- Suitcase Carry
- Dumbbell Overhead Press
- Cable Pulldown
- One-Arm Dumbbell Row
- Dumbbell Lateral Raise
- Running
- Hiking

The new Beginner Calisthenics exercise definitions must ship with form instructions at creation as well.

#### Writing style for seeded form text

Form text should be short enough to use during a workout and structured around action, not anatomy lectures.

Preferred shape:

- **Setup** — starting position / equipment placement.
- **Move** — the actual movement.
- **Cues** — 2–4 high-value reminders.
- **Stop/adjust** only when a very obvious movement-specific warning is useful.

Keep the whole instruction roughly 3–6 concise sentences or short lines.

Examples of the intended level:

- **Barbell Bench Press:** eyes under the bar; feet planted; shoulder blades gently set against the bench; lower the bar under control toward the lower chest/sternum area; keep forearms near vertical; press back up without letting shoulders roll forward.
- **Dumbbell Romanian Deadlift:** stand tall with dumbbells close to the thighs; unlock the knees slightly; push the hips back while keeping the spine long and weights close to the legs; stop when hamstrings are loaded without losing position; drive the hips forward to stand.
- **Cable Row:** sit tall and brace; begin with shoulders relaxed rather than shrugged; pull the handle toward the lower ribs while keeping elbows close; pause briefly; return under control without collapsing the torso forward.
- **Farmer Carry:** stand tall with the load balanced at the sides; keep ribs stacked over pelvis and shoulders level; walk with controlled steps while resisting side-to-side sway; turn deliberately instead of twisting under load.

Running/Hiking may use `form_instructions` as concise movement/technique guidance even though they are not set-based lifts.

Examples:

- **Running:** tall relaxed posture; slight forward lean from the ankles rather than bending at the waist; keep steps underneath the body; arms relaxed and swinging naturally; avoid deliberately overstriding.
- **Hiking:** stay tall and balanced; shorten stride on steep terrain; place the whole foot securely when possible; keep knees tracking with the feet; use controlled steps on descents rather than braking hard with a long stride.

Do not present seeded copy as medical advice, injury diagnosis, or the only valid technique variation.

#### Seed/update safety

Seeded form copy must not overwrite owner customization.

For existing EX01–EX19 rows:

- populate `form_instructions` only when the field is NULL/blank;
- preserve any owner-edited form text on future migration/reseed runs;
- do not overwrite owner `notes`, GIF URLs, or YouTube URLs.

For newly introduced H5 built-ins:

- seed form instructions at insert time;
- later migrations follow the same “only fill missing default copy” rule.

If useful, record a non-authoritative seed copy version in exercise metadata (for example `form_seed_version: "h5-v1"`) so future migrations can distinguish untouched defaults from owner-edited text without making metadata the instruction authority.

#### Form text vs Notes

Use fields consistently:

- `form_instructions` = reusable technique/setup guidance for the movement;
- `notes` = owner-specific reminders/preferences, e.g. “bench notch 3,” “use blue band,” “left knee feels better with shorter stance.”

The media/form sheet should visually separate these instead of concatenating them into one paragraph.


### Exercise media affordance during Training

When an exercise has `gifUrl`:

- show a small unobtrusive media/form icon beside the exercise name in workout/routine contexts;
- tap opens a sheet/dialog with the GIF;
- include Form instructions and Notes when present;
- include “Watch video” link when a YouTube URL exists.

Do not autoplay YouTube.

The icon must not crowd routine logging or become a primary action.

Media can appear on:

- programmed workout editor;
- ad-hoc/experiment workout editor;
- routine manager;
- exercise library.

Historical session detail may also expose it if inexpensive, but it is not required for H5 completion.

---

## H5C — One-session extras in programmed routines

### Owner behavior

While logging a normal programmed routine, allow:

`+ Add exercise`

at the bottom of the exercise list.

The selected exercise:

- is added only to the current workout draft/session;
- does **not** revise the saved/built-in routine;
- uses `slotId = null`;
- logs normal canonical sets;
- remains part of Progress/PR analytics like any other exercise.

The server already supports slotless exercises within a programmed session; H5 should expose this intentionally in the UI and lock it with tests.

### Routine “+” label

A programmed workout with one or more slotless extra exercises should display with a plus suffix.

Examples:

- `Routine A+`
- `Routine B+`
- saved routine name may display `My Push Day+`

The plus describes the recorded session, not a new routine version.

Do not change:

- the source template;
- template version;
- routine membership;
- future workouts.

Derive the plus from the stored session exercises / an explicit deterministic metadata snapshot. Do not mutate the template.

### Editing historical sessions

If editing a programmed session:

- existing extra exercises remain editable/removable;
- new extras may be added;
- the original template id stays fixed;
- template-slot exercises still validate against their slots.

---

## H5D — Beginner calisthenics built-in routine

Add one built-in beginner routine intended to work with little/no equipment.

Proposed routine:

**Beginner Calisthenics — Full Body**

Suggested seed:

1. Bodyweight Squat — 2 × 8–12
2. Incline Push-Up — 2 × 6–10
3. Glute Bridge — 2 × 10–15
4. Bird Dog — 2 × 6–8 per side
5. Dead Bug — 2 × 6–8 per side
6. Forearm Plank — 2 × 20–30 sec

Add missing exercise definitions as seeded built-ins with correct measurement/load semantics.

This is a beginner template, not a progression prescription or medical claim.

Use a clear routine code that will not collide with A/B/C, e.g. `CAL-BEG`.

The routine should appear with built-in routines on Start Workout.

Do not modify A/B/C.

---

## H5 UX expectations

### Pantry

Mobile-first list/editor.

Rows should be scannable:

- name + optional brand;
- serving basis;
- calories + protein;
- staple indicator.

Do not show every nutrient in the list; full values live in editor/detail.

### Exercise Library

Prefer a compact searchable list with an edit sheet/detail rather than giant edit forms for every row.

Rows should make media availability visible but secondary.

### Destructive actions

Archive actions require intentional confirmation.

Use copy such as:

- `Remove from Pantry`
- `Archive exercise`

and explain that history is kept.

Provide Restore in archived views.

---

## API expectations

### Pantry

Reuse/extend:

- `GET /api/nutrition/foods`
- `POST /api/nutrition/foods`
- `GET /api/nutrition/foods/:id`
- `PATCH /api/nutrition/foods/:id`

No hard-delete API is required.

### Exercise Library

Reuse/extend:

- `GET /api/training/exercises`
- `POST /api/training/exercises`
- `GET /api/training/exercises/:id`
- `PATCH /api/training/exercises/:id`
- `DELETE /api/training/exercises/:id` = archive semantics

Add an explicit restore path or PATCH active state rather than creating a physical delete.

Management reads must be able to include archived exercises while normal workout reads remain active-only.

---

## Backup / portability

Pantry uses existing Nutrition food backup authority; no duplicate export.

Migration 0041 exercise fields must round-trip:

- GIF URL;
- YouTube URL;
- form instructions;
- notes;
- active/archive state.

Seeded routine/exercise rows retain current seeded restore semantics.

---

## Validation

At minimum prove:

### Pantry
- lists existing active non-recipe foods;
- search works;
- add creates one reusable definition;
- edit updates future definition only;
- old Nutrition entries retain their snapshots;
- remove archives;
- archived food is excluded from normal logging search;
- restore makes it loggable again;
- Recipes are not duplicated into normal Pantry list.

### Exercise Library
- lists seeded + owner definitions;
- every built-in EX01–EX19 row has non-empty seeded form guidance after 0041 where applicable;
- all H5 calisthenics built-ins have seeded form guidance;
- seeded form backfill fills missing text but does not overwrite owner-customized form text;
- form instructions and owner notes remain separate fields/presentation;
- media/instruction fields round-trip;
- owner unused semantic edit succeeds;
- used semantic edit fails;
- seeded semantic edit fails;
- seeded presentation edit succeeds;
- archive preserves historical sessions;
- archived exercise disappears from normal workout picker;
- restore returns it;
- no hard delete of referenced exercise rows.

### Programmed extras
- programmed draft can append a slotless exercise;
- saved template remains unchanged;
- saved session retains template id/version + extra exercise;
- session display gains `+`;
- next routine start does not include previous extra;
- historical edit can retain/remove/add extras;
- Progress sees extra exercise normally.

### Beginner calisthenics
- seeded exercises exist once;
- built-in routine exists once;
- prescriptions match each exercise measurement kind;
- routine can create a valid programmed workout.

### Media
- GIF icon only appears when GIF URL exists;
- media sheet displays form/notes;
- YouTube is link-only/no autoplay;
- invalid non-http(s) URLs are rejected.

### Regression
- full tests;
- typecheck;
- lint;
- build;
- disposable PostgreSQL migration coverage;
- backup round-trip.

---

## Scope boundaries

H5 does not add:

- cloud media hosting;
- exercise video downloading;
- automatic exercise-form analysis;
- new AI/provider calls;
- pantry inventory quantities/expiration dates;
- grocery lists;
- meal planning;
- automatic routine progression;
- social exercise sharing;
- physical hard deletion of canonical definitions referenced by history.

Those can be later features if actually useful.
