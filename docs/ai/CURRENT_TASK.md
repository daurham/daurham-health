# Current Task — V2-F5 Literature-Backed Evidence Drawer

Status: ready_for_implementation

Baseline commit:

30c91b20230f5db05025b608588442f13bfd812b

Expected baseline:
- V2-F4 acceptance correction complete
- 872 tests passing across 103 files
- typecheck, lint, and production build passing
- schema head 0031_experiment_origins.sql
- Design manual 1.0.35
- package 1.0.0

Follow AGENTS.md and all persistent files under docs/ai/.

## Objective

Implement V2-F5 Literature-Backed Evidence Drawer.

Ask Health already explains the owner's bounded personal Health evidence.

F5 adds a separate, explicit, on-demand view of relevant published biomedical literature.

The product must preserve this distinction:

Your Health evidence != External research

Personal evidence remains canonical and deterministic. Literature is external context.

Literature must never silently become a personal measurement, diagnosis, causal conclusion, Goal, Experiment, or other canonical Health fact.

## Product flow

Ask Health question/answer
-> owner opens External research
-> owner sees and may edit the exact literature query
-> owner explicitly chooses Search research
-> server queries a bounded biomedical literature provider
-> deterministic source records
-> optional Gemini synthesis over only those retrieved sources
-> source-linked research summary plus source cards

Nothing in this flow changes the existing Ask Health answer.

Do not automatically retrieve research for every Ask Health question.

## Provider decision

Use Europe PMC REST search for the initial literature provider.

Create a provider adapter rather than scattering Europe-PMC-specific parsing through handlers or React.

Initial search should use:
- the official Europe PMC production REST host
- format=json
- resultType=core
- PubMed-indexed sources only
- sources with abstracts only
- a small bounded page size

Conceptually constrain the provider query to:

(owner-visible query) AND SRC:MED AND HAS_ABSTRACT:Y

Request no more than about 8 provider results and retain at most 5 valid deduplicated sources.

Do not crawl arbitrary web pages, retrieve PDFs, or fetch full text.

Tests must inject fixtures/mocks rather than use the live provider.

## Migration and persistence

No migration.

Schema head remains 0031_experiment_origins.sql.

Initial F5 persistence policy:
- literature queries are not persisted
- provider results are not persisted
- abstracts are not persisted
- AI literature synthesis is not persisted
- Ask Health conversation persistence remains unchanged
- no literature table
- no Experiment-to-literature table
- no localStorage persistence

This resolves the earlier open persistence decision conservatively: on-demand retrieval and page/session state only.

A future task may add durable research links if a concrete canonical use case requires them.

## Versions

Retrieval calculation version:
literature-retrieval-v1

Synthesis prompt/version:
literature-synthesis-v1

AI request type:
literature_synthesis

## Privacy boundary

Before any literature-provider request, the owner must be able to see and edit the exact outbound search query.

Europe PMC receives only:
- the visible query
- fixed provider filters/options

Do not send Europe PMC:
- Ask Health evidence packet
- personal measurements
- Health notes
- conversation history
- Goals
- Experiments
- supplements
- source provenance
- generated Ask Health answer

The literature provider must never receive a hidden personal-data payload.

## Query prefill

Ask Health may prefill a literature query from the current user question.

Implement a small deterministic helper, approximately:

buildLiteratureQueryPrefill(question)

It may:
- collapse whitespace
- remove obvious first-person filler
- remove standalone numeric personal values, dates, and units where practical
- cap the result to a small number of useful terms

It must not:
- call Gemini
- inspect the Health evidence packet
- add medical claims
- send anything automatically

The owner may edit the prefill before submission.

If cleanup is uncertain, prefer a minimally cleaned visible query over hidden semantic invention.

## Query validation

Server input should contain only the literature query required by this endpoint.

Suggested limits:
- nonempty
- max 300 characters
- normalized whitespace
- no control characters
- no client-supplied provider URL

Advanced Europe PMC query syntax is not required.

