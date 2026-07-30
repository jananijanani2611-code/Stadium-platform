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

test("dashboard counts are numbers, not accidentally strings or missing", () => {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  assert.strictEqual(typeof data.dashboard.lostAndFound, "number");
  assert.strictEqual(typeof data.dashboard.cleaningRequests, "number");
  assert.strictEqual(typeof data.dashboard.securityAlerts, "number");
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
