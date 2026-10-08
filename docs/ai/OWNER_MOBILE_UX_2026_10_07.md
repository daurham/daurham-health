# October 7 owner mobile review

## UX patch
- Stable fixed-size rating and preferred-weekday controls; day override actions do not stretch to viewport width
- Training non-training days default to open/flexible instead of requiring rest/recovery labels when saving new plan versions
- Embedded Bristol chart accessible from the bowel tracker
- Daily participation XP visible at earning actions, with date-eligibility caution
- Pantry Add food opens the multi-source chooser; advanced manual entry remains
- Recipe ingredient search updates as the user types with cancellation and debounce
- Today Add food Edit opens canonical Food Editor and refreshes search on save
- Unlockable palette secondary accents appear on hero cards and other raised surfaces

## Separate schema-required follow-up
Six A, six B, six C requires repeated routine codes. Currently the plan validates unique codes and the database enforces UNIQUE(plan_version_id,routine_code). Complete as a separate migration-gated change before deployment. The UI patch does not claim to solve the six-session rotation.

## Sleep discrepancy
The received HAE report is aggregate import bookkeeping, not night-specific stage evidence. All 313 intervals matched and zero were ignored. The sleep nightly candidate sums the union of asleep stage intervals in the selected primary episode and may differ from Circular due to awake time, gaps, or additional episodes. Preserve the calculation until raw intervals for the exact night are compared with Circular's displayed definition and date.
