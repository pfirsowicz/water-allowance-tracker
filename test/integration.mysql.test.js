"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const mysql = require("mysql2/promise");
const { createBasicAuth } = require("../src/middleware/basic-auth");
const { createReadingsRouter } = require("../src/routes/readings.routes");
const { createSettingsRouter } = require("../src/routes/settings.routes");

// Run only with WATER_TEST_MYSQL=1 and an isolated localhost MySQL test instance.
// Never test against production. No database is dropped or existing rows truncated.
const run = process.env.WATER_TEST_MYSQL === "1";
const it = run ? test : test.skip;

it("MySQL 8 + HTTP integration: real CRUD, settings, chronology, concurrent writes, CSV and auth", async () => {
  const host = process.env.WATER_TEST_DB_HOST;
  const port = Number(process.env.WATER_TEST_DB_PORT);
  const database = process.env.WATER_TEST_DB_NAME;
  if (host !== "127.0.0.1" || !Number.isSafeInteger(port) || port === 3306 ||
      !database?.startsWith("water_test_")) {
    throw new Error("Refusing non-isolated DB. Require loopback host, non-default port and water_test_* DB.");
  }
  const pool = mysql.createPool({
    host, port, database,
    user: process.env.WATER_TEST_DB_USER,
    password: process.env.WATER_TEST_DB_PASSWORD || "",
    waitForConnections: true,
    connectionLimit: 6,
  });
  let server;
  try {
    const sql = fs.readFileSync(path.resolve(__dirname, "../schema.sql"), "utf8");
    for (const statement of sql.split(";").map(x => x.trim()).filter(Boolean)) {
      await pool.query(statement);
    }
    const [existing] = await pool.query("SELECT COUNT(*) AS n FROM readings");
    if (Number(existing[0].n) !== 0) {
      throw new Error("Refusing to run integration tests on a nonempty database");
    }

    const app = express();
    app.use(createBasicAuth({ enabled:true, username:"tester", password:"only-for-test" }));
    app.use(express.json());
    app.use("/api/readings", createReadingsRouter(pool));
    app.use("/api/settings", createSettingsRouter(pool));
    server = await new Promise(resolve => {
      const srv=app.listen(0,"127.0.0.1",()=>resolve(srv));
    });
    const base="http://127.0.0.1:"+server.address().port;
    const auth="Basic "+Buffer.from("tester:only-for-test").toString("base64");
    const req=async(method,route,body,authorize=true)=>{
      const response=await fetch(base+route,{
        method,
        headers:{
          ...(authorize?{authorization:auth}:{}),
          ...(body?{"content-type":"application/json"}:{})
        },
        ...(body?{body:JSON.stringify(body)}:{})
      });
      const text=await response.text();
      let json;
      try{json=JSON.parse(text)}catch{json=null}
      return {status:response.status,json,text};
    };
    assert.equal((await req("GET","/api/readings",null,false)).status,401);
    const values = await req("GET","/api/settings");
    assert.equal(values.status,200);
    assert.equal(values.json.settings.baselineReading,100000);
    let r=await req("PUT","/api/settings",{baselineDate:"2026-01-01",baselineReading:100000,dailyAllowance:800});
    assert.equal(r.status,200);
    assert.equal(r.json.settings.persisted,true);
    r=await req("POST","/api/readings",{readingDate:"2026-01-10",reading:105000});
    assert.equal(r.status,201,r.text);
    const id=r.json.item.id;
    r=await req("POST","/api/readings",{readingDate:"2026-01-05",reading:102000});
    assert.equal(r.status,201,r.text);
    r=await req("POST","/api/readings",{readingDate:"2026-01-08",reading:106000});
    assert.equal(r.status,409,r.text);
    r=await req("PATCH","/api/readings/"+id,{readingDate:"2026-01-10",reading:101000});
    assert.equal(r.status,409,r.text);
    r=await req("PATCH","/api/readings/"+id,{readingDate:"2026-01-10",reading:105500});
    assert.equal(r.status,200,r.text);
    r=await req("POST","/api/readings",{readingDate:"2026-01-15",reading:"106000"});
    assert.equal(r.status,400,r.text);
    const pair=await Promise.all([
      req("POST","/api/readings",{readingDate:"2026-01-15",reading:106000}),
      req("POST","/api/readings",{readingDate:"2026-01-15",reading:106000})
    ]);
    assert.deepEqual(pair.map(x=>x.status).sort((a,b)=>a-b),[201,409]);
    const [rows]=await pool.query("SELECT DATE_FORMAT(date,'%Y-%m-%d') AS readingDate, reading FROM readings ORDER BY date,time,id");
    for(let i=1;i<rows.length;i++){
      assert.ok(Number(rows[i].reading)>=Number(rows[i-1].reading),"chronology remains monotonic");
    }
    assert.equal((await req("GET","/api/readings?limit=100")).json.items.length,3);
    const csv=await req("GET","/api/readings/export.csv");
    assert.equal(csv.status,200);
    assert.match(csv.text,/reading_date,reading_litres,saved_at_utc/);
    assert.match(csv.text,/2026-01-15,106000/);
    r=await req("DELETE","/api/readings/"+id);
    assert.equal(r.status,200,r.text);
    assert.equal((await req("GET","/api/readings")).json.items.length,2);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});
