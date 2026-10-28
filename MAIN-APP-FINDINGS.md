# Main application findings - recorded only

2026-10-28. Main application source was not modified during the local React migration.

## Date preset uses N+1 inclusive days

`commitops-web/src/lib/window-choice.ts`, `datesFromAnchor`, computes windowStart as anchor minus N days and includes both endpoints. A 30-day preset therefore selects 31 calendar days. Its dialog explicitly labels this behavior. This differs from the latest local-edition request for the last N days. Local copy now selects exactly N inclusive days; hosted behavior is recorded for owner review without changes.
