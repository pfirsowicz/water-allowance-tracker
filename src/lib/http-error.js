"use strict";

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

function badRequest(code, message) {
  return new HttpError(400, code, message);
}

function notFound(code, message) {
  return new HttpError(404, code, message);
}

function conflict(code, message) {
  return new HttpError(409, code, message);
}

function sendHttpError(res, err, fallbackMessage) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }

  return res.status(500).json({ error: fallbackMessage, code: "internal_error" });
}

module.exports = { HttpError, badRequest, notFound, conflict, sendHttpError };