Do not create an SSRF surface.

## API

Prefer:

POST /api/ask-health/literature

Input approximately:

{
  "query": "sleep duration resistance training recovery"
}

Do not require lens, range, asOf, evidence packet, or Ask Health transcript.

This is a separate external-evidence operation.

Wrong method returns 405.

## Source normalization

Normalize Europe PMC into a provider-independent domain/server shape with fields approximately:

- sourceRef
- provider = europe_pmc
- pmid
- doi nullable
- title
- journal nullable
- publicationYear nullable
- authors bounded
- studyType
- transient abstractText

Raw abstractText is server-only synthesis evidence and is not part of the browser-facing source record.

## Stable citation identity

Use deterministic refs:

pubmed:<PMID>

The PMID comes from the provider.

Gemini never creates citation identity.

## Required source fields

Retain a provider record only when it has:
- PMID
- nonempty title
- nonempty abstract

DOI, journal, publication year, and authors may be missing.

Missing metadata remains missing.

## Deduplication

Deduplicate by PMID.

DOI may be a secondary defensive duplicate signal if useful.

Do not merge distinct PubMed records because titles look similar.

## Study-type classification

Derive a descriptive study type only from provider publication-type metadata.

Suggested bounded machine categories:
- systematic_review
- meta_analysis
- randomized_trial
- clinical_trial
- observational
- review
- other

Use deterministic precedence when multiple provider publication types exist.

This is descriptive metadata, not:
- a quality score
- certainty grade
- ranking of truth
- recommendation strength

Do not add an evidence score.

Provider relevance order may remain display order after invalid/duplicate rows are removed.

## Browser source cards

Show deterministic metadata:
- study type
- title
- journal
- publication year
- bounded author display
- PubMed link
- DOI link when present

Generate links from trusted identifiers.

PubMed:
https://pubmed.ncbi.nlm.nih.gov/<PMID>/

DOI:
https://doi.org/<encoded DOI>

Do not render arbitrary provider-supplied URLs.

## Abstract handling

Abstracts may be used transiently for synthesis.

Do not:
- persist abstracts
- include abstracts in backup/export
- store abstracts in localStorage
- reproduce full abstracts in the Health UI
- ask Gemini to quote them

Gemini paraphrases.

Bound each abstract before prompt construction.

Suggested maximum:
3000 characters per source

Bound the total serialized synthesis evidence.

Suggested total:
18000 characters

If the packet is oversized, drop lowest-provider-ranked sources first.

Never drop the source identity needed for validation.

## Retrieval response

The deterministic response should expose approximately:
- calculationVersion
- provider
- visible query
- browser-safe source metadata
- synthesis nullable
- notice nullable

Raw abstracts must not be included in the browser response.

## Explicit action only

Submitting an Ask Health question causes:
- zero literature-provider calls
- zero literature_synthesis ai_usage reservations

Opening the drawer also causes no external call.

Only the explicit Search research action may perform retrieval.

## Retrieval failure

Handle provider timeout, provider failure, invalid JSON, and zero valid results cleanly.

Provider failure copy may be approximately:

External research is unavailable right now. Your Health evidence is unchanged.

No-results copy may be approximately:

No PubMed-indexed sources with abstracts were found for this search.

Zero valid sources means zero Gemini call and zero AI reservation.

## AI synthesis

Gemini may summarize only the bounded retrieved source set.

It does not perform the literature search.

It does not invent sources.

It does not receive the personal Ask Health evidence packet or transcript.

### Model configuration

Use AI_LITERATURE_MODEL.

Fallback through the established server Gemini model chain.

Suggested cost reservation variable:
AI_LITERATURE_MAX_REQUEST_COST_USD

A conservative default of $0.05 is acceptable if appropriate to the bounded packet.

### Shared durable budget

Reuse ai_usage.

Literature synthesis shares:
- AI_MONTHLY_BUDGET_USD
- durable reservation
- global provider-call rate gate
- uncertain-call accounting
- actual-cost finalization

