# 0.3.0

- Keep the local light palette/sidebar; align button names and manual page responsibilities with the main app.
- Add general settings (company name, date defaults, creep sensitivity), team CRUD, saved multi-check report snapshots and local review/history workflows.
- Keep connections, automatic discovery, schedules, rules, hosted accounts and delivery services absent.
- Provision private Python and dependencies automatically on npm/source install, with first-launch recovery and immutable dependency-version runtimes.
- Remove fixed per-file/combined-input, DuckDB memory and spill-size caps. Derive parallelism, memory and disk budgets from available hardware, preserving OS headroom.
- Add explicit device-resource failures, resource visibility and trusted CLI storage selection.
- Fix Windows SQLite handle closure. Preserve financial evidence and report snapshots during configuration/review changes.

Focused verification: Settings/report/team validation and snapshots; HTTP manual-only routes; mocked 5/6 GB admission without allocating large files; adaptive budgets and memory-pressure interruption; installer checksum/runtime isolation; dashboard navigation/filtering/evidence/escaping/exports; automatic Windows/Linux setup; a small CSV/gzip/Parquet exact financial control with adaptive parallelism. No large-file laptop stress test or unsupported capacity guarantee.
