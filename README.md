# Your Local Cost Explorer

A local-only AWS billing dashboard, with its own light dashboard design and sidebar navigation. Upload CUR CSV, CSV.gz or Parquet exports and review reported charges, all eight detectors, commitment consumption, allocation and supporting evidence on your device.

## Install from npm

Install Node.js 20+ with npm, then:

```sh
npm install -g your-local-cost-explorer
your-local-cost-explorer
```

The package's install step automatically provisions a private Python 3.12 runtime and all pinned analysis dependencies. Python, pip, DuckDB and Arrow do not need separate installation. It downloads a pinned, SHA256-verified Astral uv binary and uses it to install managed Python and public PyPI wheels. Supported platforms: Windows, macOS and Linux (glibc), x64 and ARM64. Installation requires internet and sufficient free disk space. Node/npm are prerequisites because npm itself runs the installer; no administrator permissions are needed.

The first launch also checks setup, so environments that skip npm lifecycle scripts can recover automatically. To retry an interrupted installation:

```sh
your-local-cost-explorer --setup
```

Setup never opens or analyses billing files. Subsequent launches work offline after successful installation; ordinary analysis disables outbound Python sockets and DuckDB remote extension loading. Dependencies and runtime tools live privately under your user data directory, not inside the downloaded package. Installation does not change system Python or global PATH.

Open the printed `http://127.0.0.1:8080/#token=...` URL. Keep the launch token private. Use `your-local-cost-explorer --port 8081` if 8080 is busy. `your-local-cost-explorer --help` does not download or start anything.

## Install from GitHub

```sh
git clone https://github.com/leejan2647-a11y/your-local-cost-explorer.git
cd your-local-cost-explorer
npm install
npm start
```

`npm install` provisions the runtime automatically, just like the npm package. No Python or separate setup command is required. A GitHub archive works too: extract it, run `npm install`, then `npm start`.

## Manual workflow

1. **Dashboard billing files → Check Charges:** upload primary files on the Dashboard. The app detects their observed usage-date bounds and offers supported last 7, 30, 90 or 180 days ending at the latest supplied date. All earlier rows form the baseline. A 30-day export offers 7 and 30 days; selecting all 30 leaves no historical baseline. Bounds do not prove complete coverage. Choose manual dates when needed, optional service expectations, then run or cancel a check. Below the baseline dates, choose earlier rows, retained files from a previous completed check, or comparison files from your device. Comparison files stay separate; missing or changed retained sources are refused.
2. **Dashboard:** view reported charges, canonical observations, coverage, monthly observations and supported usage comparisons for a selected saved check.
3. **Findings:** search/filter by service/account/text, severity, detector and review status; inspect billing-row evidence; save local notes/statuses; archive and restore findings. Review annotations never rewrite calculated financial evidence.
4. **Commitments:** review Savings Plans/reserved instances, purchased/used/unused amounts and inventory limitations.
5. **Allocation and team mappings:** view supported category/account consumption, map 12-digit AWS account IDs to local teams, and preserve the mapping snapshot used by each result. Run a new manual check to apply changed mappings to new results.
6. **Reports:** generate named snapshots from one or several completed checks, rename/archive/restore/download/delete saved reports, download complete JSON, a readable standalone meeting HTML report or findings CSV, or print locally. Multiple check snapshots remain separate; totals are never added together. Whole-check reports are distinct from filtered findings views. CSV text is protected against spreadsheet formula interpretation.
7. **Dashboard billing files:** select retained file identities, inspect names/bytes/roles/hashes, remove files explicitly, and preserve already saved result evidence.
8. **Check history & evidence:** page through all saved runs, select previous results, archive/restore checks, review original evidence and baselines. Archived does not mean deleted.

All eight detector IDs are included: `unexpected-charge`, `spike`, `gradual-creep`, `new-charge`, `usage-cost-mismatch`, `marketplace`, `expectation-mismatch` and `unused-commitment`. Relevant optional columns, usable history and expectations are required for their corresponding measurements. Unsupported evidence is unavailable, never a fabricated clean assessment.