Process memory is not budget authority.

The Europe PMC search itself is not a Gemini call and does not create ai_usage.

### Synthesis input

Gemini receives only:
- normalized research query
- source refs
- source titles
- deterministic study-type labels
- journal/year metadata where available
- bounded abstract text

No personal Health packet or conversation.

### Synthesis output contract

Keep output narrow, approximately:

{
  "blocks": [
    {
      "text": "Published research commonly reports an association between ...",
      "source_refs": ["pubmed:123", "pubmed:456"]
    }
  ]
}

Rules:
- max 4 blocks
- every block cites at least one retrieved source
- every cited ref exists in the current retrieval result
- no Gemini-created source/citation object
- no Gemini-created URL
- no Gemini-created bibliography
- no Gemini-created study title
- unknown refs reject the whole synthesis
- malformed output rejects the whole synthesis

The UI owns source metadata and links.

## Quantitative-claim boundary

Initial F5 fails closed on model-generated numeric research claims.

Do not ask Gemini to reproduce:
- effect sizes
- percentages
- confidence intervals
- doses
- thresholds
- sample sizes
- p-values

until those facts are extracted deterministically into structured fields in a future phase.

For initial F5, reject synthesis prose containing numeric digits.

Publication years and other provider metadata are rendered by source cards, not model prose.

## Medical and causality boundary

Literature synthesis must not:
- diagnose the owner
- state that a paper proves what is happening personally
- convert group research into an individual conclusion
- recommend medication changes
- recommend supplement-dose changes
- recommend starting/stopping a supplement
- prescribe treatment
- claim a personal causal mechanism
- claim the owner's Health data validates a paper

Preferred framing:
- These sources discuss...
- In the retrieved literature...
- One review reported...
- These studies do not establish what is happening in your individual case.

Do not say:
- Research proves why your metric changed.
- You should take...
- Your data confirms...

## Deterministic limitation copy

Always show a product-owned limitation approximately:

This is a targeted literature search, not a systematic review. It may miss relevant studies and does not establish what applies to you personally.

Gemini does not generate this disclaimer.

## Synthesis fallback

If Gemini is:
- budget blocked
- rate limited
- unconfigured
- timed out
- malformed
- rejected for citation refs
- rejected for numeric prose

still show the deterministic source list.

Suggested notice:

Research summary unavailable. Showing the retrieved sources instead.

The literature feature remains useful without AI prose.

## Cache

Process-local cache is optional.

If implemented, fingerprint:
- normalized query
- retrieval version
- ordered source refs/source fingerprint
- prompt version
- model

A valid cache hit may avoid another Gemini call.

Cache is not persistent and not budget authority.

## Ask Health UI

Integrate into the existing Ask Health answer surface.

Preferred structure:

Answer

Your Health evidence
(existing F1 evidence panel)

External research
(collapsed until owner opens)

Do not mix external literature into the numbered personal Evidence panel.

## Research citation namespace

Use a visually distinct namespace for external literature, for example:

[R1]
[R2]

Personal Health evidence keeps its existing marker behavior.

R1 is not an F1 evidence ref.

F5 has its own source map and validator.

## Drawer states

Support:
- idle
- editable query
- searching
- sources found
- synthesis available
- synthesis fallback
- no results
- provider error

No artificial typing delay.

## Privacy copy

Near the research action, say approximately:

Only the research query shown here is sent to Europe PMC. Your Health evidence, notes, and conversation are not sent to the literature provider.

Keep this statement technically true.

## Separation from personal answer

F5 does not rewrite the existing Ask Health answer after research returns.

Personal evidence and external research are adjacent but separate.

A future phase may explicitly compare them under a new contract.

## Personal Lab / F4 boundary

F5 does not automatically create or propose an Experiment from a paper.

Do not add:
- Create experiment from study canonical mutation
- automatic external_research Experiment
- persisted Experiment-to-paper relation
- protocol copied from an abstract

The external_research origin vocabulary remains available for future work.

