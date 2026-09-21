# Existing Nutrition System Inventory

Inspection-only report of the **calorie-tracker** repository (package `calorie-tracker` **v2.4.2**, UI title **NutriTrack**). No files were modified. Schema and behavior below come from source SQL, TypeScript types, and route handlers. Live database contents were not queried.

This app is a **single-user personal nutrition tracker**. There is no user table, no `user_id`, and no multi-tenancy. Strength training, body weight, BIA, Apple Health, and projections are **not present**.

---

## 1. Application architecture

### Framework / build

| **PieceActual**  |                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| Frontend         | Vite 5 + React 18 + TypeScript SPA (`vite.config.ts`, `src/main.tsx`, `index.html`)                                  |
| Routing          | `react-router-dom` v6 — `/`, `/meal-plan-generator`, catch-all (`src/App.tsx`)                                       |
| Styling          | Tailwind CSS 3 + shadcn/Radix UI under `src/components/ui/`                                                          |
| Data fetching UI | TanStack React Query is installed and wrapped in `App.tsx`; most screens still use `fetch` / custom hooks, not Query |
| Tests            | Node `tsx --test` (no Vitest/Jest runner)                                                                            |
| Lint             | ESLint 9                                                                                                             |

`README.md` incorrectly says “Next.js pages”. The app is **not** Next.js.

### Important dependencies

- **DB:** `@vercel/postgres`, `pg`, `@neondatabase/serverless` (declared; runtime SQL uses `@vercel/postgres` + `pg`)
- **API host:** `@vercel/node` (single Hobby-plan function)
- **Validation:** `zod` is installed; nutrition APIs mostly use ad-hoc validation, not Zod schemas
- **External nutrition:** USDA FoodData Central, Open Food Facts (HTTP, no SDK)
- **AI:** Google Gemini (new path) + custom `https://ai.daurham.com/api/nutrition` (legacy path)
- **Barcode:** `@zxing/browser`
- **Dates:** `date-fns` is installed; day math in food logs uses native `Date` in `src/lib/food-logs/day-range.ts`
- **Charts:** `recharts` is present via `src/components/ui/chart.tsx`; no nutrition-history chart is wired
- **Express** is in `package.json` but **not imported anywhere**

### Frontend architecture

Single-page dashboard at `src/pages/Index.tsx`:

1. **Today’s Progress** — calorie/macro bars vs local goals (`src/components/TodaysProgress.tsx`)
2. **Quick Stats** — meal count / remaining calories (`src/components/QuickStats.tsx`)
3. **Quick Log** — search, USDA fallback, barcode, photo/text AI estimate, quick calories (`src/components/quick-log/`)
4. **Today’s Meals** — logged items, edit/duplicate/delete (`src/components/TodaysMeals.tsx`, `src/components/modals/TodaysMealsEditModal.tsx`)
5. **Available Meals** — catalog + mods + recent logs (`src/components/AvailableMeals.tsx`)
6. **Navbar modals** — ingredients, meal combos, settings, meal log (`src/components/modals/`)

Client data access:

- Catalog: `src/lib/api-client.ts` → `src/lib/data-source.ts`
- Logs: `src/lib/food-logs/api-client.ts` + `src/hooks/useTodaysFoodLogs.ts`
- Search/AI/packaged: `src/lib/food-search/`, `src/lib/quick-log/`, `src/lib/packaged-foods/`, `src/lib/food-estimate/`

**Mods** (`src/lib/mods/`): plugin-style calculators that produce a meal object and log it. Registered: Costco pizza, custom food, ingredient mixer, AI food recognition, AI meal recommendation.

UI state that is **not** in Postgres lives in `localStorage` (goals, collapse flags, AI unlock, favorites, today’s-meals mirror).

### Backend / API architecture

One Vercel Node function: `api/index.ts` → `src/server/dispatch.ts`.

`vercel.json` rewrites `/api/:seg` and `/api/:seg/:path*` onto that function via `__route`.

Local dev: Vite plugin `src/server/dev-api-plugin.ts` intercepts `/api/*` and calls the same dispatcher (`npm run dev`). `npm run dev:full` uses `vercel dev`.

Handlers live in `src/server/routes/` (mix of `.js` and `.ts`). There is **no** shared auth middleware, CORS middleware (handlers only answer `OPTIONS` with 200), or ORM.

### Database provider

**PostgreSQL hosted as Vercel Postgres / Neon.** Comments and env names (`POSTGRES_*`, `DATABASE_URL`, Neon SSL) all point at Neon behind Vercel.

Two access clients:

