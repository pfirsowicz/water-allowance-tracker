# Water Allowance Tracker

A small app I use to track water meter readings against a daily allowance.

[Live demo](https://pfirsowicz.github.io/water-allowance-tracker/) · [CI](https://github.com/pfirsowicz/water-allowance-tracker/actions/workflows/ci.yml) · [Latest release](https://github.com/pfirsowicz/water-allowance-tracker/releases/tag/v1.2.0)

## Engineering decisions and evidence

- **Reading consistency:** MySQL transactions and an advisory lock protect changes to cumulative readings. [Code](src/services/readings.service.js) · [Integration tests](test/integration.mysql.test.js).
- **Date calculations:** Allowances use calendar days, avoiding daylight-saving errors. The chart shows measured intervals, not invented daily usage. [Code](public/assets/calculations.js) · [Tests](test/usage-intervals.test.js).
- **Failure handling:** Tests cover concurrent edits, duplicates, rollback and database errors. [Test notes](docs/testing.md).
- **Limits:** The lock covers application writers, not direct SQL changes. Basic Auth is for a private single-user deployment, not a public multi-user service. [Architecture](docs/architecture.md).

## What it does

- Add, edit, delete and export readings.
- Set a baseline reading and daily allowance.
- Review usage and averages between readings.

## Run locally

Requires Node.js 22+ and MySQL 8.

1. Create a separate MySQL database with a limited-permission account; apply `schema.sql`.
2. Copy `.env.example` to `.env`; set the database and app login values.
3. Run `npm ci`, `npm test`, `npm run check` and `npm start`.
4. Open `http://localhost:3000`.

For isolated MySQL and browser tests, see [testing](docs/testing.md).

## Demo and source

- **GitHub Pages:** Static demo with synthetic readings stored in browser memory. Reloading clears changes; no live backend or private data is connected.
- **Local app:** Express API and MySQL persistence. The public source is a simplified version of a separate private app I maintain; it is not the production deployment.
- Dashboard styling uses [AdminLTE 4](https://github.com/ColorlibHQ/AdminLTE) ([licence and attribution](docs/template-attribution.md)).
- Original code: **All Rights Reserved**. See [LICENSE](LICENSE).

## Screenshot

![Water Allowance Tracker dashboard](docs/screenshot.png)
