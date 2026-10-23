"use strict";

// Browser-only, synthetic, in-memory HTTP adapter to reuse the real v4 UI.
// It intercepts exactly the demo's /api/ routes; it never makes network calls.
(() => {
  let nextId = 5;
  let readings = [
    { id: 4, readingDate: "2026-01-13", reading: 108000 },
    { id: 3, readingDate: "2026-01-10", reading: 105500 },
    { id: 2, readingDate: "2026-01-06", reading: 103000 },
    { id: 1, readingDate: "2026-01-03", reading: 101200 }
  ];
  let settings = {
    baselineDate: "2026-01-01", baselineReading: 100000,
    dailyAllowance: 800, persisted: true, updatedAt: "2026-01-13 09:00:00"
  };
  function response(payload, status = 200, contentType = "application/json") {
    return new Response(contentType === "application/json" ? JSON.stringify(payload) : payload, {
      status, headers: { "content-type": contentType }
    });
  }
  function displayDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return match ? match[3] + "/" + match[2] + "/" + match[1] : iso;
  }
  function item(reading) {
    return {
      ...reading, date: displayDate(reading.readingDate), time: "09:00:00",
      createdAtEpoch: Date.UTC(2026,0,12,20)/1000
    };
  }
  function validDate(iso) {
    if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const time = new Date(iso + "T00:00:00Z");
    return !Number.isNaN(time.getTime()) && time.toISOString().slice(0,10) === iso;
  }
  function sort() {
    readings.sort((a,b) => b.readingDate.localeCompare(a.readingDate) || b.id - a.id);
  }
  async function mockFetch(resource, options = {}) {
    const url = typeof resource === "string" ? resource : resource?.url;
    if (typeof url !== "string" || !url.startsWith("/api/")) {
      throw new Error("Public demo is offline-only; no network calls are permitted.");
    }
    const route = url.split("?")[0];
    const method = (options.method || "GET").toUpperCase();
    let body;
    if (options.body) {
      try { body = JSON.parse(options.body); }
      catch { return response({error:"Invalid JSON",code:"invalid_json"},400); }
    }
    if (method==="GET" && route==="/api/settings") return response({settings});
    if (method==="PUT" && route==="/api/settings") {
      if (!validDate(body?.baselineDate) || !Number.isSafeInteger(body?.baselineReading) ||
          body.baselineReading<0 || !Number.isSafeInteger(body?.dailyAllowance) || body.dailyAllowance<=0) {
        return response({error:"Invalid allowance settings",code:"invalid_settings"},400);
      }
      settings={...body,persisted:true,updatedAt:"Demo session"};
      return response({ok:true,settings});
    }
    if (method==="GET" && route==="/api/readings") {
      sort();
      const limit=Math.min(1000,Math.max(1,Number(new URL(url,"http://demo.local").searchParams.get("limit"))||200));
      return response({items:readings.slice(0,limit).map(item)});
    }
    if (method==="GET" && route==="/api/readings/export.csv") {
      const lines=["reading_date,reading_litres,saved_at_utc",...readings.slice().reverse().map(x =>
        x.readingDate+","+x.reading+",2026-01-13T09:00:00.000Z")];
      return response(lines.join("\n")+"\n",200,"text/csv;charset=utf-8");
    }
    const match=/^\/api\/readings\/(\d+)$/.exec(route);
    if (route==="/api/readings" && method==="POST" || match && ["PATCH","DELETE"].includes(method)) {
      const id=match?Number(match[1]):null;
      const existing=match?readings.find(x=>x.id===id):null;
      if (match && !existing) return response({error:"Reading not found",code:"reading_not_found"},404);
      if (method==="DELETE") {
        readings=readings.filter(x=>x.id!==id);
        return response({ok:true});
      }
      if (!validDate(body?.readingDate) || !Number.isSafeInteger(body?.reading) || body.reading<0) {
        return response({error:"Invalid reading date or number",code:"invalid_reading"},400);
      }
      if(readings.some(x=>x.id!==id && x.readingDate===body.readingDate && x.reading===body.reading)) {
        return response({error:"That reading is already recorded",code:"duplicate_reading"},409);
      }
      const candidate=[...readings.filter(x=>x.id!==id),{id:id??nextId,readingDate:body.readingDate,reading:body.reading}]
        .sort((a,b)=>a.readingDate.localeCompare(b.readingDate)||a.id-b.id);
      if(candidate.some((x,i)=>i>0&&x.reading<candidate[i-1].reading)) {
        return response({error:"Reading would break cumulative chronology",code:"reading_chronology"},409);
      }
      if(method==="POST") nextId++;
      readings=candidate;
      sort();
      return response({ok:true,item:item(candidate.find(x=>x.id===(id??nextId-1)))},method==="POST"?201:200);
    }
    return response({error:"Demo endpoint unavailable",code:"not_found"},404);
  }
  window.fetch = mockFetch;
})();