| **ClientUsed by**             |                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@vercel/postgres` `sql`      | Almost all HTTP routes, `src/lib/packaged-foods/db.ts`, `src/lib/food-search/load-personal.ts`, `src/lib/ai-infra/postgres-store.ts`, table DDL in `src/lib/db/schema.ts` |
| `pg` `Pool` on `POSTGRES_URL` | `src/lib/db/client.ts` (and duplicate `client.js`), scripts (`init-db`, catalog import/export, backups)                                                                   |
| `pg` `Pool` on `DATABASE_URL` | Test-only `src/server/routes/get-data.js`                                                                                                                                 |

### Database access pattern

Raw SQL strings / tagged `sql\`...\`\`. No Prisma/Drizzle. Schema is applied by:

- `npm run init-db` → `scripts/init-db.ts` → `createTables()` in `src/lib/db/schema.ts`
- One-off ALTER scripts under `scripts/`
- Lazy `CREATE TABLE IF NOT EXISTS` inside some request handlers (`food-logs`, `foods`, AI store)

There are **no numbered migrations**. `CREATE TABLE IF NOT EXISTS` will not add columns to an already-created table.

### Authentication

**No user accounts.** APIs are unauthenticated.

AI *UI* is gated by a **client-side hardcoded passcode** in `src/lib/ai/auth.ts` (flag `localStorage.nutritrack_ai_auth`). Used by AI modals / `AIAuthGuard`. Server AI routes do **not** check it.

`.env` contains Neon Auth / Stack Auth names (`NEXT_PUBLIC_STACK_*`, `STACK_SECRET_SERVER_KEY`). **No application code reads them.**

### Deployment assumptions

- Vercel Hobby: **one** serverless function (`api/index.ts` comment)
- Node runtime (`export const config = { runtime: 'nodejs' }`)
- Frontend static Vite build (`npm run build`)
- Postgres reachable from Vercel via `POSTGRES_URL` / `DATABASE_URL`
- Production SSL: `MODE === 'production'` enables `rejectUnauthorized: false` on the `pg` pool

---

## 2. Database

### Database-related files

| **PathRole**                                      |                                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/lib/db/schema.ts`                            | `ingredients`, `meal_combos`, `meal_combo_ingredients`, triggers; then applies food-log + foods statements |
| `src/lib/db/food-logs-schema.ts`                  | `food_log_groups`, `food_logs`                                                                             |
| `src/lib/db/foods-schema.ts`                      | `foods`                                                                                                    |
| `src/lib/db/ai-schema.ts`                         | `ai_usage`, `ai_cache` — **not** called from `createTables()`                                              |
| `src/lib/db/client.ts` / `client.js`              | `pg` pool for scripts                                                                                      |
| `scripts/init-db.ts`                              | Full catalog + food-log + foods init                                                                       |
| `scripts/add-food-logs.ts`                        | Ensure food log tables                                                                                     |
| `scripts/add-foods.ts`                            | Ensure foods table                                                                                         |
| `scripts/add-staple-column.ts`                    | `ingredients.is_staple`                                                                                    |
| `scripts/add-meal-type-column.ts`                 | `meal_combos.meal_type` + CHECK                                                                            |
| `scripts/backup-db.ts`                            | JSON dump of ingredients + meal combos only                                                                |
| `scripts/export-catalog.ts` / `import-catalog.ts` | Catalog JSON round-trip                                                                                    |
| `src/server/routes/*.js` (several)                | Duplicate `CREATE TABLE IF NOT EXISTS` and CRUD SQL                                                        |

**Tables that exist in code: 7.** No `users`, `receipts`, `merchants`, `categories`, `workouts`, or `measurements` tables.

---

### `ingredients`

Defined in `src/lib/db/schema.ts`.

| **ColumnTypeNotes** |                                         |                                                          |
| ------------------- | --------------------------------------- | -------------------------------------------------------- |
| `id`                | `SERIAL`                                | **PK**                                                   |
| `name`              | `VARCHAR(255) NOT NULL`                 | No unique constraint                                     |
| `calories`          | `INTEGER NOT NULL`                      | Per `unit` serving                                       |
| `protein`           | `DECIMAL(5,2) NOT NULL`                 |                                                          |
| `carbs`             | `DECIMAL(5,2) NOT NULL`                 |                                                          |
| `fat`               | `DECIMAL(5,2) NOT NULL`                 |                                                          |
| `unit`              | `VARCHAR(50) NOT NULL`                  | Free-text serving description (e.g. `"1 medium (119g)"`) |
| `is_staple`         | `BOOLEAN DEFAULT false`                 | Added by `scripts/add-staple-column.ts`                  |
| `created_at`        | `TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP` | No `updated_at`                                          |

- Indexes: none beyond PK
- FKs: none (referenced by `meal_combo_ingredients`)
- Trigger: `update_meal_combos_on_ingredient_change_trigger` **AFTER UPDATE** recalculates denormalized macros on composed meals that use this ingredient

---

### `meal_combos`

| **ColumnTypeNotes**         |                                           |                                                        |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| `id`                        | `SERIAL`                                  | **PK**                                                 |
| `name`                      | `VARCHAR(255) NOT NULL`                   |                                                        |
| `meal_type`                 | `VARCHAR(20) NOT NULL DEFAULT 'composed'` | CHECK `IN ('composed', 'standalone')`                  |
| `calories`                  | `INTEGER NOT NULL`                        | Denormalized for composed; stored value for standalone |
| `protein` / `carbs` / `fat` | `DECIMAL(5,2) NOT NULL`                   | Same                                                   |
| `notes`                     | `TEXT`                                    |                                                        |
| `instructions`              | `TEXT`                                    |                                                        |
| `created_at`                | `TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`   | No `updated_at`                                        |

`createTables()` and `createMealCombo` both `DROP COLUMN IF EXISTS ingredients` on this table (legacy JSON column).

---

### `meal_combo_ingredients`

Junction: composed meals → ingredients.

| **ColumnTypeNotes** |                                   |                                              |
| ------------------- | --------------------------------- | -------------------------------------------- |
| `meal_combo_id`     | `INTEGER`                         | FK → `meal_combos(id)` **ON DELETE CASCADE** |
| `ingredient_id`     | `INTEGER`                         | FK → `ingredients(id)` **ON DELETE CASCADE** |
| `quantity`          | `DECIMAL(5,2) NOT NULL DEFAULT 1` | Multiplier of the ingredient’s `unit`        |

**PK:** `(meal_combo_id, ingredient_id)` — one row per ingredient per meal (cannot list the same ingredient twice).

Trigger `update_meal_combo_totals_trigger` **AFTER INSERT OR UPDATE OR DELETE** is defined to recompute `meal_combos` macros from `SUM(ingredient.macro * quantity)`. The function body uses `NEW.meal_combo_id`. On **DELETE**, PostgreSQL does not populate `NEW`, so delete-time recalculation from this trigger is **not reliably specified** in the source.

GET `/meal-combos` **recomputes** composed macros in SQL anyway; standalone uses stored columns.

---

### `food_log_groups`

`src/lib/db/food-logs-schema.ts`

| **ColumnTypeNotes** |                                           |                                            |
| ------------------- | ----------------------------------------- | ------------------------------------------ |
| `id`                | `UUID` **PK** `DEFAULT gen_random_uuid()` |                                            |
| `display_name`      | `VARCHAR(255)`                            | Optional group title (multi-item estimate) |
| `original_input`    | `TEXT`                                    | User text / photo prompt                   |
| `created_at`        | `TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`   |                                            |

No other constraints.

---

### `food_logs`

**Canonical consumption table.**

