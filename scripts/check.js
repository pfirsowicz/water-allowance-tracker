"use strict";

const { execFileSync } = require("node:child_process");
const files = [
  "src/server.js", "src/db/pool.js", "src/lib/http-error.js",
  "src/lib/validation.js", "src/middleware/basic-auth.js",
  "src/middleware/rate-limit.js", "src/routes/readings.routes.js",
  "src/routes/settings.routes.js", "src/services/readings.service.js",
  "src/services/settings.service.js", "public/assets/calculations.js",
  "public/assets/app.js", "docs/demo/assets/mock-api.js",
  "docs/demo/assets/calculations.js", "docs/demo/assets/app.js",
  "test/integration.mysql.test.js", "test/demo.test.js"
];
for (const file of files) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
console.log("Syntax checked " + files.length + " JavaScript files.");
