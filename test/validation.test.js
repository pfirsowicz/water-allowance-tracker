"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parsePositiveId,
  parseReading,
  parseDailyAllowance,
  parseIsoDate,
  parseLimit,
} = require("../src/lib/validation");
const { validateChronology } = require("../src/services/readings.service");

test("parses valid API input", () => {
  assert.equal(parsePositiveId("12"), 12);
  assert.equal(parseReading(1234567), 1234567);
  assert.equal(parseDailyAllowance(900), 900);
  assert.equal(parseIsoDate("2026-08-31"), "2026-08-31");
  assert.equal(parseLimit("500"), 500);
});

test("rejects invalid dates and numeric values", () => {
  assert.throws(() => parseIsoDate("2026-02-30"), /valid calendar date/i);
  assert.throws(() => parsePositiveId("0"), /positive integer/i);
  assert.throws(() => parseReading(12.5), /whole number/i);
  assert.throws(() => parseDailyAllowance(0), /greater than zero/i);
});

test("caps list limit", () => {
  assert.equal(parseLimit("5000"), 1000);
  assert.equal(parseLimit("0"), 1);
});

test("chronology rejects a decrease from the preceding reading", () => {
  assert.throws(() => validateChronology(100, {
    previous: { reading: 101, readingDate: "2026-08-30" },
    next: null,
  }), /cannot be lower/i);
});

test("chronology rejects a backdated reading above the following reading", () => {
  assert.throws(() => validateChronology(200, {
    previous: { reading: 100, readingDate: "2026-08-20" },
    next: { reading: 150, readingDate: "2026-08-30" },
  }), /cannot be higher/i);
});

test("chronology accepts a reading between neighbours", () => {
  assert.doesNotThrow(() => validateChronology(125, {
    previous: { reading: 100, readingDate: "2026-08-20" },
    next: { reading: 150, readingDate: "2026-08-30" },
  }));
});


test("rejects coercible but invalid API input types", () => {
  for (const value of [null, "", false, "100", {}, []]) {
    assert.throws(() => parseReading(value), /whole number/i);
    assert.throws(() => parseDailyAllowance(value), /whole number/i);
  }
});