| **ColumnTypeNotes**            |                                                  |                                                   |
| ------------------------------ | ------------------------------------------------ | ------------------------------------------------- |
| `id`                           | `SERIAL`                                         | **PK**                                            |
| `logged_at`                    | `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP` | When it was eaten                                 |
| `group_id`                     | `UUID`                                           | FK → `food_log_groups(id)` **ON DELETE SET NULL** |
| `display_name`                 | `VARCHAR(255) NOT NULL`                          |                                                   |
| `source_type`                  | `VARCHAR(30) NOT NULL`                           | App-validated; **no DB CHECK**                    |
| `source_id`                    | `INTEGER`                                        | Loose pointer; **no FK**                          |
| `nutrition_source`             | `VARCHAR(30) NOT NULL`                           | App-validated; **no DB CHECK**                    |
| `quantity`                     | `DECIMAL(8,2) NOT NULL DEFAULT 1`                |                                                   |
| `serving_description`          | `VARCHAR(100)`                                   |                                                   |
| `weight_grams`                 | `DECIMAL(8,2)`                                   |                                                   |
| `calories`                     | `INTEGER NOT NULL`                               | **Required**; rounded on insert                   |
| `protein` / `carbs` / `fat`    | `DECIMAL(7,2)`                                   | Nullable                                          |
| `confidence`                   | `VARCHAR(20)`                                    | App uses `verified \| high \| medium \| low`      |
| `calorie_low` / `calorie_high` | `INTEGER`                                        | Estimate range                                    |
| `original_input`               | `TEXT`                                           |                                                   |
| `metadata`                     | `JSONB DEFAULT '{}'`                             | Provenance, edits, mods, AI versions              |
| `created_at`                   | `TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`          |                                                   |
| `updated_at`                   | `TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`          | Set on PATCH                                      |

Indexes:

- `idx_food_logs_logged_at` on `logged_at`
- `idx_food_logs_source` on `(source_type, source_id)`
- `idx_food_logs_group` on `group_id`
- `idx_food_logs_name` on `display_name`

`source_type` values enforced in `src/server/routes/food-logs.js` and `src/types/food-log.ts`:

`ingredient | meal_combo | food | historical_log | quick_calories | usda | open_food_facts | nutrition_label | ai_estimate | mod | legacy`

`nutrition_source`:

`user_entered | legacy | usda | open_food_facts | nutrition_label | ai_reference | ai_estimate | catalog`

Logged nutrition is **copied onto the row**. Editing an ingredient later does **not** rewrite historical `food_logs`.

---

### `foods`

Canonical *catalog* of packaged / label foods (`src/lib/db/foods-schema.ts`). Not the consumption record.

| **ColumnTypeNotes**            |                                         |                                                          |
| ------------------------------ | --------------------------------------- | -------------------------------------------------------- |
| `id`                           | `SERIAL` PK                             |                                                          |
| `name`                         | `VARCHAR(255) NOT NULL`                 |                                                          |
| `normalized_name`              | `VARCHAR(255) NOT NULL`                 | Search key                                               |
| `food_type`                    | `VARCHAR(30) NOT NULL`                  | Writers use `'packaged'`                                 |
| `calories`                     | `INTEGER NOT NULL`                      | Selected serving nutrition                               |
| `protein` / `carbs` / `fat`    | `DECIMAL(7,2)`                          | Nullable                                                 |
| `serving_amount`               | `DECIMAL(8,2)`                          |                                                          |
| `serving_unit`                 | `VARCHAR(50)`                           |                                                          |
| `weight_grams`                 | `DECIMAL(8,2)`                          |                                                          |
| `source_type`                  | `VARCHAR(30) NOT NULL`                  | `'open_food_facts'` or `'nutrition_label'` in writers    |
| `source_external_id`           | `VARCHAR(255)`                          | Usually barcode                                          |
| `confidence`                   | `VARCHAR(20)`                           |                                                          |
| `calorie_low` / `calorie_high` | `INTEGER`                               | Present in DDL; packaged upsert does **not** set them    |
| `attributes`                   | `JSONB DEFAULT '{}'`                    | Search attributes; packaged upsert does **not** populate |
| `metadata`                     | `JSONB DEFAULT '{}'`                    | barcode, brand, serving, per-100g, per-serving           |
| `usage_count`                  | `INTEGER NOT NULL DEFAULT 0`            | Incremented on upsert update                             |
| `last_used_at`                 | `TIMESTAMPTZ`                           |                                                          |
| `created_at` / `updated_at`    | `TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP` |                                                          |

Indexes:

- `idx_foods_normalized_name`
- `idx_foods_last_used` (`last_used_at DESC`)
- **Partial unique** `idx_foods_source_external_id` on `source_external_id` WHERE NOT NULL

USDA references are **not** written into `foods` (`createsCanonicalFoodFromReference()` returns `false`).

---

### `ai_usage`

Created lazily by `PostgresAiStore.ensureAiSchema()` (`src/lib/ai-infra/postgres-store.ts`). **Not** part of `npm run init-db`.

| **ColumnTypeNotes**              |                                         |                                                                           |
| -------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| `id`                             | `SERIAL` PK                             | Also used as budget reservation id                                        |
| `provider`                       | `VARCHAR(50) NOT NULL`                  |                                                                           |
| `model`                          | `VARCHAR(100) NOT NULL`                 |                                                                           |
| `request_type`                   | `VARCHAR(50) NOT NULL`                  | `nutrition_label \| text_parse \| food_estimate \| photo_estimate`        |
| `input_tokens` / `output_tokens` | `INTEGER`                               |                                                                           |
| `estimated_cost_usd`             | `DECIMAL(10,6) NOT NULL`                |                                                                           |
| `success`                        | `BOOLEAN NOT NULL`                      |                                                                           |
| `cached`                         | `BOOLEAN NOT NULL DEFAULT false`        |                                                                           |
| `metadata`                       | `JSONB DEFAULT '{}'`                    | Includes `reservation_status`: `pending \| committed \| released \| none` |
| `created_at`                     | `TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP` |                                                                           |

Indexes: `idx_ai_usage_created_at`; `idx_ai_usage_month` on `(created_at, cached, success)`.

Pending reservations use `pg_advisory_xact_lock(872134, monthOrdinal)`.

---

### `ai_cache`

