# Natural-language meal logging reliability

## Scope

The owner frequently pastes a complete meal description instead of assembling foods or recipes. This change makes a one-shot description the fast path: estimate, glance at nutrition, optionally inspect assumptions, and log. No migration, env variable, model change, or new provider is required.

## Changes

- Gemini's description request has a 20 s budget and up to 4096 output tokens for large multi-item JSON, while remaining a single billable call through the existing shared AI ledger.
- Use the existing Gemini JSON Schema request facility for the *description* route only; preserve the photo and label contracts.
- Make unknown ingredient quantities optional, and instruct the model to keep an entire weighed mixed dish at the given total weight rather than multiplying the mass across ingredients.
- Do not drop named foods; assume reasonable portion sizes where necessary, and show those assumptions to the user.
- Reject missing core macros rather than silently treating them as zero. Preserve unknown optional fiber/sodium as null.
- Expose an immediately available whole-meal estimate and Log button. Ingredient editing and macro overrides remain opt-in, not required before logging.
- Log a one-time estimate directly to Nutrition; only Save for later creates a reusable Pantry food.

## Regression coverage

- Long salmon/egg/rice/legume/sauces description, with explicit mixture and weight assumptions
- Sum of per-item calories rather than trusting a model's separate total
- Invalid/incomplete provider macros cannot silently log as zeros
- Structured-output schema, timeout, and token ceiling expectations
- Quick log versus Pantry save semantics

## Risks / deployment

- Real Gemini response quality still requires owner QA; tests use mock provider output.
- Max allowed output is a ceiling, not the number of tokens charged; shared AI budget/rate gates remain in force.
- UI review/commit remains explicit; AI never silently writes canonical Nutrition rows.
- No database migration needed. Keep I0-I10 production migration rollout independently gated.
