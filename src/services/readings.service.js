// src/services/readings.service.js
"use strict";

const { conflict, notFound, HttpError } = require("../lib/http-error");
const { parseIsoDate, parseLimit, parsePositiveId, parseReading } = require("../lib/validation");


const WRITE_LOCK_SQL = "CONCAT('water-allowance:', LEFT(SHA2(DATABASE(), 256), 32))";

/**
 * Serialize cooperating read-modify-write operations on the same MySQL DB.
 * Advisory lock is scoped to the CONNECTION, and is not released by COMMIT.
 * Use the same pooled connection for lock, validation, writes, and release.
 */
async function withSerializedMutation(pool, work) {
  const db = await pool.getConnection();
  let locked = false;
  let inTransaction = false;
  let usable = true;
  try {
    const [rows] = await db.query("SELECT GET_LOCK(" + WRITE_LOCK_SQL + ", 10) AS acquired");
    if (Number(rows[0]?.acquired) !== 1) {
      throw new HttpError(503, "write_lock_unavailable", "The readings store is busy. Retry shortly.");
    }
    locked = true;
    await db.beginTransaction();
    inTransaction = true;
    const result = await work(db);
    await db.commit();
    inTransaction = false;
    return result;
  } catch (error) {
    if (inTransaction) {
      try {
        await db.rollback();
      } catch (_) {
        usable = false;
      }
    }
    if (error?.code === "ER_DUP_ENTRY") {
      throw conflict("duplicate_reading", "That reading is already recorded.");
    }
    throw error;
  } finally {
    if (locked) {
      try {
        const [rows] = await db.query("SELECT RELEASE_LOCK(" + WRITE_LOCK_SQL + ") AS released");
        if (Number(rows[0]?.released) !== 1) usable = false;
      } catch (_) {
        usable = false;
      }
    }
    if (usable) db.release();
    else db.destroy();
  }
}

const SELECT_FIELDS = `
  \`id\`,
  DATE_FORMAT(\`date\`, '%Y-%m-%d') AS \`readingDate\`,
  DATE_FORMAT(\`date\`, '%d/%m/%Y') AS \`date\`,
  DATE_FORMAT(\`time\`, '%H:%i:%s') AS \`time\`,
  \`reading\`,
  UNIX_TIMESTAMP(\`created_at\`) AS \`createdAtEpoch\`
`;

function mapReading(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    readingDate: String(row.readingDate || ""),
    date: String(row.date || ""), // compatibility/display field
    time: String(row.time || ""), // original save-time field
    reading: Number(row.reading),
    createdAtEpoch: Number(row.createdAtEpoch || 0),
  };
}

async function listReadings(pool, limit = 200) {
  const n = parseLimit(limit, 200);
  const [rows] = await pool.query(
    `SELECT ${SELECT_FIELDS}
     FROM \`readings\`
     ORDER BY \`date\` DESC, \`time\` DESC, \`id\` DESC
     LIMIT ?`,
    [n]
  );
  return rows.map(mapReading);
}

async function getReadingById(pool, idValue) {
  const id = parsePositiveId(idValue);
  const [rows] = await pool.query(
    `SELECT ${SELECT_FIELDS}
     FROM \`readings\`
     WHERE \`id\` = ?
     LIMIT 1`,
    [id]
  );
  return mapReading(rows[0]);
}

async function findDuplicate(pool, readingDate, reading, excludeId = null) {
  const params = [readingDate, reading];
  let sql = `SELECT \`id\` FROM \`readings\` WHERE \`date\` = ? AND \`reading\` = ?`;
  if (excludeId) {
    sql += " AND `id` <> ?";
    params.push(excludeId);
  }
  sql += " LIMIT 1";
  const [rows] = await pool.query(sql, params);
  return rows[0] || null;
}

async function getCreateNeighbours(pool, readingDate) {
  const [previousRows] = await pool.query(
    `SELECT \`id\`, DATE_FORMAT(\`date\`, '%Y-%m-%d') AS \`readingDate\`, \`reading\`
     FROM \`readings\`
     WHERE \`date\` <= ?
     ORDER BY \`date\` DESC, \`time\` DESC, \`id\` DESC
     LIMIT 1`,
    [readingDate]
  );

  const [nextRows] = await pool.query(
    `SELECT \`id\`, DATE_FORMAT(\`date\`, '%Y-%m-%d') AS \`readingDate\`, \`reading\`
     FROM \`readings\`
     WHERE \`date\` > ?
     ORDER BY \`date\` ASC, \`time\` ASC, \`id\` ASC
     LIMIT 1`,
    [readingDate]
  );

  return { previous: previousRows[0] || null, next: nextRows[0] || null };
}