| **ColumnTypeNotes**  |                                         |                                       |
| -------------------- | --------------------------------------- | ------------------------------------- |
| `id`                 | `SERIAL` PK                             |                                       |
| `request_hash`       | `VARCHAR(64) UNIQUE NOT NULL`           |                                       |
| `request_type`       | `VARCHAR(50) NOT NULL`                  |                                       |
| `response`           | `JSONB NOT NULL`                        | Gate code forbids storing image bytes |
| `provider` / `model` | `VARCHAR`                               |                                       |
| `created_at`         | `TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP` |                                       |
| `expires_at`         | `TIMESTAMPTZ`                           | Label cache 30d; estimate cache 14d   |

---

### Relationship diagram (as coded)

ingredients 1──< meal_combo_ingredients >──1 meal_combos

food_log_groups 1──< food_logs     (optional group_id)

foods            (standalone catalog; food_logs.source_id may point here when source_type is food / OFF / label)

ai_usage, ai_cache  (standalone operational tables)

`food_logs.source_id` is **not** a declared FK to `ingredients`, `meal_combos`, or `foods`.

---

## 3. Nutrition data model

### Canonical “I consumed this food at this time”

**One row in ****`food_logs`**, keyed by `id`, timed by `logged_at`.

The UI still maps that row to a legacy `LoggedMeal` (`src/lib/utils.ts`, `src/lib/food-logs/map.ts`) for Today’s Meals. `uniqueMealId` on the UI object is the **food log id** after persist. A localStorage mirror (`nutritrack_todays_meals`) is kept for the current day only.

Multi-item AI estimates insert several `food_logs` plus one `food_log_groups` row (`src/lib/food-estimate/log.ts` `draftToCreateRequest`).

### Foods (catalog, three layers)

1. **`ingredients`** — user pantry building blocks; macros per `unit`.
2. **`meal_combos`** — reusable recipes:
   - `composed`: macros = Σ ingredient macros × junction `quantity`
   - `standalone`: user-entered macros, no required ingredients
3. **`foods`** — packaged/label products keyed by barcode / `source_external_id`

USDA hits are **not** persisted as `foods`; they become `food_logs` with `source_type = 'usda'` and `metadata.externalId`.

### Logged foods

Insert paths that become `food_logs`:

| **Path****`source_typenutrition_source`**     |                                                         |                                            |
| --------------------------------------------- | ------------------------------------------------------- | ------------------------------------------ |
| Catalog meal combo / add from Available Meals | `meal_combo` (or `mod` / `ai_estimate`)                 | `catalog` / `user_entered` / `ai_estimate` |
| Quick-log local search                        | `food` / `meal_combo` / `ingredient` / `historical_log` | `catalog` or `legacy`                      |
| USDA resolve                                  | `usda`                                                  | `usda`                                     |
| Barcode / OFF                                 | `open_food_facts`                                       | `open_food_facts`                          |
| Nutrition-label photo                         | `nutrition_label`                                       | `nutrition_label`                          |
| AI estimate (text/photo)                      | from estimate item, often `ai_estimate` or `usda`       | `ai_estimate` / `usda` / local             |
| Quick calories dialog                         | `quick_calories`                                        | `user_entered`                             |
| Custom food / Costco / mixer mods             | `mod`                                                   | `user_entered`                             |
| Migrated localStorage meals                   | `legacy` / `meal_combo` / `mod`                         | `legacy`                                   |

### Meals / groupings

- **Reusable grouping:** `meal_combos` + `meal_combo_ingredients`
- **Logged grouping:** `food_log_groups` (one sitting / one estimate)
- **UI grouping:** “today” = local calendar day via `getLocalDayRange()` (`src/lib/food-logs/day-range.ts`)
- **Mods:** not stored as combos unless the user separately saves a combo; logging creates a `food_logs` row with `metadata.modData`

### Calories and macros

Everywhere: **calories** (integer kcal), **protein / carbs / fat** (grams).

No fiber, sodium, micronutrients, alcohol, or water in the schema.

Rounding convention (repeated in utils, mods, API formatters): calories `Math.round`; macros 1 decimal.

Atwater check **only** on nutrition-label AI extract: `protein*4 + carbs*4 + fat*9` vs reported calories (`src/lib/food-ai/validate-label.ts`). Warning if delta > 20 **and** ratio > 0.2. Other paths do not enforce calorie–macro consistency.

### Serving quantities / units

Several incompatible meanings of “serving”:

| **LayerMeaning**                                         |                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| `ingredients.unit`                                       | Free-text label for the **base** amount whose macros are stored |
| `meal_combo_ingredients.quantity`                        | How many of that base unit                                      |
| UI `portion` / `metadata.portion`                        | Extra multiplier when logging a combo (`applyPortionToMeal`)    |
| `food_logs.quantity`                                     | Copied serving count (quick-log scale, packaged quantity, etc.) |
| `food_logs.serving_description`                          | Human string                                                    |
| `food_logs.weight_grams`                                 | Optional mass                                                   |
| `foods.serving_amount` + `serving_unit` + `weight_grams` | Packaged serving                                                |
| Quick-log parse (`src/lib/quick-log/quantity.ts`)        | Leading number, `g`/`oz`, `cup(s)`, words `half`/`two`, etc.    |
| USDA (`src/lib/nutrition-providers/math.ts`)             | Scale from per-100g using matched household portion or weight   |

Ingredient TS type also has `serving_size` / `serving_unit` — **those columns do not exist**.

### Dates / times

- Storage: `logged_at` timestamptz
- Day queries: `[local midnight, next local midnight)` converted with `toISOString()` (UTC instants)
- Legacy UI time: `toLocaleTimeString()` on write, parsed back with `Date.toDateString() + timestamp` (`parseLegacyTimestamp`) — timezone/AM-PM fragile
- No timezone column; “today” is the **browser’s** local day

### Categories

No category table.

Approximate substitutes:

- `ingredients.is_staple`
- `meal_combos.meal_type` (`composed` | `standalone`)
- Search `FoodAttributes` (`food_family`, `protein`, `preparation`, `size`, …) in `src/lib/food-search/attributes.ts` / `foods.attributes`
- AI recommend “craving types” and “time of day” — request-only, not stored
- Mod ids (`custom-food`, `costco-pizza-slice`, …)

