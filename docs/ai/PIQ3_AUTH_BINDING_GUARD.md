# PIQ-3 read-only Auth URL binding preflight (opt-in)

**Engineering safeguard only. Not a runtime attestation, session boundary audit, permission to use cloned owner data, migration or release approval.**

## Purpose

Neon automatically created a PIQ preview database branch from **parent data**, which may include private owner health records. Read-only Neon metadata indicates that candidate main and PIQ branches have different Neon Auth base URLs/JWKS paths, but one opaque auth-provider project identity is shared. Neither that finding nor different URLs establishes separate users, cookies, owner rights or data visibility.

The application currently accepts `NEON_AUTH_BASE_URL` from the environment and `HEALTH_OWNER_USER_ID` is configured for both preview and production (per **variable target metadata**, not decrypted values). A preview could therefore point its auth proxy at an unintended environment. This new code adds a deterministic, credential-safe **configuration** validator for that single failure mode.

## Preflight inputs

- `HEALTH_AUTH_PRODUCTION_BASE_URL`: intended **public** production Neon Auth base URL obtained independently from correct Neon branch metadata.
- `HEALTH_AUTH_PREVIEW_BASE_URL`: intended **public** PIQ preview Neon Auth base URL, from that exact child branch's metadata. Must differ from production.
- `HEALTH_AUTH_PREVIEW_GIT_REF`: `piq/00-baseline-20261014` for this candidate, checked against Vercel's actual ref.
- `NEON_AUTH_BASE_URL`: effective runtime configuration, inspected **in memory only**; no secret/token/password/cookie is read or returned by the validator.
- `VERCEL_ENV` and `VERCEL_GIT_COMMIT_REF`: actual deployment context.

Run `npm run auth:binding-preflight` **only inside an authorized exact deployment environment**, with independently verified expected public URLs. Exit 0 is a configuration match; exit 2 is a blocked reason. The tool never contacts Neon Auth, reads a session or emits URLs. Running it with copied environment values on a laptop does **not** certify a deployed Vercel function.

Opt-in `HEALTH_AUTH_BINDING_ENFORCE=true` enables the same validator when building the server-side auth proxy configuration. By default it is **OFF**; do not enable or change Vercel environment settings without separate owner approval. A wrong setting can prevent all logins. Invalid non-false settings fail closed.

## Still mandatory before owner QA

1. Prove actual runtime DB URL/Neon project/branch/database identity, plus actual runtime Auth base URL **for both environments**.
2. Independently verify the authentication **tenant, cookie/session keys, allowed identities, and owner-account isolation**; URL equality is not proof of that.
3. Confirm inherited private records are not accessible to a disposable QA user; a Neon child is write-isolated, **not empty**.
4. Perform verified encrypted backup/restore and authorized read-only migration preflight before any migration, owner-data writes, paid model smoke test, production merge or release.

No real credentials, patient rows, API calls, database writes or paid AI calls are used in the synthetic tests. All PIQ phases still require owner acceptance (0/9).
