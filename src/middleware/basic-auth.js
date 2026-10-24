"use strict";

const crypto = require("crypto");

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createBasicAuth(options = {}) {
  const enabled = options.enabled === true;
  if (!enabled) return (req, res, next) => next();

  const username = String(options.username || "");
  const password = String(options.password || "");
  const realm = String(options.realm || "Water Allowance").replace(/["\\]/g, "");

  if (!username || !password) {
    throw new Error("APP_AUTH_ENABLED=true requires APP_USERNAME and APP_PASSWORD.");
  }

  return function basicAuth(req, res, next) {
    const header = req.headers.authorization || "";
    if (header.startsWith("Basic ")) {
      try {
        const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
        const separator = decoded.indexOf(":");
        const suppliedUser = separator >= 0 ? decoded.slice(0, separator) : "";
        const suppliedPassword = separator >= 0 ? decoded.slice(separator + 1) : "";

        if (safeEqual(suppliedUser, username) && safeEqual(suppliedPassword, password)) {
          return next();
        }
      } catch (_) {
        // Fall through to the challenge.
      }
    }

    res.setHeader("WWW-Authenticate", `Basic realm="${realm}", charset="UTF-8"`);
    return res.status(401).send("Authentication required");
  };
}

module.exports = { createBasicAuth };