### Merchants

No merchant entity. Packaged foods store **`brand`** in `foods.metadata` / log `metadata.brand` (Open Food Facts). Costco pizza is a hardcoded mod, not a merchant record.

### Receipt-derived data

**Not implemented.** No receipt parsers, line items, or store totals.

### Split transactions / items

Closest analog: **`food_log_groups`**** + multiple ****`food_logs`** for one estimate (“Add all”). Undo deletes only the log ids created in that action (`src/lib/food-logs/group-undo.ts`, DELETE `resource=group`). Unrelated rows sharing a group id are skipped.

This is not receipt-split accounting.

### Manually edited / corrected records

- PATCH `/api/food-logs?id=` updates any log fields
- Today’s Meals edit modal sets `isEdited: true` in **`metadata`**, not a column (`src/components/modals/TodaysMealsEditModal.tsx`)
- `reconcileLoggedMeals` in `src/lib/utils.ts` would preserve edited snapshots vs catalog — that helper is **not** used by `useTodaysFoodLogs` after the DB migration
- Nutrition-label flow: user can correct Gemini output in `NutritionLabelForm` before save
- Estimate review: user can scale/edit draft items before insert
- Ingredient/combo CRUD updates the catalog only

### Barcode / OCR / AI-derived

| **FeatureWherePersisted as**             |                                                  |                                                                             |
| ---------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------- |
| Camera/manual barcode                    | `ScannerModal`, `@zxing/browser`                 | Lookup key                                                                  |
| Open Food Facts                          | `src/lib/packaged-foods/off-provider.ts`         | `foods` + `food_logs`                                                       |
| Local barcode hit                        | `foods.source_external_id` or `metadata.barcode` | `foods`                                                                     |
| Nutrition-label photo → Gemini           | `/api/nutrition-label/extract`                   | Review, then `foods` + log; **images not stored** (`persistedImage: false`) |
| Text/photo food estimate → Gemini        | `/api/quick-log/estimate`                        | `food_logs` (+ group); interpretation in `metadata`                         |
| USDA text search                         | `/api/quick-log/resolve`                         | log only                                                                    |
| Legacy food/ingredient/meal-recommend AI | `/api/analyze-*`, `/api/ai-recommend-meals`      | Used by mods; logs as `mod` / `ai_estimate`                                 |

### Nutrition targets

**Not in the database.**

Defaults: `src/settings.config.ts` — `caloricGoal = 1500`, `proteinGoal/carbsGoal/fatGoal = 100`.

Overrides: `localStorage` keys `nutritrack_daily_goal`, `nutritrack_macro_goals`, plus visibility flags. Settings modal writes those keys from `Index.tsx`.

---

## 4. API

Base path `/api`. Dispatcher: `src/server/dispatch.ts`. All handlers also accept `OPTIONS` → 200 unless noted.

### `GET /api/ingredients` — `src/server/routes/ingredients.js`

Purpose: list pantry.
Response: ingredient rows.
Tables: `ingredients`.

### `POST /api/ingredients`

Body: `name, calories, protein, carbs, fat, unit, is_staple?`.
Response: inserted row.
Tables: `ingredients`.

### `PUT /api/ingredients`

Body: same + `id`.
Also recomputes **composed** `meal_combos` that use the ingredient.
Tables: `ingredients`, `meal_combos`, `meal_combo_ingredients`.

### `DELETE /api/ingredients?id=`

409 if used by any meal combo (lists meal names).
Tables: `ingredients` (read `meal_combo_ingredients` / `meal_combos`).

---

### `GET /api/meal-combos` — `src/server/routes/meal-combos.js`

Purpose: list meals with nested `{ id, quantity }` ingredients; composed macros summed in SQL.
Tables: `meal_combos`, `meal_combo_ingredients`, `ingredients`.

### `POST /api/meal-combos`

Body: `name, meal_type?, ingredients[], calories, protein, carbs, fat, notes, instructions`.
Composed: inserts junction rows. Also tries to drop legacy `ingredients` column.
Response: meal + ingredient `{ id, name, quantity }`.
Tables: `meal_combos`, `meal_combo_ingredients`, `ingredients`.

### `PUT /api/meal-combos?id=`

Replaces meal fields; deletes then re-inserts junction rows.
Tables: same.

### `DELETE /api/meal-combos?id=`

Cascade deletes junction rows.
Tables: `meal_combos`.

---

### `GET /api/food-logs?from=&to=` — `src/server/routes/food-logs.js`

Required range. Returns `{ logs, groups }`.
Tables: `food_logs`, `food_log_groups`.

### `GET /api/food-logs?id=`

Single normalized log.

### `GET /api/food-logs?recent=`

Latest N logs (default 50, max 200), `groups: []`. Used for recents.

### `POST /api/food-logs`

Body: `{ group?, logs: FoodLogInput[] }` **or** a single log object.
Optional `?resource=group` creates only a group.
Response 201: `{ logs, groups }`.
Tables: `food_logs`, `food_log_groups`.

### `PATCH /api/food-logs?id=`

Partial update; always sets `updated_at`.
Tables: `food_logs`.

### `DELETE /api/food-logs?id=`

Single row.

### `DELETE /api/food-logs?resource=group&id=&logIds=`

Deletes listed members of that group; deletes group if empty.
Body may also include `logIds`.

### `DELETE /api/food-logs?from=&to=`

Deletes all logs in range (used to clear today). Does **not** necessarily delete orphan groups.

---

### `GET /api/foods/search?q=` — `src/server/routes/foods-search.ts`

Personal search across `foods`, `meal_combos`, `ingredients`, `food_logs`.
Response: `{ query, classification, results: SearchCandidate[] }`.
Tables: those four.

---

### `POST /api/barcode/lookup` — `src/server/routes/barcode-lookup.ts`

Body: `{ barcode }` or `{ code }`.
Response: `BarcodeLookupResponse` (`found | not_found | provider_error`).
Tables: `foods` (local). External: Open Food Facts.

---

### `POST /api/packaged-foods/save` — `src/server/routes/packaged-food-save.ts`

