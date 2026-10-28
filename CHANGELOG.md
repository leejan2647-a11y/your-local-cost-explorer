# 0.4.0 - Your Local Cost Explorer

- Rename the public project and npm command to `your-local-cost-explorer`. Keep the existing private data/runtime directory so upgrading does not lose saved work.
- Keep the local light design and sidebar. Remove Data Sources navigation; upload and retained-file controls appear only on Dashboard. Replace broken dash characters with `-`.
- Inspect observed CUR dates locally for CSV, gzip and Parquet. Offer supported 7/30/90/180-day windows ending at the supplied data's latest date, with earlier rows as baseline. Missing history stays unavailable.
- Put previous-check and device-file comparisons below the baseline fields. Retained comparisons verify original file hashes and cannot contaminate primary data.
- Preserve all eight detectors, exact decimal financial calculations, commitments, allocation, settings and downloadable local reports. No hosted or automatic connections are included.

Focused verification: real loopback uploads, CUR date aliases/formats/conflicts, calendar windows, previous-check provenance and separation, DOM upload/period/button behavior, small independent signed-charge/rounding ledger, duplicate removal, original eight-detector and commitment controls, hosted pricing withdrawal tests, frontend typecheck and production build. No large-file laptop stress test.
