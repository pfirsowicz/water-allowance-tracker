"use strict";

const { parseDailyAllowance, parseIsoDate, parseReading } = require("../lib/validation");
const { HttpError } = require("../lib/http-error");

function defaultsFromEnv() {
  let baselineDate = process.env.DEFAULT_BASELINE_DATE || "2026-01-01";
  let baselineReading = process.env.DEFAULT_BASELINE_READING || "100000";
  let dailyAllowance = process.env.DEFAULT_DAILY_ALLOWANCE || "800";

  return {
    baselineDate: parseIsoDate(baselineDate, "DEFAULT_BASELINE_DATE"),
    baselineReading: parseReading(Number(baselineReading), "DEFAULT_BASELINE_READING"),
    dailyAllowance: parseDailyAllowance(Number(dailyAllowance)),
    persisted: false,
  };
}

function isMissingSettingsTable(err) {
  return err && (err.code === "ER_NO_SUCH_TABLE" || Number(err.errno) === 1146);
}

async function getSettings(pool) {
  try {
    const [rows] = await pool.query(
      `SELECT
         DATE_FORMAT(\`baseline_date\`, '%Y-%m-%d') AS \`baselineDate\`,
         \`baseline_reading\` AS \`baselineReading\`,
         \`daily_allowance\` AS \`dailyAllowance\`,
         DATE_FORMAT(\`updated_at\`, '%Y-%m-%d %H:%i:%s') AS \`updatedAt\`
       FROM \`app_settings\`
       WHERE \`id\` = 1
       LIMIT 1`
    );

    if (!rows[0]) return defaultsFromEnv();
    return {
      baselineDate: String(rows[0].baselineDate),
      baselineReading: Number(rows[0].baselineReading),
      dailyAllowance: Number(rows[0].dailyAllowance),
      updatedAt: String(rows[0].updatedAt || ""),
      persisted: true,
    };
  } catch (err) {
    if (isMissingSettingsTable(err)) return defaultsFromEnv();
    throw err;
  }
}

async function saveSettings(pool, input = {}) {
  const baselineDate = parseIsoDate(input.baselineDate, "baselineDate");
  const baselineReading = parseReading(input.baselineReading, "baselineReading");
  const dailyAllowance = parseDailyAllowance(input.dailyAllowance);

  try {
    await pool.query(
      `INSERT INTO \`app_settings\`
         (\`id\`, \`baseline_date\`, \`baseline_reading\`, \`daily_allowance\`)
       VALUES (1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         \`baseline_date\` = VALUES(\`baseline_date\`),
         \`baseline_reading\` = VALUES(\`baseline_reading\`),
         \`daily_allowance\` = VALUES(\`daily_allowance\`)`,
      [baselineDate, baselineReading, dailyAllowance]
    );
  } catch (err) {
    if (isMissingSettingsTable(err)) {
      throw new HttpError(
        503,
        "migration_required",
        "Settings storage is not installed yet. Apply migrations/001-foundation-v4.sql."
      );
    }
    throw err;
  }

  return getSettings(pool);
}

module.exports = { getSettings, saveSettings, defaultsFromEnv };