Body: `{ product: PackagedFoodResult, quantity }`.
Upserts `foods`, returns `{ product, foodLog }` (client then POSTs the log).
Tables: `foods`.

---

### `POST /api/nutrition-label/extract` — `src/server/routes/nutrition-label-extract.ts`

Body: `{ image: { mimeType, dataBase64, width?, height? }, barcode? }`.
Gemini OCR of a label; rate limit 6 / 10 min / IP (in-memory).
Response: `{ label, warnings, persistedImage: false, barcode, cached? }` or error `{ fallback: 'manual' }`.
Tables: `ai_usage`, `ai_cache`.

---

### `POST /api/quick-log/resolve` — `src/server/routes/quick-log-resolve.ts`

Body: `{ input: { text } }` or `{ text }`.
Local search first; USDA if weak/none.
Response: `ResolveOutcome` (`local | reference | unresolved`).
Tables: search tables. External: USDA. **Does not write logs.**

---

### `POST /api/quick-log/estimate` — `src/server/routes/quick-log-estimate.ts`

Body: `{ input: { type: 'text'|'photo', text?, image? } }`.
Deterministic resolve, else Gemini interpretation + USDA/local scale.
Response: `{ status: 'draft', draft }` or `{ status: 'error', code, fallback: 'manual' }` (502/503).
Tables: search + `ai_usage` / `ai_cache`. **Does not write logs** (client converts draft → POST `/food-logs`).

---

### `GET /api/ai/usage` — `src/server/routes/ai-usage.ts`

Monthly spend vs `AI_MONTHLY_BUDGET_USD` / `AI_WARNING_BUDGET_USD`.
Tables: `ai_usage`.

---

### `POST /api/analyze-food` — `src/server/routes/analyze-food.js`

Legacy. Body: `{ description }`. Calls `https://ai.daurham.com/api/nutrition` with `AI_API_KEY`.
Response: `{ name, calories, protein, carbs, fat, confidence (0–1), description }`. Mock if no key.
Tables: none.

### `POST /api/analyze-ingredient`

Body: `{ description, servingType?: 'serving'|other }`. Same external AI. Extra `unit`.
Tables: none.

### `POST /api/ai-recommend-meals`

Body: `cravingTypes[], dataSource, preferences, timeOfDay, currentMacros, remainingMacros, availableIngredients, availableMeals`.
Response: `{ recommendations: [{ name, description, calories, protein, carbs, fat, confidence, reasoning, ingredients, instructions }] }`. Often `fallback: true`.
Tables: none.

### `POST /api/generate-meal-plan` — `src/server/routes/generate-meal-plan.js`

Body: `{ userGoals?, staplesOnly? }`. Builds a **prompt string** from catalog; does not call an LLM.
Response: `{ prompt, summary: { totalIngredients, totalMeals, ingredients, meals, staplesOnly } }`.
Tables: `ingredients`, `meal_combos`, `meal_combo_ingredients`.

### `GET /api/get-data` — `src/server/routes/get-data.js`

Comment: testing only. `SELECT * FROM ingredients` via `DATABASE_URL`.
Tables: `ingredients`.

---

**Not APIs:** Vite static app; scripts under `scripts/` talk to Postgres directly.

---

## 5. Types

Primary homes: `src/types/` plus `LoggedMeal` in `src/lib/utils.ts`.

| **TypeFileRole**                                                      |                                    |                        |
| --------------------------------------------------------------------- | ---------------------------------- | ---------------------- |
| `Ingredient`, `Meal`, `MealCombo`, `MealInput`, `MealType`            | `src/types/index.ts`               | Catalog UI             |
| `FoodLog`, `FoodLogInput`, `FoodLogGroup`, `Nutrition`, source unions | `src/types/food-log.ts`            | Canonical log          |
| `LoggedMeal`                                                          | `src/lib/utils.ts`                 | UI adapter over `Meal` |
| `SearchCandidate`, `FoodSearchResponse`, `FoodAttributes`             | `src/types/food-search.ts`         | Unified search         |
| `PackagedFoodResult`, `CanonicalFoodRecord`, barcode types            | `src/types/packaged-food.ts`       | OFF / label / `foods`  |
| `NutritionLabelResult`, `FoodAIProvider`, `ImageInput`                | `src/types/nutrition-label.ts`     | Label OCR              |
| `NutritionProvider`, `NutritionCandidate`, `NutritionReference`       | `src/types/nutrition-provider.ts`  | USDA                   |
| `FoodInterpretation`, `EstimateDraft`, `EstimateItem`                 | `src/types/food-interpretation.ts` | Gemini estimate        |
| `ResolveOutcome`, `QuickLogResolveRequest`                            | `src/types/quick-log-resolve.ts`   | USDA/local resolve     |
| `AiUsageRecord`, `AiMonthSummary`, request types                      | `src/types/ai-infra.ts`            | Budget/cache           |
| `ModMeal`, `ModHandler`                                               | `src/types/mods.ts`                | Mods                   |
| `ParsedQuantity`                                                      | `src/lib/quick-log/quantity.ts`    | Serving parse          |

### Mismatches (frontend vs API vs DB)

1. **`Ingredient`**** vs ****`ingredients`****:** TS has `serving_size`, `serving_unit`, `notes`, required `quantity`. DB has `unit`, `is_staple`, no `serving_size`/`notes`/`quantity`. `quantity` is a junction/UI field.
2. **`Meal.meal_type`**** includes ****`'mod'`**; DB CHECK is only `'composed' | 'standalone'`. Mods never insert `meal_combos` with `mod`.
3. **`Meal.timestamp`**** / ****`ingredients[]`** are UI; combos store ingredients only via junction; logs store a snapshot in `metadata.ingredients`.
4. **Numeric types:** DB `DECIMAL` often arrives as **strings** from `pg`. Food-log API coerces numbers; ingredients/meal-combo GET often does not.
5. **Calories:** DB integer vs TS `number`; protein/carbs/fat required on catalog TS, **nullable** on `FoodLog`.
6. **`source_id INTEGER`**** vs USDA ****`fdcId`**** string:** writers `Number(externalId)`; non-numeric ids become `null` (external id kept in metadata).
7. **`foods`**** camelCase canonical record** (`CanonicalFoodRecord`) vs snake_case columns.
8. **AI confidence:** Gemini label uses `{ calories, protein, …: NutritionConfidence }`; legacy analyze-\* uses **0–1 float**; `food_logs.confidence` is a single string.
9. **Search ****`id: number | string`** vs integer PKs.
10. **`MealCombo.ingredients`**** GET** returns `{ id, quantity }` without names; POST/PUT response includes `name`. Frontend remaps via `mapComboMealsWithIngredients`.
11. **`createsCanonicalFood`**** is always false** for USDA/estimates; only packaged save upserts `foods`.
12. **Goals exist only in TS + localStorage**, not in DB types.