async function getUpdateNeighbours(pool, current, targetDate) {
  const [previousRows] = await pool.query(
    `SELECT \`id\`, DATE_FORMAT(\`date\`, '%Y-%m-%d') AS \`readingDate\`, \`reading\`
     FROM \`readings\`
     WHERE \`id\` <> ?
       AND (
         \`date\` < ?
         OR (\`date\` = ? AND (\`time\` < ? OR (\`time\` = ? AND \`id\` < ?)))
       )
     ORDER BY \`date\` DESC, \`time\` DESC, \`id\` DESC
     LIMIT 1`,
    [current.id, targetDate, targetDate, current.time, current.time, current.id]
  );

  const [nextRows] = await pool.query(
    `SELECT \`id\`, DATE_FORMAT(\`date\`, '%Y-%m-%d') AS \`readingDate\`, \`reading\`
     FROM \`readings\`
     WHERE \`id\` <> ?
       AND (
         \`date\` > ?
         OR (\`date\` = ? AND (\`time\` > ? OR (\`time\` = ? AND \`id\` > ?)))
       )
     ORDER BY \`date\` ASC, \`time\` ASC, \`id\` ASC
     LIMIT 1`,
    [current.id, targetDate, targetDate, current.time, current.time, current.id]
  );

  return { previous: previousRows[0] || null, next: nextRows[0] || null };
}

function validateChronology(reading, neighbours) {
  const previous = neighbours.previous;
  const next = neighbours.next;

  if (previous && reading < Number(previous.reading)) {
    throw conflict(
      "reading_decreased",
      `Reading cannot be lower than the preceding reading (${Number(previous.reading).toLocaleString()} L on ${previous.readingDate}).`
    );
  }

  if (next && reading > Number(next.reading)) {
    throw conflict(
      "reading_exceeds_next",
      `Reading cannot be higher than the following reading (${Number(next.reading).toLocaleString()} L on ${next.readingDate}).`
    );
  }
}

async function insertReading(pool, input = {}) {
  return withSerializedMutation(pool, async (db) => {
    const readingDate = parseIsoDate(input.readingDate, "readingDate");
      const reading = parseReading(input.reading);

      if (await findDuplicate(db, readingDate, reading)) {
        throw conflict("duplicate_reading", "That reading is already recorded for this date.");
      }

      const neighbours = await getCreateNeighbours(db, readingDate);
      validateChronology(reading, neighbours);

      const [result] = await db.query(
        `INSERT INTO \`readings\` (\`date\`, \`time\`, \`reading\`)
         VALUES (?, CURTIME(), ?)`,
        [readingDate, reading]
      );

      return getReadingById(db, result.insertId);
  });
}

async function updateReading(pool, idValue, input = {}) {
  return withSerializedMutation(pool, async (db) => {
    const id = parsePositiveId(idValue);
      const current = await getReadingById(db, id);
      if (!current) throw notFound("reading_not_found", "Reading not found.");

      const readingDate = parseIsoDate(input.readingDate, "readingDate");
      const reading = parseReading(input.reading);

      if (await findDuplicate(db, readingDate, reading, id)) {
        throw conflict("duplicate_reading", "That reading is already recorded for this date.");
      }

      const neighbours = await getUpdateNeighbours(db, current, readingDate);
      validateChronology(reading, neighbours);

      await db.query(
        `UPDATE \`readings\`
         SET \`date\` = ?, \`reading\` = ?
         WHERE \`id\` = ?`,
        [readingDate, reading, id]
      );

      return getReadingById(db, id);
  });
}

async function deleteReading(pool, idValue) {
  return withSerializedMutation(pool, async (db) => {
    const id = parsePositiveId(idValue);
      const [result] = await db.query("DELETE FROM `readings` WHERE `id` = ?", [id]);
      if (!result.affectedRows) throw notFound("reading_not_found", "Reading not found.");
      return true;
  });
}

async function listAllReadingsForExport(pool) {
  const [rows] = await pool.query(
    `SELECT
       DATE_FORMAT(\`date\`, '%Y-%m-%d') AS \`readingDate\`,
       \`reading\`,
       UNIX_TIMESTAMP(\`created_at\`) AS \`createdAtEpoch\`
     FROM \`readings\`
     ORDER BY \`date\` ASC, \`time\` ASC, \`id\` ASC`
  );
  return rows.map((row) => ({
    readingDate: String(row.readingDate || ""),
    reading: Number(row.reading),
    createdAtEpoch: Number(row.createdAtEpoch || 0),
  }));
}

module.exports = {
  listReadings,
  getReadingById,
  insertReading,
  updateReading,
  deleteReading,
  listAllReadingsForExport,
  validateChronology,
  withSerializedMutation,
};
