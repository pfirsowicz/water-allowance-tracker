// src/server.js
"use strict";

require("dotenv").config();

const path = require("path");
const express = require("express");

const { getPool } = require("./db/pool");
const { createReadingsRouter } = require("./routes/readings.routes");
const { createSettingsRouter } = require("./routes/settings.routes");
const { createBasicAuth } = require("./middleware/basic-auth");
const { createRateLimit } = require("./middleware/rate-limit");

const app = express();
app.disable("x-powered-by");
const trustProxy = process.env.TRUST_PROXY === "1";
app.set("trust proxy", trustProxy ? 1 : false);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (req.secure) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// Keep this unauthenticated so Hostinger/proxy health checks can verify Node is running.
app.get("/ping", (req, res) => res.status(200).type("text/plain").send("pong"));

app.use(createRateLimit({ windowMs: 60_000, max: 300 }));

const authEnabled = String(process.env.APP_AUTH_ENABLED ?? "true").toLowerCase() === "true";
app.use(createBasicAuth({
  enabled: authEnabled,
  username: process.env.APP_USERNAME,
  password: process.env.APP_PASSWORD,
  realm: process.env.APP_AUTH_REALM || "Water Allowance",
}));

app.use(express.json({ limit: "32kb", strict: true }));
app.use("/api", (req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
app.use("/api", createRateLimit({ windowMs: 60_000, max: 120 }));

// Create pool (does not connect until first query)
const pool = getPool();

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("GET /api/health database error:", err);
    res.status(500).json({ ok: false, error: "db_unreachable" });
  }
});

app.use("/api/readings", createReadingsRouter(pool));
app.use("/api/settings", createSettingsRouter(pool));

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir, { index: false, maxAge: "1h" }));
app.get("/", (req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON request body.", code: "invalid_json" });
  }
  console.error("Unhandled request error:", err);
  return res.status(500).json({ error: "Unexpected server error.", code: "internal_error" });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const host = !authEnabled ? "127.0.0.1" : "0.0.0.0";
app.listen(port, host, () => {
  console.log(`Server listening on port ${port}; auth ${authEnabled ? "enabled" : "disabled"}`);
});
