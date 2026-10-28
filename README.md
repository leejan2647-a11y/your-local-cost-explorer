# your-local-cost-explorer

Run `npx your-local-cost-explorer` or install with `npm install -g your-local-cost-explorer` and run `your-local-cost-explorer`. Open http://127.0.0.1:43187/. Node.js 20 or newer is required. First setup downloads a managed Python runtime and the pinned analysis dependencies; later analysis runs locally. No separate database, Docker or Python installation is required.

## Manual workspace

The React dashboard, Check Charges, Findings, Commitments, Allocation, Teams History, Reports, Library and Settings pages come from the main application. Local adapters supply SQLite persistence, loopback session authentication and local background processes. Upload CSV, gzip or Parquet, choose file-derived dates, optionally select comparison exports, and run a manual check. Reports support JSON and printable HTML downloads. Team mappings and settings stay on this device.

There are no AWS connections, schedules, delivery connections, email/webhook sends, hosted sign-in, payments or public report links. The Python service blocks outbound network connections; the browser uses same-origin API requests. Installation requires network access to public dependency registries.

No commercial file-size or batch-size ceiling is enforced. Available device memory, CPU and free disk determine what can complete. Resource errors are reported; missing data is not assumed zero. Cloud-usage changes do not establish company or revenue growth.

## From GitHub

Clone this repository, run `npm install`, then `npm start`. The built frontend is included. To edit the frontend: `npm --prefix frontend install`, then `npm run build:ui`. Source tests: managed Python `-m unittest discover -s tests -p test_main_manual.py -v`. No hosted credentials are needed.
