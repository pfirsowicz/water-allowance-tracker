"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const vendor = path.join(root, "node_modules", "admin-lte");
for (const [src, name] of [
  ["dist/css/adminlte.min.css", "adminlte.min.css"],
  ["dist/js/adminlte.min.js", "adminlte.min.js"],
  ["LICENSE", "ADMINLTE-LICENSE.txt"]
]) {
  for (const folder of ["public", "docs/demo"]) {
    const target = path.join(root, folder, "assets/vendor", name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(vendor, src), target);
  }
}
fs.copyFileSync(path.join(root, "public/assets/styles.css"),
                path.join(root, "docs/demo/assets/styles.css"));
console.log("Synced AdminLTE 4 assets and Waterline stylesheet.");
