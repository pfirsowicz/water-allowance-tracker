# Tests

## Run

- `npm ci && npm test` — unit tests; **MySQL integration tests are skipped** unless explicitly enabled.
- `npm run check` — syntax checks.
- `npm run test:browser` — Chrome checks of the static demo.
- GitHub Actions runs all of the above plus a disposable MySQL 8 service.

## MySQL integration tests

Use a **fresh, empty `water_test_*` database** on loopback and a non-default MySQL port. Never use production data.

Set `WATER_TEST_MYSQL=1`, `WATER_TEST_DB_HOST=127.0.0.1`, `WATER_TEST_DB_PORT`, `WATER_TEST_DB_NAME`, `WATER_TEST_DB_USER` and, if needed, `WATER_TEST_DB_PASSWORD`.

Run `node --test test/integration.mysql.test.js`. The test refuses non-loopback hosts, port 3306, non-test schema names and databases containing readings. It creates test objects, including a temporary failure trigger.

## Coverage

- API login failures, settings, CRUD, CSV and input validation.
- Duplicate values, database constraints and HTTP conflict responses.
- Concurrent creates/updates; final persisted readings remain consistent.
- Rollback after INSERT/UPDATE/DELETE errors; subsequent writes can recover.
- Database connection failures and safe error responses.
- Browser CRUD, settings, chart behaviour, responsive widths and external requests.

## Limits

- Concurrency tests cover writers using the app's advisory lock, not direct SQL.
- Failure injection does not cover every crash or network failure.
- Passing tests are **not** proof of live deployment, multi-user security or full secret scanning.
