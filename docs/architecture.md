# Architecture

## Runtime

- **Local/full-stack:** Browser UI → Express routes → validation and services → MySQL 8.
- **GitHub Pages:** Static UI → in-memory synthetic-data adapter. No hosted API, database or production connection.
- Main files: [routes](../src/routes), [services](../src/services), [database](../src/db), [calculations](../public/assets/calculations.js).

## Reading updates

- Validate input and check neighbouring cumulative readings.
- Acquire a MySQL advisory lock and open a transaction on the same connection.
- Reject duplicate or decreasing readings; commit valid changes or roll back on error.
- Release the lock; discard the connection if rollback or lock release is uncertain.
- The database also has a unique constraint for exact duplicate date/value pairs.

The lock protects **participating app writers only**. Direct SQL clients can bypass it. See [integration tests](testing.md).

## Allowance calculations

- Days: UTC calendar-date difference, not elapsed hours (avoids daylight-saving errors).
- Usage: newer cumulative reading minus older reading.
- Daily average: usage divided by elapsed calendar days.
- Charts show measured intervals, not made-up daily readings.
- Same-day readings use the highest value; invalid/decreasing histories produce an error.

## Security and limits

- Private API: Basic Auth over HTTPS, input validation and an in-process rate limiter.
- Basic Auth is suitable for this single-user setup, **not** multi-user access control.
- The limiter is not distributed, and the advisory lock does not cover external writers.
- GitHub Pages runs with synthetic state only; passing CI does not verify the private deployment.

[Security notes](security.md) · [Test coverage](testing.md)