A simple navigation link to Personal Lab is acceptable only if it carries no hidden canonical proposal payload.

## F2 / F3 / Today boundaries

Proactive Insights and Weekly Coach remain unchanged.

No literature retrieval in:
- Progress load
- Weekly Coach load
- Weekly Coach Generate
- Today
- Needs Attention

No literature records enter:
- Timeline
- Goals
- cross-domain engine
- canonical evidence

## Backup/export

No change.

On-demand literature query/results/synthesis do not enter:
- full backup
- portable export

ai_usage continues its existing full-DR policy.

## Demo

Demo must never call Europe PMC or Gemini.

Do not fabricate citations.

Preferred:
- show the External research drawer
- use a small compiled fixture containing real PubMed-indexed citation metadata verified during implementation
- label it clearly as an example research drawer
- zero provider calls
- zero ai_usage
- zero owner API fallback

If maintaining verified real citation metadata is impractical, show a provider-disabled example state rather than inventing a paper.

Fictional Health evidence remains fictional.

## Auth

Private literature endpoint remains owner-only.

Expected:
- anonymous -> 401
- authenticated non-owner -> 403
- owner -> allowed
- Apple ingest token -> no authority
- wrong method -> 405

## Provider implementation constraints

Use native server fetch or the repository's established HTTP helper.

Required:
- fixed Europe PMC host/path
- timeout
- bounded page size
- no retry storm
- validated JSON shape
- malformed result items ignored
- correctly encoded query parameters

Do not make Europe PMC requests directly from the browser.

## Required tests

Add focused tests covering at least:

1. Ask Health submit makes no literature call.
2. Opening the drawer makes no literature call.
3. Explicit research action is required.
4. Empty/invalid query is rejected before provider call.
5. Query length/control-character bounds.
6. Provider URL is fixed; client cannot supply an arbitrary URL.
7. Europe PMC request contains the visible query plus fixed MED/abstract filters.
8. Parser requires PMID, title, and abstract.
9. Missing optional DOI/journal/year/authors remains missing.
10. PMID deduplication.
11. Stable pubmed:<PMID> refs.
12. Maximum five retained sources.
13. Deterministic provider order.
14. Deterministic study-type classification.
15. No quality/evidence score exists.
16. Browser response contains no raw abstract.
17. Server synthesis packet contains bounded abstract evidence.
18. Literature provider receives no Health evidence packet.
19. Gemini receives no personal Health packet/transcript.
20. Zero valid sources means no Gemini call and no ai_usage reservation.
21. Successful synthesis uses only retrieved refs.
22. Unknown source ref rejects synthesis.
23. Block without source ref rejects synthesis.
24. Gemini-created source/URL/citation fields are rejected.
25. Model-generated digits/numeric claims reject synthesis in v1.
26. Provider failure leaves the existing Ask Health answer untouched.
27. AI budget failure still shows source cards.
28. AI timeout follows existing uncertain ai_usage semantics.
29. AI-not-configured follows existing released semantics.
30. Returned-but-invalid synthesis still counts provider cost.
31. Shared monthly budget and global rate gate are reused.
32. Source links derive from PMID/DOI only.
33. Existing F1 evidence markers remain unchanged.
34. External research uses a distinct research-marker namespace.
35. No canonical Health write occurs.
36. No Experiment/Goal/Timeline/Insight/Coach mutation occurs.
37. No query/result/abstract/synthesis enters backup/export.
38. No literature state enters localStorage.
39. Demo makes no provider/Gemini/owner API calls.
40. Auth and wrong-method behavior.
41. F1/F2/F3/F4 regressions remain green.

Run:
- npm test
- npx tsc -b
- npx eslint .
- npm run build

No migration should be applied.

## Manual QA

When owner auth is available:

