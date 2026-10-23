# Architecture

Browser HTML/CSS/JavaScript -> same-origin Express API -> validation/services -> MySQL.

- Calculation helpers are separate and testable using Node's built-in test runner.
- Measurement date and record creation time have different meanings.
- Parameters are passed to SQL queries rather than interpolated from input.
- MySQL persists readings and the configurable allowance.
- UTC calendar-day arithmetic avoids DST boundary errors.
- Vanilla JavaScript keeps the deployment small; no frontend build tooling required.
