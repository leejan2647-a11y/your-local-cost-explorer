# CommitOps Local

An offline web app for AWS Cost and Usage Reports. Analyse files on your own device without connecting to any hosted CommitOps service or AWS account.

## Public installation

This GitHub-backed npm install is available now and does not require an npm login. Registry publication under `commitops-local` is pending publisher-account 2FA. The package has no installation scripts that analyse billing data.

```sh
npm install -g https://github.com/leejan2647-a11y/commitops-local/archive/refs/heads/main.tar.gz
commitops-local --setup
commitops-local
```

Or clone `https://github.com/leejan2647-a11y/commitops-local.git`, enter that directory, run `npm run setup`, then `npm start`. Open the private launch URL printed in the terminal at `127.0.0.1:8080`.

The dashboard has Overview, Files & checks, Commitments, Team allocation and Evidence & history views. Summary values come from the selected check; missing values stay unavailable. Financial evidence remains downloadable.

Includes all eight charge detectors, supporting billing-row evidence, Savings Plan and reserved-instance assessments, commitment allocation, local account-to-team mapping, observed spending history and monthly comparable-usage estimates. Missing source data and unsupported commitment inventory remain explicitly unavailable. Cloud usage is not company growth, revenue or profit.

## Install from a repository

Install Node.js 20+ and Python 3.12+ with `venv`. Clone this folder as its own repository, then:

```sh
npm run setup
npm start
```

Setup creates a private Python environment and downloads the pinned public Python dependencies. Normal startup and analysis need no internet. There are no npm runtime dependencies. Python and DuckDB perform the analysis; this is not a browser-only implementation.

## Install the prepared npm package

```sh
npm pack
npm install -g ./commitops-local-0.2.0.tgz
commitops-local --setup
commitops-local
```

The repository and npm launch the same application. For the current dashboard release, a local `npm pack` produces `commitops-local-0.2.0.tgz`.

If Python has a different executable name, set `COMMITOPS_LOCAL_PYTHON` when running setup. Windows uses `python`; Linux/macOS use `python3` by default.

Open the printed `http://127.0.0.1:8080/#token=...` URL. Keep it private. Use `commitops-local --port 8081` if 8080 is busy. The server only binds to IPv4 loopback, rejects foreign origins and Host headers, and requires an unpredictable launch token for data access. All assets are bundled; there are no analytics, CDNs, hosted authentication, mail, webhook, S3 or payment clients.

## Use

1. Upload local CSV, CSV.gz or Parquet CUR exports; identify primary and optional comparison files.
2. Select the analysis period and earlier, non-overlapping baseline period. Explicit comparison inputs remain separate from primary inputs.
3. Optionally enter exact service expectations and local AWS-account-to-team mappings.
4. Run the check. Expand findings, row evidence, commitment assessments, allocation, previous consumption and monthly observations. Download complete JSON or use the printable report.

The eight detector IDs are `unexpected-charge`, `spike`, `gradual-creep`, `new-charge`, `usage-cost-mismatch`, `marketplace`, `expectation-mismatch` and `unused-commitment`. Expectations and suitable source columns are needed for their corresponding measurements. A detector that cannot be assessed must not be read as a clean bill.

Monthly estimates preserve the engine's completeness requirements: date gaps are unknown, full observed calendar coverage does not prove complete exports, mixed quantities are not added, and incomplete/current-month observations do not become completed-month growth. Reported charges are not independently reconciled final invoices. Detailed observations include source hashes and exclusions.

## Local data and resource limits

The npm launcher stores files, mappings and results in your user data directory: `%LOCALAPPDATA%/commitops-local/data` on Windows, or `~/.local/share/commitops-local/data` on Linux/macOS. The Python environment is in the neighbouring `runtime-v1` folder. Direct Python startup supports `--data PATH` for a different private directory. No filesystem path can be submitted through the browser API.

Only one analysis runs at a time. DuckDB uses one thread, a 256 MB memory setting and at most 1 GB temporary spill; the app preserves an 8 GiB free-disk reserve. Inputs are streamed to disk, not collected in memory. The local edition accepts at most 2,000,000,000 combined input bytes per check. This is a technical safeguard, not a guarantee that every device or dataset can complete at that size. Decompressed content and group cardinality can require more resources than file size suggests. Cancellation stops the child process; incomplete financial results are not saved as completed.

Stop the app before removing its `data` folder to clear retained inputs/results/mappings. Keep any downloaded reports you need first. Billing reports contain AWS identifiers and tags; export and share deliberately. Local same-user malware or someone with your device access is outside the token's protection.

## Source and verification

`SOURCE-INVENTORY.json` records the allowlisted financial engine files and upstream/export hashes. The engine's arithmetic, detector and canonical deduplication logic are retained; adaptations remove hosted configuration, remote source support and extension downloads. Runtime Python outbound sockets and DuckDB extension auto-install/loading are disabled. The launcher strips cloud/application secrets from its child environment.

Run the focused local tests in an installed Python environment:

```sh
python -m unittest discover -s tests -v
```

The synthetic fixture builder under `tests/fixture.py` contains invented account IDs and billing data, with no authentication capability. The public distribution excludes the hosted API, migrations, authentication, billing, worker integrations, environment files, deployment scripts, production records and Git history.

MIT licensed. Python dependencies retain their respective upstream licences and are installed separately; no third-party service code is vendored.