---

## 6. Business logic

### Calorie / macro calculations

| **LocationWhat**                                               |                                                     |
| -------------------------------------------------------------- | --------------------------------------------------- |
| `src/lib/utils.ts` `calculateComposedMealTotals`               | Combo = Σ ingredient macros × quantity              |
| SQL in GET `/meal-combos` and triggers                         | Same formula server-side                            |
| `applyPortionToTotals` / `applyPortionToMeal`                  | Extra portion multiplier when logging               |
| `src/lib/food-logs/totals.ts` `sumFoodLogNutrition`            | Day totals; macros null if all logs null that macro |
| Mods (`costcoPizzaMod`, `ingredientMixerMod`, `customFoodMod`) | Per-100g × grams, mixer × portion, or raw entry     |
| `src/lib/nutrition-providers/math.ts`                          | USDA per-100g × grams; oz → g `28.349523125`        |
| `src/lib/quick-log/scale.ts`                                   | Scale search candidate by serving count or weight   |
| `src/lib/packaged-foods/normalize.ts` `scalePackagedNutrition` | Packaged serving × quantity                         |
| `src/lib/food-ai/validate-label.ts`                            | 4/4/9 kcal check on labels only                     |

Daily remaining macros for AI recommend are computed in the **frontend** (goals − today’s sums) and sent in the request body.

### Serving calculations

- Parse: `parseQuantityQuery`
- Local catalog: multiply stored serving by parsed quantity if `canScaleByServing`
- USDA: match household portion tokens (`cup`, `slice`, `small`/`medium`/`large`, …) or use grams
- Packaged: `quantity` × nutrition per serving; `weight_grams` × quantity when known
- Combo log: UI `portion` becomes `food_logs.quantity` and `metadata.portion`

### Categorization

Token/attribute extraction for search ranking only (`classify.ts`, `score.ts`, `attributes.ts`). `is_staple` filters meal-plan prompts. No user-facing category taxonomy.

### Editing

- Catalog: PUT ingredients / meal-combos
- Logs: PATCH via `updateMealInToday` → `loggedMealToFoodLogInput` (rewrites metadata snapshot)
- Estimate/label: edit **before** insert
- Undo: reverse last add/delete (including grouped adds)

### Aggregation

- Today: `sumFoodLogNutrition` over mapped meals
- Progress %: `min(current/goal*100, 100)` in `Index.tsx` / `TodaysProgress`
- Recents: last 80 logs, `deriveRecentFrequent` (`src/lib/quick-log/recents.ts`)
- Search usage: `GROUP BY display_name` on `food_logs`
- **No** weekly/monthly nutrition history API or UI (despite `recharts`)

### Date handling

Local-day ISO range; `logged_at` default `CURRENT_TIMESTAMP` if client omits it. Combo logging uses `parseLegacyTimestamp` from `toLocaleTimeString()`. Day-boundary around UTC offset is implicit in `toISOString()`.

### Analytics

Today-only: calories vs goal, optional protein/carbs/fat bars, meal count, remaining calories. AI monthly **dollar** usage in Settings (`AiUsageSection`). No projections, trends, or body metrics.

### AI / OCR / barcode processing

**New stack (Gemini + budget gate):**

- `src/lib/ai-infra/gate.ts` — cache, reserve cost, execute, finalize; refuses to persist `dataBase64`
- `src/lib/food-ai/gemini-label.ts` — label + `parseFoodDescription` + `analyzeFoodImage`
- `src/lib/food-estimate/estimate.ts` — local/USDA first; Gemini if needed; multi-food via commas / “and”
- In-memory IP rate limit for labels (`src/lib/food-ai/rate-limit.ts`) — **not shared across serverless isolates**

**Legacy stack (****`AI_API_KEY`**** → ****`ai.daurham.com`****):**

- analyze-food / analyze-ingredient / ai-recommend-meals
- Client-side passcode; mock payloads when key missing

**Barcode:** local `foods` then Open Food Facts; save upserts canonical row; log uses `original_input: barcode:…`.

Images are resized client-side (`src/lib/packaged-foods/image.ts`, max dimension 1280 for estimates).

---

## 7. Environment

Names only. Values were not copied.

### Present in `.env` (and typical Vercel/Neon template)

- `MODE`
- `VITE_USE_MOCK_DATA`
- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`
- `PGHOST`
- `PGHOST_UNPOOLED`
- `PGUSER`
- `PGDATABASE`
- `PGPASSWORD`
- `POSTGRES_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_USER`
- `POSTGRES_HOST`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`
- `POSTGRES_URL_NO_SSL`
- `POSTGRES_PRISMA_URL`
- `NEXT_PUBLIC_STACK_PROJECT_ID`
- `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY`
- `STACK_SECRET_SERVER_KEY`
- `AI_GOOGLE_STUDIO_GEMINI_API_KEY`
- `GEMINI_API_KEY`
- `AI_API_KEY`
- `AI_PROVIDER`
- `AI_MODEL`
- `USDA_API_KEY`
- `AI_MONTHLY_BUDGET_USD`
- `AI_WARNING_BUDGET_USD`

### Referenced in code, not necessarily in `.env`

- `AI_INPUT_PRICE_PER_MILLION_USD`
- `AI_OUTPUT_PRICE_PER_MILLION_USD`
- Vite built-in `import.meta.env.MODE`

### How they are used (no values)

