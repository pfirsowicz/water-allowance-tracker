'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const project = path.basename(root).includes('water') ? 'water-allowance-tracker' : 'beekeeping-operations-demo';
const base = 'https://pfirsowicz.github.io/' + project + '/';
const pages = project === 'water-allowance-tracker' ? ['docs/index.html', 'docs/demo/index.html'] : ['docs/index.html'];
const image = fs.readFileSync(path.join(root, 'docs/og-preview.png'));
test('real screenshot preview has valid 1200 x 630 PNG dimensions', () => {
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
});
for (const page of pages) test(page + ' includes correct share metadata', () => {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  for (const tag of ['og:type','og:title','og:description','og:url','og:image','og:image:width','og:image:height','og:image:alt','twitter:card','twitter:title','twitter:description','twitter:image']) {
    assert.ok(html.includes('content=') && html.includes('"' + tag + '"'), tag + ' absent');
  }
  assert.ok(html.includes('<link rel="canonical" href="' + base + '"'));
  assert.ok(html.includes('content="' + base + 'og-preview.png"'));
  assert.ok(html.includes('content="1200"') && html.includes('content="630"'));
  assert.ok(html.includes('synthetic data'));
  assert.ok(!html.includes('content="undefined"'));
});
