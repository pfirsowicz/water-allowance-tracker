# Integration and failure-path verification

The application uses the Node.js test runner. The main tests cover
calendar-day arithmetic, input validation, the offline demo, and an
opt-in MySQL 8-backed HTTP suite.

## Running the suites

- `npm ci` then `npm test`: unit tests; the MySQL integration suite is
  explicitly **skipped**, not silently run without a database.
- `npm run check`: JavaScript syntax checks.
- `npm run test:browser`: static demo workflows in local Chrome.
- GitHub Actions CI on pull requests and main includes all of these
  plus the real MySQL suite on a disposable MySQL 8 service.

To run the MySQL integration tests locally, create a **fresh, empty**
`water_test_*` schema on a loopback-only MySQL 8 instance using a
**non-default** port. Set `WATER_TEST_MYSQL=1`,
`WATER_TEST_DB_HOST=127.0.0.1`, `WATER_TEST_DB_PORT`,
`WATER_TEST_DB_NAME`, `WATER_TEST_DB_USER` and optionally
`WATER_TEST_DB_PASSWORD`. Then run:

`node --test test/integration.mysql.test.js`

The test rejects non-loopback hosts, default port 3306, database names
without the `water_test_` prefix, and schemas with existing readings.
It creates schema objects and a **temporary trigger** in its isolated
test database, and must never be run against private or production data.

## What is verified

| Area | DB/API assertion |
| --- | --- |
| Existing end-to-end flow | Authenticated settings, create, edit, delete, CSV export, invalid inputs |
| Authentication denial | Missing, wrong user/password, malformed Basic and unsupported scheme return 401; no writes; challenge header; fail-closed initialization |
| Duplicate protection | HTTP create/update return 409; MySQL unique index independently rejects duplicates (`ER_DUP_ENTRY`); committed rows unchanged |
| Rollback | Actual INSERT, UPDATE and DELETE statements run inside a transaction, then throw; full row snapshots prove they were rolled back; later writes succeed |
| Concurrent creates | Two individually legal writes which would jointly violate chronological monotonicity yield one 201 and one 409 |
| Concurrent updates | Two independently legal changes which cannot coexist yield one 200 and one 409; committed readings stay monotonic |
| SQL failure and recovery | A test-only trigger rejects INSERT; HTTP returns sanitised 500, the row does not persist, lock releases, and writing resumes after trigger removal |
| MySQL access failure | Test-only invalid DB credentials cause safe 500s on reading/settings GET routes without exposing connection details; original DB service continues working |

The concurrency checks assert final **persisted database state**, not
only HTTP status codes. All tests use synthetic meter values. Client-side
error sanitisation is tested separately from internal diagnostic logging.

## Scope and known limits

The serialized mutation lock protects application writers which use
the same MySQL advisory lock. It does **not** prevent independently
connected clients from issuing direct SQL without that lock.

The test-only MySQL trigger validates one category of SQL error; it is
not exhaustive fault injection of crashes, network partitions or
in-doubt commit outcomes. No tests claim live deployment verification,
multi-user security readiness or a complete secret-scan certification.