1. Ask a normal Ask Health question.
2. Verify no literature request occurs automatically.
3. Open External research.
4. Verify exact query is visible/editable.
5. Trigger research explicitly.
6. Verify real PubMed identifiers on source cards.
7. Open a PubMed link.
8. Verify DOI link when present.
9. Verify no full abstract is displayed.
10. Verify research markers are distinct from personal Evidence markers.
11. Verify every synthesis block maps to displayed sources.
12. Verify targeted-search limitation copy.
13. Verify only the visible query appears in the Europe PMC request.
14. Test no-result behavior.
15. Test provider failure.
16. Test AI-budget fallback.
17. Verify Ask Health answer remains unchanged.
18. Refresh and verify literature state is not durable.
19. Verify Today, Progress, Weekly Coach, Lab, Goals, and Timeline are unchanged.
20. Test 390px layout.
21. Run automated validation.

## Documentation

On completion:
- update HEALTH-PLATFORM-DESIGN-MANUAL.md
- expected manual version 1.0.36
- add a new historical ledger row
- update HEALTH-PLATFORM-V2-LAB-BLUEPRINT.md
- mark V2-F5 implemented
- mark V2-F Ask Health + Proactive Intelligence complete if no other V2-F subphase remains
- document Europe PMC as the initial provider
- document the on-demand/no-persistence decision
- document privacy boundary
- document source-ref/study-type semantics
- document AI synthesis and numeric-claim boundary
- document shared ai_usage behavior
- document F4/Personal Lab boundary
- update docs/ai/DEV_STATE.md
- update docs/ai/DECISIONS.md
- update docs/ai/ROADMAP.md
- update docs/V2-ROADMAP.md live status as appropriate

Do not rewrite older manual ledger rows or historical amendments.

Schema remains 0031_experiment_origins.sql.

Package remains 1.0.0.

## Acceptance criteria

F5 is complete only when:
- literature retrieval is explicit/on-demand
- ordinary Ask Health makes no automatic research call
- owner sees/edits the outbound query
- only that query is sent to Europe PMC
- personal Health evidence is not sent to Europe PMC
- provider access is server-side and fixed
- search is bounded to PubMed-indexed records with abstracts
- source normalization and dedupe are deterministic
- source refs derive from PMID
- source metadata and links are server-owned
- raw abstracts are transient
- study type comes from provider metadata
- no quality score exists
- Gemini synthesizes only retrieved sources
- Gemini cannot invent citation identity
- every synthesis block has validated source refs
- initial synthesis cannot emit numeric research claims
- external research remains distinct from personal evidence
- existing Ask Health answer is not rewritten by literature
- failures preserve source cards or personal answer as applicable
- zero sources means zero Gemini call
- Gemini uses shared durable ai_usage
- research state is not persisted
- backup/export remain unchanged
- no automatic Experiment proposal/creation occurs
- F2/F3/Today/Timeline/Goals remain unchanged
- demo is provider-free with no fabricated citation
- auth remains correct
- tests pass
- typecheck passes
- lint passes
- production build passes
- docs updated
- V2-F5 is marked implemented

## Required completion report

Update docs/ai/DEV_STATE.md with:
- baseline commit
- resulting commit / working-tree state
- migration/schema decision
- retrieval calculation version
- synthesis prompt/version
- Europe PMC adapter behavior
- query/privacy behavior
- source normalization/deduplication
- study-type behavior
- result/source limits
- abstract bounding
- AI output contract
- citation validation
- numeric-claim boundary
- ai_usage integration
- UI/drawer behavior
- Ask Health integration
- F2/F3/F4 boundaries
- persistence/backup/export
- demo/auth
- tests/count
- typecheck/lint/build
- manual QA
- documentation version
- deviations
- remaining v2 work after F5

When finished, reset CURRENT_TASK.md to the standard no-active-task template, commit, and push according to AGENTS.md.

## Final invariant

Health may say:

Your Health evidence shows the personal observations used in this answer.

Separately, after an explicit search:

External research: these retrieved PubMed-indexed sources discuss a similar topic. [R1] [R2]

It must not collapse those into:

Research proves why your personal metric changed.

Personal observations and published research remain two different kinds of evidence.
