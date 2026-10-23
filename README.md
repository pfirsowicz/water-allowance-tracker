# Water Allowance Tracker

[![CI](https://github.com/pfirsowicz/water-allowance-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/pfirsowicz/water-allowance-tracker/actions/workflows/ci.yml)

A small full-stack application for tracking cumulative meter readings and daily water allowance. Built with Node.js, Express, MySQL and vanilla JavaScript, featuring the responsive **[AdminLTE 4](https://github.com/ColorlibHQ/AdminLTE)** dashboard template.

**[Try the interactive synthetic-data demo](https://pfirsowicz.github.io/water-allowance-tracker/)**

![Waterline dashboard screenshot](docs/screenshot.png)

The public demo stores synthetic readings only in browser memory. It never connects to the author's personal database or private deployment. Reloading resets its data.

## Features

- Historical **average litres/day between consecutive meter readings**, shown in an accessible SVG bar chart against the configurable allowance. The chart never invents daily readings.

- Dashboard KPI cards: remaining allowance, status, average and total use
- Full-width responsive dashboard with reading-entry dialog and top-right allowance settings
- Manual date and meter-reading entry; camera capture is explicitly unavailable in the public demo
- Validated CRUD and CSV export of reading history
- Configurable baseline and daily litre allowance
- Chronology protection, parameterised SQL and private Basic Auth backend
- Self-contained, offline-capable synthetic-data demonstration

## Run locally

Requires Node.js 22+ and a MySQL 8-compatible instance.

1. Create an **isolated** MySQL database and a least-privilege app account.
2. Apply `schema.sql` and optionally `examples/sample-readings.sql` in the fresh database.
3. Copy `.env.example` to `.env`; set the local DB credentials, APP_USERNAME and APP_PASSWORD.
4. Run `npm ci`, `npm test`, `npm run check` and `npm start`.
5. Open `http://localhost:3000` with your local login credentials.

Authentication defaults on. Only an explicitly disabled-auth development configuration binds to loopback. Never point this repository at the private production database.

## Architecture

See the [Mermaid architecture diagrams and engineering decisions](docs/architecture.md)
for private API/data boundaries, advisory-lock transactions, DST-safe calendar
arithmetic and the synthetic public demo.

The server exposes JSON/CSV endpoints under `/api/readings` and `/api/settings`. Express serves the same-origin browser UI. Routes live in `src/routes`, domain operations in `src/services`, and MySQL access in `src/db`. The date/allowance calculator uses UTC calendar-day arithmetic to avoid DST errors.

The GitHub Pages demo serves only `docs/`, using `docs/demo/assets/mock-api.js` to simulate operations in local browser memory. It makes no external requests.

A synthetic baseline of 100,000 L on 1 January 2026, 800 L/day allowance and reading of 103,000 L on 6 January means 4,000 L allowed, 3,000 L used and 1,000 L remaining.

## Design and third-party licensing

The dashboard uses **AdminLTE 4.10.0** by ColorlibHQ, separately **MIT-licensed**. Only its compiled CSS/JavaScript and preserved licence notices are vendored. None of the proprietary Colorlib downloaded website templates, photos or subscription assets are included. See [template attribution](docs/template-attribution.md).

`npm run sync:template` refreshes the pinned AdminLTE assets and application CSS in both the real frontend and static demo. The production server requires no CDN, font service or template subscription.

## Verification

The CI and local browser tests now also verify interval calculations, SVG
chart rendering, mobile overflow, edit/delete refresh and allowance changes.

**Continuous integration:** [GitHub Actions CI](https://github.com/pfirsowicz/water-allowance-tracker/actions/workflows/ci.yml) runs on every pull request into `main` and push to `main`. It uses a standard public-repository Ubuntu runner, a read-only GitHub token, and no release/deployment permissions, build artifacts or dependency cache.

The workflow installs locked dependencies, runs the unit suite and syntax checks, exercises the synthetic browser demo in Chrome, and runs the HTTP/MySQL integration test against a **fresh disposable MySQL 8 service**, with a local test-only account and database. It cannot access the private production database.

- `npm test`: calculation, validation, chronology and mock-API unit tests.
- `npm run check`: syntax-checks application and test JavaScript.
- `npm run test:browser`: offline Chrome tests at widths 1440, 768, 390 and 320 px. Tests reading creation, editing, deletion and settings and checks for horizontal overflow and external network calls.
- Optional MySQL test: set `WATER_TEST_MYSQL=1` and the `WATER_TEST_DB_*` variables for an isolated localhost instance, nonstandard port, and fresh `water_test_*` database. Run `node --test test/integration.mysql.test.js`. It refuses non-test/default-port databases.

See [integration and failure-path test coverage](docs/testing.md) for the tested concurrency, rollback, duplicate, authentication and MySQL failure scenarios.

`test:browser` uses locally installed Chrome; `CHROME_EXECUTABLE` overrides its location. Playwright-core is a dev dependency and does not download a browser.

## Limitations and licence

Mutations use a database-scoped advisory lock and transaction, protecting cooperating application requests; direct SQL writes bypassing that lock remain an exception. The rate limiter is in-process and this app is not a multi-tenant SaaS service.

The repository's own code is MIT-licensed; keep the included AdminLTE third-party MIT notice when redistributing vendored assets. No historical private Git metadata or household readings are included.
