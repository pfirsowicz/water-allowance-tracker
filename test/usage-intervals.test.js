"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {buildUsageIntervals}=require("../public/assets/calculations");

const settings={
  baselineDate:"2026-01-01",baselineReading:100000,dailyAllowance:800
};
const readings=[
  {readingDate:"2026-01-13",reading:108000},
  {readingDate:"2026-01-06",reading:103000},
  {readingDate:"2026-01-10",reading:105500},
  {readingDate:"2026-01-03",reading:101200}
];

test("calculates real interval averages, including the baseline, from unordered readings",()=>{
  const input=readings.map(x=>({...x}));
  const intervals=buildUsageIntervals(input,settings);
  assert.deepEqual(intervals.map(i=>i.days),[2,3,4,3]);
  assert.deepEqual(intervals.map(i=>i.litresUsed),[1200,1800,2500,2500]);
  assert.deepEqual(intervals.map(i=>i.averagePerDay),[600,600,625,2500/3]);
  assert.equal(intervals[3].allowancePerDay,800);
  assert.deepEqual(readings,input,"input must not be reordered or mutated");
});

test("same-day repeat measurements do not fabricate zero-day consumption",()=>{
  const intervals=buildUsageIntervals([
    {readingDate:"2026-01-01",reading:100300},
    {readingDate:"2026-01-01",reading:100100},
    {readingDate:"2026-01-03",reading:101100},
    {readingDate:"2026-01-03",reading:101000},
    {readingDate:"2026-01-06",reading:102000}
  ],settings);
  assert.deepEqual(intervals.map(x=>x.days),[2,3]);
  assert.deepEqual(intervals.map(x=>x.litresUsed),[800,900]);
  assert.ok(intervals.every(x=>Number.isFinite(x.averagePerDay)));
});

test("zero and one reading produce an explicit empty or baseline interval",()=>{
  assert.deepEqual(buildUsageIntervals([],settings),[]);
  assert.equal(buildUsageIntervals([{readingDate:"2026-01-01",reading:100000}],settings).length,0);
  const only=buildUsageIntervals([{readingDate:"2026-01-02",reading:100000}],settings);
  assert.equal(only.length,1);
  assert.equal(only[0].averagePerDay,0);
});

test("handles NZ daylight-saving boundaries as calendar days",()=>{
  for(const [start,end] of [["2026-09-26","2026-09-28"],["2027-04-03","2027-04-05"]]){
    const result=buildUsageIntervals([
      {readingDate:end,reading:100800}
    ],{baselineDate:start,baselineReading:100000,dailyAllowance:800});
    assert.equal(result[0].days,2);
    assert.equal(result[0].averagePerDay,400);
  }
});

test("rejects invalid settings, dates and a decreasing cumulative reading",()=>{
  assert.throws(()=>buildUsageIntervals(readings,{...settings,dailyAllowance:0}),/daily allowance/i);
  assert.throws(()=>buildUsageIntervals(readings,{...settings,baselineDate:"2026-02-30"}),/baseline date/i);
  assert.throws(()=>buildUsageIntervals([{readingDate:"2026-02-30",reading:120000}],settings),/invalid measurement/i);
  assert.throws(()=>buildUsageIntervals([{readingDate:"2026-01-04",reading:99999}],settings),/inconsistent/i);
  assert.throws(()=>buildUsageIntervals([{readingDate:"2026-01-04",reading:"102000"}],settings),/invalid measurement/i);
});

test("ignores readings before the baseline and does not connect truncated history to an unknown start",()=>{
  const remaining=buildUsageIntervals([
    {readingDate:"2025-12-29",reading:99000},
    {readingDate:"2026-01-03",reading:101200}
  ],settings);
  assert.equal(remaining.length,1);
  assert.equal(remaining[0].days,2);
  const history=Array.from({length:200},(_,i)=>({
    readingDate:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),
    reading:100000+i*100
  }));
  const intervals=buildUsageIntervals(history,settings);
  assert.equal(intervals.length,199);
  assert.equal(intervals[0].fromDate,"2026-01-01");
  assert.equal(intervals[0].toDate,"2026-01-02");
});
