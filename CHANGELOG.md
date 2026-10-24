# Changelog

## Unreleased - streamlined reading workflow

- Removed the dashboard sidebar and moved allowance settings to the top-right header.
- Added an accessible Add reading choice dialog with demo-only photo preview and manual entry.
- Successful new readings scroll to the history table; demo remains offline and synthetic.


## Unreleased - architecture diagrams and interval usage chart

- Replaced outdated architecture notes with Mermaid system and transaction-flow diagrams, boundaries and engineering trade-offs.
- Added a dependency-free SVG chart of average litres/day between observations, with a daily allowance reference and accessible interval detail.
- Mirrored charts in the synthetic GitHub Pages demo, added DST/interval unit tests and browser regression assertions.

## Unreleased - API and database regression coverage

- Extended MySQL-backed tests for rollback after real insert/update/delete statements, concurrent conflicting create/update requests, and duplicate-index integrity.
- Added HTTP authentication-denial tests and safe error/recovery tests for SQL write and database connection failures.
- Documented the isolated test contract and known concurrency limitations.

## Unreleased - automated verification

- Added a read-only GitHub Actions workflow for PRs and main pushes on standard public-repository Ubuntu runners.
- CI checks reproducible installation, unit tests, JavaScript syntax, offline Chrome workflows and an isolated MySQL 8 HTTP integration test.
- Added a README build-status badge. Production deployment and data are excluded from CI.


## Unreleased - AdminLTE dashboard redesign

- Replaced the minimal screen with a responsive AdminLTE 4.10.0 dashboard.
- Added an overview sidebar, four water-usage KPI cards and an improved reading-entry workspace.
- Retained the original app data contracts and isolated synthetic-data demo.
- Preserved third-party MIT notices and added repeatable mobile/desktop browser testing.
- Updated screenshot and public documentation.

## Initial public portfolio source - 2026-10-23

- Removed personal defaults, private history, environment secrets and obsolete files.
- Added synthetic examples, validation, transactional chronology writes, automated tests and offline demo.
- Published the independently reviewed MIT-licensed source copy.

## 24 October 2026 — Historical MIT release retirement

- The MIT-licensed `v1.1.0` GitHub Release listing and Git tag were deleted at the owner's request after current `main` had changed to All Rights Reserved.
- The original historical commits remain accessible through Git history, and rights granted to earlier recipients under MIT were not revoked.
- Current application code remains All Rights Reserved; separately licensed AdminLTE material remains MIT-licensed.
