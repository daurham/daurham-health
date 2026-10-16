# PIQ-3 read-only database binding preflight and optional runtime guard

**Engineering control — NOT a verified production/preview runtime identity, owner acceptance, medical data access, or deployment authorization.** See [environment discovery](./PIQ3_ENVIRONMENT_READONLY_DISCOVERY_20261016.md).

## Purpose

The existing server resolves `DATABASE_URL` directly for queries. A Vercel-created Neon preview branch proves only branch creation, **not** that a running Vercel Function uses that branch rather than the default Neon branch. The preview branch was initialized from **parent-data** and may contain private health records.

A new **read-only**, credential-safe preflight compares the configured `DATABASE_URL` hostname in the **process running the check** against independent, non-secret Neon endpoint host metadata for **both** production and preview. It checks `VERCEL_ENV`, the exact Git ref and endpoint distinctness. The result contains only `VERIFIED_EXPECTED_ENDPOINT` or a stable non-secret blocking reason. No database connection, SQL, model request, fetch, upload, mutation or logging of an endpoint/credential occurs. The `-pooler` hostname variant is normalized. Connection URL routing overrides are rejected.

**Important:** Passing the tool after copying environment variables onto a laptop proves only **that laptop's** effective configuration. To certify a deployment, the check must run inside an appropriately authorized deployment environment or via an equivalent trusted attestation of **that exact** deployment's injected configuration. Do not treat Vercel's project-wide variable-name list as the runtime truth.

## Inputs (host metadata is non-secret; credentials stay in the running process)

- `HEALTH_DB_PRODUCTION_ENDPOINT_HOST`: the **host only**, obtained independently from Neon project's correct default branch → compute endpoint metadata. No URL, user, password, or port.
- `HEALTH_DB_PREVIEW_ENDPOINT_HOST`: the **host only**, obtained independently from the PIQ preview Neon branch → compute endpoint metadata. Must be distinct from production host.
- `HEALTH_DB_PREVIEW_GIT_REF`: the exact preview Git branch ref, e.g., `piq/00-baseline-20261014`. Required when running for preview.
- `VERCEL_ENV`: set by Vercel to `production` or `preview`. Development and absent targets are blocked.
- `VERCEL_GIT_COMMIT_REF`: Vercel's actual deployment Git ref. Production requires `main`; preview requires the exact configured preview ref.
- `DATABASE_URL`: the process's **existing** connection string. It is parsed only in memory and never displayed.

Run `npm run database:binding-preflight` **only where those inputs refer to the authorized target**. Exit code 0 = configuration **verified**, 2 = **blocked**. Missing variables or conflicting host, environment, ref, pooled host, routing options and malformed inputs fail closed. Output is just `PIQ database binding preflight — VERIFIED (VERIFIED_EXPECTED_ENDPOINT)` or `... BLOCKED (REASON_CODE)`. Do not paste `.env` files, Vercel env pulls, database URLs or private records into chat, CI artifacts or GitHub.

## Runtime guard (disabled by default)

The same validator is called immediately before returning `DATABASE_URL` in the existing server DB resolver **only if** `HEALTH_DB_BINDING_ENFORCE=true`. If enabled and mismatched, server database operations fail closed with a static reason code and no credential disclosure. Missing/typo enforcement values other than `false` are rejected if supplied. By default, it makes **no change** to existing app traffic or deployments.

**Do not enable in the real Health deployment or change Vercel environment variables without separate owner approval and backup/rollback preparation.** Incorrect expected endpoint metadata could otherwise prevent Health data reads. The guard checks effective connection *configuration*, not that Neon Auth, other external jobs or future independent DB clients target the same branch, nor row-level privacy and backup recoverability.

## Unmet release gates

- The exact serving SHA is verified; the running deployment's effective database branch is **not**.
- The Neon preview branch is Vercel-created and copy-on-write isolated but initialized from real parent data; it is **not verified safe for owner-data QA**.
- Both intended branch endpoint hosts can be independently retrieved from Neon metadata; **no actual deployed DATABASE_URL was inspected or attested**.
- Production backup/restore, read-only schema migration preflight and owner-authenticated mobile/provider QA still require their own authorization and evidence.
- The synthetic tests cover URL parsing, pooled/direct normalization, cross-branch block, wrong Git ref, missing inputs, unsafe overrides, no-secret diagnostics and opt-in behavior. No live database or actual Vercel environment values are used.

Formal PIQ acceptance remains **0/9**; this increment is engineering hardening only.
