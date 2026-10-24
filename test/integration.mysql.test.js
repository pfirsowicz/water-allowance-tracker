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
const { withSerializedMutation } = require("../src/services/readings.service");

// Run only with WATER_TEST_MYSQL=1 and an isolated localhost MySQL test instance.
// Never test against production. No database is dropped or existing rows truncated.
const run = process.env.WATER_TEST_MYSQL === "1";
const it = run ? test : test.skip;

it("MySQL 8 + HTTP integration: CRUD, conflicts, failures, rollback and auth", async (t) => {
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
          ...(authorize ? {authorization:authorize===true ? auth : authorize} : {}),
          ...(body?{"content-type":"application/json"}:{})
        },
        ...(body?{body:JSON.stringify(body)}:{})
      });
      const text=await response.text();
      let json;
      try{json=JSON.parse(text)}catch{json=null}
      return {status:response.status,json,text,challenge:response.headers.get("www-authenticate")};
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

    const snapshot = async () => {
      const [items] = await pool.query(
        "SELECT id, DATE_FORMAT(date,'%Y-%m-%d') AS readingDate, reading "+
        "FROM readings ORDER BY date, time, id"
      );
      return items.map((item) => ({
        id:Number(item.id),readingDate:item.readingDate,reading:Number(item.reading)
      }));
    };
    const assertMonotonic = async () => {
      const items = await snapshot();
      for(let i=1;i<items.length;i++){
        assert.ok(items[i].reading>=items[i-1].reading,
          "persisted chronology must never decrease");
      }
      return items;
    };

    await t.test("authentication rejects absent, incorrect, malformed and unsupported credentials before any write", async () => {
      const before = await snapshot();
      assert.throws(
        () => createBasicAuth({enabled:true,username:"tester",password:""}),
        /requires APP_USERNAME and APP_PASSWORD/
      );
      for (const header of [
        false,
        "Bearer synthetic-token",
        "Basic "+Buffer.from("tester:incorrect").toString("base64"),
        "Basic "+Buffer.from("wrong:only-for-test").toString("base64"),
        "Basic !!!not-base64!!!",
        "Basic "+Buffer.from("missing-separator").toString("base64")
      ]) {
        for (const [method,route,body] of [
          ["GET","/api/readings"],
          ["GET","/api/settings"],
          ["GET","/api/readings/export.csv"],
          ["POST","/api/readings",{readingDate:"2026-01-20",reading:107000}],
          ["PATCH","/api/readings/"+before[0].id,{readingDate:"2026-01-05",reading:103000}],
          ["DELETE","/api/readings/"+before[0].id]
        ]) {
          const denied=await req(method,route,body,header);
          assert.equal(denied.status,401,method+" "+route);
          assert.match(denied.challenge||"",/^Basic realm=/);
          assert.doesNotMatch(denied.text,/only-for-test|synthetic-token/);
        }
      }
      assert.deepEqual(await snapshot(),before,"rejected requests must not mutate rows");
    });

    await t.test("duplicate API create/update and native unique index reject duplicates without side effects", async () => {
      const before=await snapshot();
      const second=before.find(x=>x.readingDate==="2026-01-15");
      const first=before.find(x=>x.readingDate==="2026-01-05");
      assert.ok(first && second);
      let denied=await req("POST","/api/readings",{
        readingDate:second.readingDate,reading:second.reading
      });
      assert.equal(denied.status,409,denied.text);
      assert.equal(denied.json.code,"duplicate_reading");
      denied=await req("PATCH","/api/readings/"+first.id,{
        readingDate:second.readingDate,reading:second.reading
      });
      assert.equal(denied.status,409,denied.text);
      assert.equal(denied.json.code,"duplicate_reading");
      await assert.rejects(
        pool.query("INSERT INTO readings (`date`,`time`,`reading`) VALUES (?,CURTIME(),?)",
          [second.readingDate,second.reading]),
        error=>error.code==="ER_DUP_ENTRY",
        "the database itself must constrain exact duplicates"
      );
      assert.deepEqual(await snapshot(),before);
    });

    await t.test("rollback restores committed state after successful insert and delete statements", async () => {
      const before=await snapshot();
      await assert.rejects(
        withSerializedMutation(pool,async (db)=>{
          const [result]=await db.query(
            "INSERT INTO readings (`date`,`time`,`reading`) VALUES (?,CURTIME(),?)",
            ["2026-01-20",108000]
          );
          assert.ok(result.insertId,"insert actually ran before test failure");
          throw new Error("synthetic transaction abort after insert");
        }),
        /synthetic transaction abort after insert/
      );
      assert.deepEqual(await snapshot(),before,"rolled-back insert must not persist");
      await assert.rejects(
        withSerializedMutation(pool,async (db)=>{
          const [result]=await db.query("DELETE FROM readings WHERE id=?", [before[0].id]);
          assert.equal(result.affectedRows,1,"delete executed in transaction");
          throw new Error("synthetic transaction abort after delete");
        }),
        /synthetic transaction abort after delete/
      );
      assert.deepEqual(await snapshot(),before,"rolled-back deletion must restore the row");
      await assert.rejects(
        withSerializedMutation(pool,async (db)=>{
          const [result]=await db.query(
            "UPDATE readings SET reading=? WHERE id=?", [103000,before[0].id]
          );
          assert.equal(result.affectedRows,1,"update executed in transaction");
          throw new Error("synthetic transaction abort after update");
        }),
        /synthetic transaction abort after update/
      );
      assert.deepEqual(await snapshot(),before,"rolled-back update must restore the prior reading");
      const saved=await req("POST","/api/readings",{readingDate:"2026-01-20",reading:108000});
      assert.equal(saved.status,201,saved.text);
      assert.equal((await req("DELETE","/api/readings/"+saved.json.item.id)).status,200,
        "advisory lock must be released after rollback");
      assert.deepEqual(await snapshot(),before);
    });

    await t.test("concurrent different-date writes that are individually valid cannot both break chronology", async () => {
      const before=await snapshot();
      const pair=await Promise.all([
        req("POST","/api/readings",{readingDate:"2026-01-08",reading:104500}),
        req("POST","/api/readings",{readingDate:"2026-01-09",reading:103500})
      ]);
      assert.deepEqual(pair.map(x=>x.status).sort((a,b)=>a-b),[201,409]);
      assert.ok(pair.find(x=>x.status===409).json.code.startsWith("reading_"));
      const after=await assertMonotonic();
      assert.equal(after.length,before.length+1,"only one conflicting insert can commit");
      assert.equal(after.filter(x=>["2026-01-08","2026-01-09"].includes(x.readingDate)).length,1);
      const inserted=pair.find(x=>x.status===201).json.item.id;
      assert.equal((await req("DELETE","/api/readings/"+inserted)).status,200);
      assert.deepEqual(await snapshot(),before);
    });

    await t.test("concurrent updates preserve monotonic order and reject one conflicting change", async () => {
      const before=await snapshot();
      const early=before.find(x=>x.readingDate==="2026-01-05");
      const late=before.find(x=>x.readingDate==="2026-01-15");
      assert.ok(early && late);
      // Each update alone is valid relative to the original state. Both
      // committed updates together would create a decreasing reading history.
      const pair=await Promise.all([
        req("PATCH","/api/readings/"+early.id,{
          readingDate:early.readingDate,reading:105000
        }),
        req("PATCH","/api/readings/"+late.id,{
          readingDate:late.readingDate,reading:104000
        })
      ]);
      assert.deepEqual(pair.map(x=>x.status).sort((a,b)=>a-b),[200,409]);
      const after=await assertMonotonic();
      assert.equal(after.length,before.length);
      assert.equal(after.filter(x=>x.reading!==before.find(y=>y.id===x.id).reading).length,1);
      const modified=pair.find(x=>x.status===200).json.item;
      const original=before.find(x=>x.id===modified.id);
      const restored=await req("PATCH","/api/readings/"+original.id,{
        readingDate:original.readingDate,reading:original.reading
      });
      assert.equal(restored.status,200,restored.text);
      assert.deepEqual(await snapshot(),before);
    });

    await t.test("MySQL connection authentication failure returns safe 500 responses without leaking connection details", async () => {
      const before=await snapshot();
      const unavailablePool=mysql.createPool({
        host,port,database,
        user:"water_test_nonexistent_user",
        password:"synthetic-invalid-credentials",
        connectionLimit:1
      });
      let unavailableServer;
      try {
        const degraded=express();
        degraded.use(createBasicAuth({enabled:true,username:"tester",password:"only-for-test"}));
        degraded.use(express.json());
        degraded.use("/api/readings",createReadingsRouter(unavailablePool));
        degraded.use("/api/settings",createSettingsRouter(unavailablePool));
        unavailableServer=await new Promise(resolve=>{
          const instance=degraded.listen(0,"127.0.0.1",()=>resolve(instance));
        });
        const degradedBase="http://127.0.0.1:"+unavailableServer.address().port;
        for(const [route,expected] of [
          ["/api/readings","Failed to fetch readings."],
          ["/api/settings","Failed to load settings."]
        ]) {
          const response=await fetch(degradedBase+route,{
            headers:{authorization:auth}
          });
          assert.equal(response.status,500);
          const text=await response.text();
          const body=JSON.parse(text);
          assert.deepEqual(body,{error:expected,code:"internal_error"});
          assert.doesNotMatch(text,/water_test_nonexistent_user|synthetic-invalid-credentials|ER_ACCESS_DENIED|mysql|stack/i);
        }
      } finally {
        if(unavailableServer) await new Promise(resolve=>unavailableServer.close(resolve));
        await unavailablePool.end();
      }
      assert.deepEqual(await snapshot(),before);
      assert.equal((await req("GET","/api/readings")).status,200,
        "original MySQL connection must remain available");
    });

    await t.test("database insert failure returns safe HTTP 500, rolls back, releases lock and recovers", async () => {
      const before=await snapshot();
      let triggerCreated=false;
      try {
        await pool.query(
          "CREATE TRIGGER water_test_reject_insert BEFORE INSERT ON readings "+
          "FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic db failure marker'"
        );
        triggerCreated=true;
        const denied=await req("POST","/api/readings",{
          readingDate:"2026-01-20",reading:108000
        });
        assert.equal(denied.status,500,denied.text);
        assert.equal(denied.json.code,"internal_error");
        assert.equal(denied.json.error,"Failed to save reading.");
        assert.doesNotMatch(denied.text,/synthetic db failure marker|SQLSTATE|TRIGGER|stack/i);
        assert.deepEqual(await snapshot(),before,"failed SQL must leave no committed changes");
      } finally {
        if(triggerCreated) await pool.query("DROP TRIGGER water_test_reject_insert");
      }
      const saved=await req("POST","/api/readings",{
        readingDate:"2026-01-20",reading:108000
      });
      assert.equal(saved.status,201,saved.text);
      assert.equal((await req("DELETE","/api/readings/"+saved.json.item.id)).status,200);
      assert.deepEqual(await snapshot(),before,"DB recovers and can write again");
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});
