"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseDDMMYYYY,
  daysBetweenUTC,
  calculateAllowance,
  ddmmyyyyToIso,
  isoToDDMMYYYY,
} = require("../public/assets/calculations");

test("validates and converts dd/mm/yyyy dates", () => {
  assert.ok(parseDDMMYYYY("31/08/2026"));
  assert.equal(parseDDMMYYYY("31/02/2026"), null);
  assert.equal(ddmmyyyyToIso("31/08/2026"), "2026-08-31");
  assert.equal(isoToDDMMYYYY("2026-08-31"), "31/08/2026");
});

test("calendar day difference is stable across NZ DST start", () => {
  const start = parseDDMMYYYY("26/09/2026");
  const end = parseDDMMYYYY("28/09/2026");
  assert.equal(daysBetweenUTC(start, end), 2);
});

test("calendar day difference is stable across NZ DST end", () => {
  const start = parseDDMMYYYY("03/04/2027");
  const end = parseDDMMYYYY("05/04/2027");
  assert.equal(daysBetweenUTC(start, end), 2);
});

test("calculates allowance and buffer days", () => {
  const result = calculateAllowance({
    initialReading: 1000,
    initialDate: "01/01/2026",
    dailyLimit: 900,
    currentReading: 2500,
    currentDate: "03/01/2026",
  });

  assert.equal(result.daysElapsed, 2);
  assert.equal(result.used, 1500);
  assert.equal(result.allowed, 1800);
  assert.equal(result.remaining, 300);
  assert.equal(result.dailyUsage, 750);
  assert.equal(result.status, "near");
  assert.equal(result.bufferDays, 1 / 3);
});

test("same-day calculation does not divide by zero", () => {
  const result = calculateAllowance({
    initialReading: 1000,
    initialDate: "01/01/2026",
    dailyLimit: 900,
    currentReading: 1000,
    currentDate: "01/01/2026",
  });

  assert.equal(result.daysElapsed, 0);
  assert.equal(result.dailyUsage, 0);
  assert.equal(result.usagePercent, null);
});

test("rejects a reading below the baseline", () => {
  assert.throws(() => calculateAllowance({
    initialReading: 2000,
    initialDate: "01/01/2026",
    dailyLimit: 900,
    currentReading: 1999,
    currentDate: "02/01/2026",
  }), /cannot be lower than the baseline/i);
});

test("rejects zero daily allowance", () => {
  assert.throws(() => calculateAllowance({
    initialReading: 1000,
    initialDate: "01/01/2026",
    dailyLimit: 0,
    currentReading: 1000,
    currentDate: "02/01/2026",
  }), /greater than zero/i);
});