| **NamesUsed for**                                                                 |                                                                                 |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `POSTGRES_URL`, `MODE`                                                            | `pg` pool (`src/lib/db/client.ts`)                                              |
| `DATABASE_URL`                                                                    | `get-data.js` only                                                              |
| `POSTGRES_*` / `PG*`                                                              | Standard Vercel/Neon template; `@vercel/postgres` typically uses `POSTGRES_URL` |
| Stack Auth names                                                                  | **Unused in source**                                                            |
| `GEMINI_API_KEY` / `AI_GOOGLE_STUDIO_GEMINI_API_KEY` / `AI_PROVIDER` / `AI_MODEL` | Gemini food AI                                                                  |
| `AI_API_KEY`                                                                      | Legacy `ai.daurham.com` routes                                                  |
| `USDA_API_KEY`                                                                    | USDA FoodData Central                                                           |
| `AI_MONTHLY_BUDGET_USD` / `AI_WARNING_BUDGET_USD`                                 | Spend gate (defaults 3 / 2 USD if unset)                                        |
| `VITE_USE_MOCK_DATA`                                                              | Client mock for old AI helpers                                                  |

---

## 8. Migration assessment

No redesign — classification only.

### KEEP

- **`food_logs`**** + ****`food_log_groups`**** as the consumption event model** (`logged_at`, copied macros, provenance enums, metadata JSON, group undo)
- **Calories + protein/carbs/fat** as the nutrition core
- **Personal catalog split:** ingredients, composed/standalone combos, packaged `foods`
- **Search/ranking ideas:** normalized names, usage counts, attribute conflicts (`src/lib/food-search/`)
- **Quantity parsing and per-100g scaling** (`quantity.ts`, `nutrition-providers/math.ts`)
- **Packaged flow:** barcode → OFF → optional label OCR → canonical `foods` → log
- **Estimate draft → one or many logs** (`food-estimate/log.ts`)
- **AI infra:** request hashing, cache TTL, monthly budget reservation (`ai-infra/`)
- **Catalog export/import JSON** (`scripts/export-catalog.ts`, `import-catalog.ts`) as a data portability pattern
- **Frontend Quick Log UX** as a nutrition capture surface

### ADAPT

- **Single-user schema** → needs `user_id` / tenant everywhere (all 7 tables, all APIs)
- **Loose ****`source_id INTEGER`** → typed provenance (FKs or `{ source, externalId }` without integer coercion)
- **`metadata`**** JSONB** as a dumping ground (portion, isEdited, mods, USDA, Gemini versions) → explicit columns or versioned documents
- **Dual meal representations** (`Meal` / `LoggedMeal` / `FoodLog`) → one domain type with adapters
- **Goals in localStorage** → first-class targets (per user, dated)
- **Day = browser local midnight** → explicit timezone
- **Mods** → Health “calculators” / custom entry plugins, not calorie-tracker-specific meal_type hacks
- **Two AI stacks** (Gemini vs `ai.daurham.com`) → one provider interface; passcode is not real auth
- **Lazy ****`CREATE TABLE IF NOT EXISTS`**** in request handlers** → real migrations
- **In-memory rate limits** → shared store if Health is multi-instance
- **Search over four tables** → unified food index
- **`is_staple`**** / ****`meal_type`**** / search attributes** → generalized tagging for Health entities

### REPLACE

- **Hobby-plan single serverless dispatcher** (`api/index.ts` + `vercel.json` rewrites) if Health needs more than one function, streaming, or non-Vercel hosting
- **Unauthenticated public CRUD** on all nutrition data
- **Client-side hardcoded AI passcode** (`src/lib/ai/auth.ts`)
- **Neon/Stack Auth env without implementation** — do not treat as existing auth
- **Legacy ****`LoggedMeal`**** + localStorage today mirror + one-shot migration marker** (`nutritrack_food_logs_migrated_v1`)
- **`get-data.js`**** test endpoint** and **`client.ts`**** logging environment at startup**
- **Express dependency** (unused)
- **README / ****`init-db`**** omitting ****`ai_*`**** tables**
- **Denormalized combo macros + fragile DELETE trigger** as the source of truth (GET already recomputes)
- **Today-only analytics UI** as a substitute for Health progress/projections
- **Costco-pizza-specific mod** as platform architecture (keep as an example plugin, not a core table)
- **Vercel Postgres SQL client + ****`pg`**** Pool + ****`DATABASE_URL`**** vs ****`POSTGRES_URL`**** split** — pick one access layer

### UNKNOWN

- **Live database vs repo DDL.** `CREATE TABLE IF NOT EXISTS` does not alter existing columns. Whether production has extra columns, missing AI tables, or leftover `meal_combos.ingredients` was **not verified**.
- Whether `idx_foods_source_external_id` already exists on the deployed DB
- Actual usage of Stack/Neon Auth despite env names
- Whether `@neondatabase/serverless` is used at runtime (declared, not imported in app SQL)
- Completeness of `foods.food_type` / `confidence` vocabularies beyond `'packaged'` and the log unions
- Historical food_logs from before provenance enums (values only constrained in JS)
- Whether `recharts` chart primitives were intended for history that was never built
- Data volume, index adequacy, and whether `DECIMAL` precision `(5,2)` vs `(7,2)` has overflowed in production
- External `ai.daurham.com` contract beyond these three routes
- Browser timezone of the deployed user’s logs (all “today” queries depend on client)

---

## 9. Notes for Health platform designers

1. **Absorb nutrition by migrating ****`food_logs`**, not `LoggedMeal` or localStorage. Combos/ingredients/`foods` are supporting catalogs.
2. **Targets, identity, and timezone are the biggest gaps** relative to a combined Health app — they are not in Postgres today.
3. **Receipts, merchants, BIA, Apple Health, workouts, and body measurements have no existing schema.** Do not assume hidden tables.
4. **Verify production with ****`\d`**** / information_schema** before writing a migrator; this inventory is the **repository** schema, not a live dump.

Key verification paths: `src/lib/db/schema.ts`, `src/lib/db/food-logs-schema.ts`, `src/lib/db/foods-schema.ts`, `src/lib/db/ai-schema.ts`, `src/server/dispatch.ts`, `src/server/routes/`, `src/types/food-log.ts`, `src/hooks/useTodaysFoodLogs.ts`.