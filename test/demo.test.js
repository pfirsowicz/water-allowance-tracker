"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

test("static demo is isolated, synthetic and supports reading workflow", async () => {
  const root = path.resolve(__dirname, "../docs/demo");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /synthetic data only/i);
  assert.match(html, /mock-api.js/);
  const context = { window: {}, Response, URL, Date };
  vm.runInNewContext(fs.readFileSync(path.join(root, "assets/mock-api.js"), "utf8"), context);
  const fetch = context.window.fetch;
  await assert.rejects(fetch("https://example.com/api/readings"), /offline-only/);
  const initial = await (await fetch("/api/readings")).json();
  assert.equal(initial.items.length, 4);
  assert.equal(initial.items[0].reading, 108000);
  const settings = await (await fetch("/api/settings")).json();
  assert.equal(settings.settings.baselineReading, 100000);
  let res = await fetch("/api/readings", { method: "POST",
    body: JSON.stringify({readingDate:"2026-01-16",reading:110000}) });
  assert.equal(res.status, 201);
  const id = (await res.json()).item.id;
  res = await fetch("/api/readings/" + id, { method: "PATCH",
    body: JSON.stringify({readingDate:"2026-01-16",reading:109500}) });
  assert.equal(res.status, 200);
  res = await fetch("/api/readings", { method: "POST",
    body: JSON.stringify({readingDate:"2026-01-12",reading:200000}) });
  assert.equal(res.status, 409);
  res = await fetch("/api/readings/export.csv");
  assert.equal(res.status,200);
  assert.match(await res.text(), /2026-01-16,109500/);
  res = await fetch("/api/readings/" + id,{method:"DELETE"});
  assert.equal(res.status,200);
  assert.equal((await (await fetch("/api/readings")).json()).items.length,4);
});
