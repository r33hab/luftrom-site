// Run with: node --test tests/share.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const share = require("../s/share.js");

test("reads the link the app writes", () => {
  assert.deepEqual(share.parse("?lat=60.19392&lon=11.10036"), { lat: 60.19392, lon: 11.10036 });
  assert.deepEqual(share.parse("?lat=70.98333&lon=-8.50000"), { lat: 70.98333, lon: -8.5 });
});

test("rejects missing, malformed, out-of-range and injected values", () => {
  const bad = ["", "?lat=59.9", "?lon=10.7", "?lat=&lon=10.7", "?lat=abc&lon=10.7", "?lat=NaN&lon=10.7",
    "?lat=Infinity&lon=10.7", "?lat=1e1&lon=10.7", "?lat=91&lon=10.7", "?lat=59.9&lon=180.5",
    "?lat=59.9&lon=10.7<script>", "?lat=%3Cimg%20src%3Dx%3E&lon=10.7", "?lat=%2059.9&lon=10.7"];
  for (const q of bad) assert.equal(share.parse(q), null, q);
});

test("builds the luftrom:// link with five decimals", () => {
  assert.equal(share.appLink({ lat: 59.9, lon: 10.7 }), "luftrom://check?lat=59.90000&lon=10.70000");
});

test("labels the spot like the app, with Norwegian hemisphere letters", () => {
  assert.equal(share.label({ lat: 70.98333, lon: -8.5 }, "nb"), "70.9833° N, 8.5000° V");
  assert.equal(share.label({ lat: 59.9139, lon: 10.7522 }, "en"), "59.9139° N, 10.7522° E");
});

test("language: ?lang, then the remembered choice, then the browser's first language", () => {
  assert.equal(share.pickLang("?lang=en", "nb", ["nb-NO"]), "en");
  assert.equal(share.pickLang("", "nb", ["en-US"]), "nb");
  assert.equal(share.pickLang("", null, ["nn-NO"]), "nb");
  assert.equal(share.pickLang("", null, ["no"]), "nb");
  assert.equal(share.pickLang("", null, ["de-DE", "nb-NO"]), "en");
  assert.equal(share.pickLang("", null, []), "en");
});