**There is no automatic path.** No schedules, rules, background discovery, AWS connections, hosted authentication, saved delivery connections, email or webhook sending, payment services, telemetry or hosted API clients are included. Check execution uses a local child process only after the user clicks Run. Progress polling observes that manually requested work; it cannot start another check. Reports are local files, as explicitly requested by the owner.

## Financial meaning

Estimates use only the AWS data provided. Changes in cloud usage do not establish company or revenue growth. Missing exports, workload changes, discounts and billing adjustments can affect the result.

Spending is reported AWS charges, not an independently reconciled final invoice. Finding impacts can overlap and must not be summed into a bill total. Monthly usage comparisons preserve coverage, currency, unit and compatible-basket requirements. Missing days remain unknown. Partial/open months never become completed-month growth just because time passes. Mixed quantities are not added. The existing exact decimal/canonical financial engine is reused.

## Storage and safeguards

User data lives in `%LOCALAPPDATA%/commitops-local/data` on Windows or `~/.local/share/commitops-local/data` on Linux/macOS. Runtime dependencies live in an isolated `runtime-v2-<dependency fingerprint>` folder, managed Python in `python`, and verified uv in `tools`. Direct Python launch supports an explicitly chosen `--data` directory. Browser requests accept stored upload IDs, never arbitrary filesystem paths or remote URLs.

The app binds only to `127.0.0.1`, validates Host/Origin and requires a random launch token for data access. A lifetime data-directory lease prevents two instances from damaging each other's work. Uploads are streamed; one analysis runs at a time; cancellation kills its child process without saving incomplete results as completed. SQLite transactions close their connections deterministically, including on Windows.

There are no fixed per-file or combined-check byte caps and no commercial quotas in the local edition. Your device's available hardware determines what it can process. The app uses all available CPU threads (respecting affinity/container quotas), allows DuckDB to use up to 70% of currently available RAM, and derives spill space from the working disk's current free space. It reserves proportional memory/disk headroom for Python, the operating system and other applications. One manually requested analysis uses this shared budget at a time.

CPU settings permit parallel work where the engine supports it; some stages remain serial. The Settings page shows current resource budgets. Device pressure or memory/disk exhaustion produces an explicit unavailable/interrupted outcome rather than a completed financial result. The app does not close other programs or promise that every file will complete. Decompression, column widths, group cardinality and other running programs affect requirements. Supported data formats and financial-evidence validity rules still apply regardless of file size. Users are responsible for their device, power and cooling.

To use another drive with more free space, choose trusted local directories at launch:

```sh
your-local-cost-explorer --data D:/CommitOpsData --work-dir D:/CommitOpsWork
```

`--data` selects the retained-data directory; existing saved data remains in its original directory until you intentionally migrate it while the app is stopped. `--work-dir` selects disposable processing storage. The browser cannot submit filesystem paths.

Stop the app before deliberately removing its data directory to clear all retained results/mappings. Save needed reports first. Removing individual retained files never deletes saved financial results. Local same-user malware and someone with device access are outside launch-token protection.

## Source and tests

`SOURCE-INVENTORY.json` records the allowlisted original financial modules and export hashes. `MANUAL-FEATURES.md` maps the local manual experience. Only intended financial code and local adapters are exported; no hosted repository history, private environments, user records, keys or provider configuration are included. New dashboards use native bundled HTML/CSS/JS with no remote fonts, scripts or assets.

After a source install, `npm test` runs focused Node tests (Node 22.22.2+ for the development-only jsdom test dependency). Python tests under `tests/` use only synthetic data and temporary local storage. The financial engine has separate earlier parity receipts; unchanged calculations are not re-tested for every stylesheet edit.

MIT licensed. Astral uv is downloaded separately under its upstream MIT/Apache-2.0 terms; managed CPython and installed Python/npm dependencies retain their respective upstream licences. No third-party UI component source was vendored. Forge, Magic UI and Uiverse were consulted as design references; Button names, page responsibilities and manual workflow behavior follow the main application; its palette and visual layout are not copied. No hosted assets or integration code are included.
