"use strict";

const express = require("express");
const { getSettings, saveSettings } = require("../services/settings.service");
const { sendHttpError } = require("../lib/http-error");

function createSettingsRouter(pool) {
  const router = express.Router();

  router.get("/", async (req, res) => {
    try {
      const settings = await getSettings(pool);
      res.json({ settings });
    } catch (err) {
      console.error("GET /api/settings error:", err);
      sendHttpError(res, err, "Failed to load settings.");
    }
  });

  router.put("/", async (req, res) => {
    try {
      const settings = await saveSettings(pool, req.body);
      res.json({ ok: true, settings });
    } catch (err) {
      console.error("PUT /api/settings error:", err);
      sendHttpError(res, err, "Failed to save settings.");
    }
  });

  return router;
}

module.exports = { createSettingsRouter };
