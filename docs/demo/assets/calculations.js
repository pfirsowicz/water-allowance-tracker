(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WaterCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toDDMMYYYY(date) {
    return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
  }

  function parseDDMMYYYY(value) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || "").trim());
    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month - 1, day, 0, 0, 0, 0);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }
    return date;
  }

  function isoToDDMMYYYY(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
    if (!match) return "";
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  function ddmmyyyyToIso(value) {
    const date = parseDDMMYYYY(value);
    if (!date) return null;
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function daysBetweenUTC(start, end) {
    const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.floor((endUtc - startUtc) / 86_400_000);
  }

  function calculateAllowance(input) {
    const initialReading = Number(input.initialReading);
    const currentReading = Number(input.currentReading);
    const dailyLimit = Number(input.dailyLimit);
    const initialDate = parseDDMMYYYY(input.initialDate);
    const currentDate = parseDDMMYYYY(input.currentDate);

    if (!Number.isSafeInteger(initialReading) || initialReading < 0) {
      throw new Error("Initial reading must be a non-negative whole number.");
    }
    if (!Number.isSafeInteger(currentReading) || currentReading < 0) {
      throw new Error("Current reading must be a non-negative whole number.");
    }
    if (currentReading < initialReading) {
      throw new Error("Current reading cannot be lower than the baseline reading.");
    }
    if (!Number.isSafeInteger(dailyLimit) || dailyLimit <= 0) {
      throw new Error("Daily allowance must be a whole number greater than zero.");
    }
    if (!initialDate) throw new Error("Baseline date must be a valid dd/mm/yyyy date.");
    if (!currentDate) throw new Error("Reading date must be a valid dd/mm/yyyy date.");

    const daysElapsed = daysBetweenUTC(initialDate, currentDate);
    if (daysElapsed < 0) throw new Error("Reading date must be on or after the baseline date.");

    const used = currentReading - initialReading;
    const allowed = daysElapsed * dailyLimit;
    const remaining = allowed - used;
    const dailyUsage = daysElapsed > 0 ? used / daysElapsed : 0;
    const usagePercent = allowed > 0 ? (used / allowed) * 100 : null;
    const bufferDays = remaining / dailyLimit;

    let status = "within";
    if (remaining < 0) status = "exceeded";
    else if (remaining <= dailyLimit) status = "near";

    return {
      daysElapsed,
      used,
      allowed,
      remaining,
      dailyUsage,
      usagePercent,
      bufferDays,
      status,
    };
  }


  // Average consumption for measured date intervals, not individual days.
  // Same-date readings collapse to the highest cumulative reading for that date.
  function buildUsageIntervals(readings, settings) {
    if (!Array.isArray(readings)) throw new Error("Readings must be an array.");
    const { baselineDate, baselineReading, dailyAllowance } = settings || {};
    function validIso(iso) {
      if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
      return parseDDMMYYYY(isoToDDMMYYYY(iso));
    }
    if (!validIso(baselineDate)) throw new Error("Baseline date is invalid.");
    if (!Number.isSafeInteger(baselineReading) || baselineReading < 0) {
      throw new Error("Baseline meter value is invalid.");
    }
    if (!Number.isSafeInteger(dailyAllowance) || dailyAllowance <= 0) {
      throw new Error("Daily allowance is invalid.");
    }

    const byDate = new Map();
    for (const item of readings) {
      if (!validIso(item?.readingDate) ||
          !Number.isSafeInteger(item?.reading) || item.reading < 0) {
        throw new Error("Reading history contains an invalid measurement.");
      }
      if (item.readingDate < baselineDate) continue;
      const prior = byDate.get(item.readingDate);
      byDate.set(item.readingDate, prior === undefined
        ? item.reading : Math.max(prior, item.reading));
    }

    // The API limits history to 200 recent records. If truncated, do not
    // draw a fictitious interval from the baseline to the oldest returned row.
    const previousFromBaseline = readings.length < 200;
    const points = [...byDate].map(([date,reading])=>({date,reading}))
      .sort((a,b)=>a.date.localeCompare(b.date));
    let previous = previousFromBaseline
      ? { date: baselineDate, reading: baselineReading } : null;
    const intervals = [];
    for (const point of points) {
      if (!previous) { previous = point; continue; }
      const days = daysBetweenUTC(validIso(previous.date), validIso(point.date));
      if (days === 0) {
        previous = {date:point.date, reading:Math.max(previous.reading,point.reading)};
        continue;
      }
      const litresUsed = point.reading - previous.reading;
      if (days < 0 || litresUsed < 0) {
        throw new Error("Reading history is inconsistent with cumulative meter values.");
      }
      intervals.push({
        fromDate:previous.date, toDate:point.date, days,
        litresUsed, averagePerDay:litresUsed/days,
        allowancePerDay:dailyAllowance
      });
      previous=point;
    }
    return intervals;
  }

  return {
    pad2,
    toDDMMYYYY,
    parseDDMMYYYY,
    isoToDDMMYYYY,
    ddmmyyyyToIso,
    daysBetweenUTC,
    calculateAllowance,
    buildUsageIntervals,
  };
});
