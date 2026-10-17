# PIQ-4.2 — Training session dual-source agreement (development only)

Current personalized Ask Health independently loads canonical Progress sessions
and shared Intelligence training observations. The initial views can disagree
if a workout changes between reads. The deterministic source check compares
session IDs, dates, exact counts and recorded effort means for the selected
Health-local range, including source identity. No additional database queries
or paid provider calls are required.

On disagreement, the packet withholds direct Training count, frequency,
exercise trends and focused working-set appearances, plus Training components
of shared Intelligence (coverage, baseline, intervention, knows/missing and
whole relationships with either Training operand). A neutral, non-substantive
warning replaces the claims. A focused current weight-energy response also
withholds its cross-signal interpretation if conflicting Training participation
could contaminate its supporting evidence.

The Intelligence frame synthesizes zero sessions for completed no-session days.
Today is provisional: an absent session is not an observed zero. A direct count
match without exact session IDs is insufficient. Neither same-ID session
agreement nor this screen attests the version/content of each working set.
Historical as-of sources, later revisions, source-of-truth completeness,
atomic transaction isolation and independent strength comparisons remain
unverified. No personalized calorie change, diagnosis or strength-preservation
claim is authorized.

Validation requires full TypeScript, lint, Vitest and build CI at an exact
commit SHA, followed by owner preview acceptance. Owner acceptance is still
0/9. Do not merge to main, run migrations, deploy production or spend
a paid AI-provider budget as part of this change.
