// src/routes/readings.routes.js
"use strict";

const express = require("express");
const {
  listReadings,
  insertReading,
  updateReading,
  deleteReading,
  listAllReadingsForExport,
} = require("../services/readings.service");
const { sendHttpError } = require("../lib/http-error");

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function createReadingsRouter(pool) {
  const router = express.Router();

  router.get("/export.csv", async (req, res) => {
    try {
      const items = await listAllReadingsForExport(pool);
      const lines = ["reading_date,reading_litres,saved_at_utc"];
      for (const item of items) {
        const savedAtUtc = item.createdAtEpoch ? new Date(item.createdAtEpoch * 1000).toISOString() : "";
        lines.push([item.readingDate, item.reading, savedAtUtc].map(csvCell).join(","));
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="water-readings.csv"');
      res.send(lines.join("\n") + "\n");
    } catch (err) {
      console.error("GET /api/readings/export.csv error:", err);
      sendHttpError(res, err, "Failed to export readings.");
    }
  });

  router.get("/", async (req, res) => {
    try {
      const items = await listReadings(pool, req.query.limit);
      res.json({ items });
    } catch (err) {
      console.error("GET /api/readings error:", err);
      sendHttpError(res, err, "Failed to fetch readings.");
    }
  });

  router.post("/", async (req, res) => {
    try {
      const item = await insertReading(pool, req.body);
      res.status(201).json({ ok: true, item });
    } catch (err) {
      console.error("POST /api/readings error:", err);
      sendHttpError(res, err, "Failed to save reading.");
    }
  });

  router.patch("/:id", async (req, res) => {
    try {
      const item = await updateReading(pool, req.params.id, req.body);
      res.json({ ok: true, item });
    } catch (err) {
      console.error("PATCH /api/readings/:id error:", err);
      sendHttpError(res, err, "Failed to update reading.");
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      await deleteReading(pool, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("DELETE /api/readings/:id error:", err);
      sendHttpError(res, err, "Failed to delete reading.");
    }
  });

  return router;
}

module.exports = { createReadingsRouter };
