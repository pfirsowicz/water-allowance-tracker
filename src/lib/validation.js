"use strict";

const { badRequest } = require("./http-error");

const MAX_SAFE_READING = Number.MAX_SAFE_INTEGER;
const MAX_DAILY_ALLOWANCE = 10_000_000;

function parsePositiveId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw badRequest("invalid_id", "Reading id must be a positive integer.");
  }
  return id;
}

function parseReading(value, fieldName = "reading") {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw badRequest("invalid_reading", fieldName + " must be a whole number.");
  }
  const n = value;
  if (!Number.isFinite(n) || !Number.isSafeInteger(n)) {
    throw badRequest("invalid_reading", `${fieldName} must be a whole number.`);
  }
  if (n < 0 || n > MAX_SAFE_READING) {
    throw badRequest("invalid_reading", `${fieldName} is outside the supported range.`);
  }
  return n;
}

function parseDailyAllowance(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw badRequest("invalid_daily_allowance", "Daily allowance must be a whole number.");
  }
  const n = value;
  if (!Number.isFinite(n) || !Number.isSafeInteger(n)) {
    throw badRequest("invalid_daily_allowance", "Daily allowance must be a whole number.");
  }
  if (n <= 0 || n > MAX_DAILY_ALLOWANCE) {
    throw badRequest("invalid_daily_allowance", "Daily allowance must be greater than zero.");
  }
  return n;
}

function parseIsoDate(value, fieldName = "date") {
  const s = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) {
    throw badRequest("invalid_date", `${fieldName} must use YYYY-MM-DD format.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw badRequest("invalid_date", `${fieldName} must be a valid calendar date.`);
  }

  return s;
}

function parseLimit(value, defaultValue = 200) {
  const raw = value === undefined || value === null || value === "" ? defaultValue : value;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw badRequest("invalid_limit", "limit must be a number.");
  }
  return Math.max(1, Math.min(1000, Math.trunc(n)));
}

module.exports = {
  MAX_SAFE_READING,
  parsePositiveId,
  parseReading,
  parseDailyAllowance,
  parseIsoDate,
  parseLimit,
};
