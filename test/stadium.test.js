const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

// nothing fancy here, just sanity-checking the data file since the whole
// app falls apart if this json is malformed or missing a field the
// frontend/server assume exists
const dataPath = path.join(__dirname, "..", "data", "stadium.json");

test("stadium.json is valid JSON with required top-level fields", () => {
  const raw = fs.readFileSync(dataPath, "utf-8");
  const data = JSON.parse(raw);
  assert.ok(data.stadiumName, "stadiumName should exist");
  assert.ok(Array.isArray(data.gates), "gates should be an array");
  assert.ok(Array.isArray(data.liveTicker), "liveTicker should be an array");
});

test("every gate has an id and a valid status", () => {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const validStatuses = ["open", "delayed", "closed"];
  for (const gate of data.gates) {
    assert.ok(gate.id, "gate should have an id");
    assert.ok(validStatuses.includes(gate.status), `unexpected status: ${gate.status}`);
  }
});

// this bit me during dev - if a closed gate keeps a stale wait number the
// UI shows "CLOSED · 12 min wait" which makes no sense, so locking it down
test("closed gates report null waitMinutes", () => {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const closedGates = data.gates.filter((g) => g.status === "closed");
  for (const gate of closedGates) {
    assert.strictEqual(gate.waitMinutes, null);
  }
});

test("amenities include restrooms, foodStalls, medical, and accessibility", () => {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  assert.ok(Array.isArray(data.amenities.restrooms));
  assert.ok(Array.isArray(data.amenities.foodStalls));
  assert.ok(Array.isArray(data.amenities.medical));
  assert.ok(data.amenities.accessibility);
});

// added these once the ops dashboard/stats cards started reading fields
// that didn't exist in the original v1 schema - want a fast failure if
// someone edits the json and forgets one of these
test("every gate has a crowdLevel the heatmap can render", () => {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const validLevels = ["low", "medium", "high"];
  for (const gate of data.gates) {
    assert.ok(validLevels.includes(gate.crowdLevel), `bad crowdLevel on ${gate.id}: ${gate.crowdLevel}`);
  }
});

test("match info has what the match card needs", () => {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  assert.ok(data.match.homeTeam && data.match.awayTeam);
  assert.ok(data.match.kickoffDisplay);
  assert.strictEqual(typeof data.match.attendance, "number");
  assert.strictEqual(typeof data.match.weatherC, "number");
});

test("notifications each have an id, message, time, and read flag", () => {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  for (const n of data.notifications) {
    assert.ok(n.id);
    assert.ok(n.message);
    assert.ok(n.time);
    assert.strictEqual(typeof n.read, "boolean");
  }
});

// added when the weather card and ops percentage bars were built - both
// read these fields directly, so a missing one would silently render "undefined"
test("match has the weather detail fields the weather card needs", () => {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  assert.strictEqual(typeof data.match.weatherCondition, "string");
  assert.strictEqual(typeof data.match.windKmh, "number");
  assert.strictEqual(typeof data.match.humidityPct, "number");
  assert.strictEqual(typeof data.match.precipPct, "number");
});

test("dashboard has percentage fields for the operations progress bars", () => {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const pctFields = ["crowdManagementPct", "gateOperationsPct", "medicalServicesPct", "cleaningPct", "lostAndFoundPct", "securityPct"];
  for (const field of pctFields) {
    const value = data.dashboard[field];
    assert.strictEqual(typeof value, "number", `${field} should be a number`);
    assert.ok(value >= 0 && value <= 100, `${field} should be a valid percentage`);
  }
});

test("gate sections are parseable ranges for the section-aware matchday panel", () => {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  for (const gate of data.gates) {
    for (const range of gate.sections) {
      const [start, end] = range.split("-").map((n) => parseInt(n, 10));
      assert.ok(!Number.isNaN(start) && !Number.isNaN(end), `${gate.id} has an unparseable section range: ${range}`);
      assert.ok(start <= end, `${gate.id} range is inverted: ${range}`);
    }
  }
});
