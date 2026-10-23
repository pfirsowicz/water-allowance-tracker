// src/db/pool.js
"use strict";

const fs = require("fs");
const mysql = require("mysql2/promise");

let pool;

function must(name, value) {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function getSslOptions() {
  const enabled = String(process.env.DB_SSL_ENABLED || "false").toLowerCase() === "true";
  if (!enabled) return undefined;

  const options = { rejectUnauthorized: true };
  if (process.env.DB_SSL_CA) {
    options.ca = fs.readFileSync(process.env.DB_SSL_CA, "utf8");
  }
  return options;
}

function getPool() {
  if (pool) return pool;

  const port = Number(process.env.DB_PORT || "3306");
  const connectionLimit = Number(process.env.DB_CONN_LIMIT || "5");
  if (!Number.isInteger(port) || port <= 0) throw new Error("DB_PORT must be a positive integer.");
  if (!Number.isInteger(connectionLimit) || connectionLimit <= 0) {
    throw new Error("DB_CONN_LIMIT must be a positive integer.");
  }

  const ssl = getSslOptions();
  pool = mysql.createPool({
    host: must("DB_HOST", process.env.DB_HOST),
    port,
    user: must("DB_USER", process.env.DB_USER),
    password: must("DB_PASSWORD", process.env.DB_PASSWORD),
    database: must("DB_NAME", process.env.DB_NAME),
    waitForConnections: true,
    connectionLimit,
    queueLimit: 0,
    charset: "utf8mb4",
    ...(ssl ? { ssl } : {}),
  });

  return pool;
}

module.exports = { getPool };
