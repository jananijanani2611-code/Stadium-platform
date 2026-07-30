const express = require("express");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const STADIUM_DATA_PATH = path.join(__dirname, "data", "stadium.json");
const CROWD_LEVELS = ["low", "medium", "high"];

// just reading the json fresh each time instead of caching it in memory -
// dataset is tiny so no real perf hit, and it means the simulate-update
// route below actually persists between requests without extra plumbing
function loadStadiumData() {
  const raw = fs.readFileSync(STADIUM_DATA_PATH, "utf-8");
  return JSON.parse(raw);
}

function saveStadiumData(data) {
  fs.writeFileSync(STADIUM_DATA_PATH, JSON.stringify(data, null, 2));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

app.get("/api/stadium", (req, res) => {
  try {
    res.json(loadStadiumData());
  } catch (err) {
    console.error("failed to read stadium.json:", err.message);
    res.status(500).json({ error: "Could not load stadium data" });
  }
});

// this is a stand-in for a real live feed (turnstile counters, IoT sensors,
// crowd cameras, whatever the venue actually has). every call nudges a
// handful of random fields so the dashboard/heatmap/ticker all feel alive.
// frontend calls this on its own 10s interval now instead of only on a
// manual button click - kept the manual button too since it's handy for demos
app.post("/api/simulate-update", (req, res) => {
  try {
    const data = loadStadiumData();
    const tickerAdditions = [];

    // nudge one gate's wait time and occasionally its crowd level
    const gate = pick(data.gates);
    if (gate.waitMinutes !== null) {
      const jitter = Math.floor(Math.random() * 7) - 3; // -3 to +3
      gate.waitMinutes = Math.max(1, gate.waitMinutes + jitter);
      tickerAdditions.push(`${gate.id} wait time updated to ${gate.waitMinutes} min`);
    }
    if (Math.random() > 0.6) {
      gate.crowdLevel = pick(CROWD_LEVELS);
    }

    // nudge one food stall's queue
    const stall = pick(data.amenities.foodStalls);
    stall.queueMinutes = Math.max(1, stall.queueMinutes + (Math.floor(Math.random() * 5) - 2));
    if (Math.random() > 0.7) {
      tickerAdditions.push(`${stall.id} queue now ${stall.queueMinutes} min`);
    }

    // nudge one restroom's occupancy
    const restroom = pick(data.amenities.restrooms.filter((r) => r.status === "open"));
    if (restroom) {
      restroom.occupancyPct = Math.min(100, Math.max(0, restroom.occupancyPct + (Math.floor(Math.random() * 21) - 10)));
    }

    // small chance of a fresh medical alert clearing (keeps the count from only ever going up)
    if (Math.random() > 0.85 && data.medicalAlerts.length > 0) {
      const cleared = data.medicalAlerts.shift();
      tickerAdditions.push(`Medical alert at ${cleared.location} resolved`);
    }

    // roll everything above into notifications + the scrolling ticker
    for (const msg of tickerAdditions) {
      data.notifications.unshift({
        id: `n-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        message: msg,
        time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        read: false,
      });
    }
    data.notifications = data.notifications.slice(0, 12); // don't let this grow forever

    data.liveTicker = [...tickerAdditions, ...data.liveTicker].slice(0, 6);

    saveStadiumData(data);
    res.json(data);
  } catch (err) {
    console.error("simulate-update failed:", err.message);
    res.status(500).json({ error: "Could not simulate update" });
  }
});

// marks a single notification as read when the user opens the panel and clicks it
app.post("/api/notifications/:id/read", (req, res) => {
  try {
    const data = loadStadiumData();
    const note = data.notifications.find((n) => n.id === req.params.id);
    if (!note) {
      return res.status(404).json({ error: "Notification not found" });
    }
    note.read = true;
    saveStadiumData(data);
    res.json({ ok: true });
  } catch (err) {
    console.error("mark-read failed:", err.message);
    res.status(500).json({ error: "Could not update notification" });
  }
});

// ---------- local chat engine (no external API needed) ----------
// A rule-based, human-sounding bot that reads live stadium.json data.
// Intent is matched by keyword groups; each handler composes a reply from
// real data so answers stay accurate as the simulate-update loop runs.

function humanReply(data, msg) {
  const q = msg.toLowerCase();

  const greetings = ["hi", "hello", "hey", "good morning", "good evening", "howdy", "sup", "what's up"];
  if (greetings.some((g) => q.startsWith(g) || q === g)) {
    const lines = [
      `Hey there! Welcome to ${data.stadiumName} 👋 I'm Concourse AI, your live match-day assistant.`,
      `What can I help you with today? Gates, food, restrooms, parking — just ask!`,
    ];
    return lines.join(" ");
  }

  // ── EMERGENCY keywords ──────────────────────────────────────────────────
  const isEmergency =
    /\b(fire|emergency|medical|ambulance|lost.child|missing.child|security.incident|fight|weapon|threat)\b/.test(q);
  if (isEmergency) {
    const med = data.amenities.medical[0];
    return (
      `🚨 Please stay calm. Alert the nearest staff member immediately. ` +
      `The closest First Aid point is **${med.id}** (near Section ${med.nearSection}) — ` +
      `staff are there right now and ready to help. If it's life-threatening, call 911.`
    );
  }

  // ── GATE questions ───────────────────────────────────────────────────────
  if (/\b(gate|enter|entrance|entry|way in|get in)\b/.test(q)) {
    // "which gate" / "best gate" / "quietest gate"
    const open = data.gates.filter((g) => g.status === "open");
    const byWait = [...open].sort((a, b) => (a.waitMinutes || 99) - (b.waitMinutes || 99));
    const best = byWait[0];

    // Did they mention a specific gate letter?
    const match = q.match(/gate\s+([a-e])/i);
    if (match) {
      const gateId = `Gate ${match[1].toUpperCase()}`;
      const gate = data.gates.find((g) => g.id === gateId);
      if (!gate) return `Hmm, I don't have info on ${gateId}. We have Gates A–E at MetLife.`;
      if (gate.status === "closed") {
        return (
          `${gate.id} is currently **closed** — sorry about that! ` +
          (gate.note ? `(${gate.note}) ` : "") +
          `Your best alternative right now is **${best.id}** with just a ${best.waitMinutes}-min wait.`
        );
      }
      if (gate.status === "delayed") {
        return (
          `${gate.id} is **delayed** right now — ${gate.note || "there's a backlog"}. ` +
          `Wait is about ${gate.waitMinutes} min. ` +
          `If you're in a rush, **${best.id}** is only ${best.waitMinutes} min. Serves Sections ${best.sections.join(", ")}.`
        );
      }
      return (
        `${gate.id} is **open** with a ${gate.waitMinutes}-min wait. ` +
        `Crowd level is ${gate.crowdLevel}. Serves Sections ${gate.sections.join(", ")}.` +
        (gate.note ? ` Note: ${gate.note}` : "")
      );
    }

    // general best gate recommendation
    return (
      `Right now your quickest way in is **${best.id}** — only about ${best.waitMinutes} min wait, ` +
      `${best.crowdLevel} crowd, serving Sections ${best.sections.join(", ")}. ` +
      (byWait[1] ? `**${byWait[1].id}** is also good at ${byWait[1].waitMinutes} min.` : "")
    );
  }

  // ── RESTROOM / TOILET questions ──────────────────────────────────────────
  if (/\b(restroom|bathroom|toilet|washroom|loo|wc|wash room)\b/.test(q)) {
    const open = data.amenities.restrooms.filter((r) => r.status === "open");
    const byQueue = [...open].sort((a, b) => (a.queueMinutes || 99) - (b.queueMinutes || 99));
    const best = byQueue[0];
    const second = byQueue[1];
    const maintenance = data.amenities.restrooms.filter((r) => r.status === "maintenance");
    const maintNote =
      maintenance.length > 0
        ? ` (${maintenance.map((r) => r.id).join(", ")} ${maintenance.length === 1 ? "is" : "are"} currently closed for cleaning)`
        : "";
    return (
      `The quickest restroom right now is **${best.id}** near Section ${best.nearSection} — ` +
      `only ~${best.queueMinutes} min queue, about ${best.occupancyPct}% full. ` +
      (second ? `**${second.id}** (near Section ${second.nearSection}) is also available with a ${second.queueMinutes}-min wait. ` : "") +
      maintNote
    );
  }

  // ── FOOD / DRINK questions ───────────────────────────────────────────────
  if (/\b(food|eat|hungry|snack|drink|beer|burger|taco|pizza|vegan|halal|stall|concession|grill|fries)\b/.test(q)) {
    const open = data.amenities.foodStalls.filter((s) => s.status === "open");
    const byQueue = [...open].sort((a, b) => a.queueMinutes - b.queueMinutes);
    const quickest = byQueue[0];

    // vegan specific
    if (/\b(vegan|plant.based|vegetarian)\b/.test(q)) {
      const vegan = open.find((s) => /vegan/i.test(s.id));
      if (vegan) {
        return `For plant-based options, head to **${vegan.id}** near Section ${vegan.nearSection}. Today's popular item: ${vegan.popularItem}. Queue is only about ${vegan.queueMinutes} min — great choice!`;
      }
    }

    // pizza specific
    if (/pizza/.test(q)) {
      const pizza = open.find((s) => /pizza/i.test(s.id));
      if (pizza) return `**${pizza.id}** near Section ${pizza.nearSection} — ${pizza.popularItem} is the crowd favourite. About ${pizza.queueMinutes}-min wait right now.`;
    }

    // taco specific
    if (/taco/.test(q)) {
      const taco = open.find((s) => /taco/i.test(s.id));
      if (taco) return `**${taco.id}** near Section ${taco.nearSection} — grab the ${taco.popularItem}! Queue is ~${taco.queueMinutes} min.`;
    }

    const topThree = byQueue.slice(0, 3);
    return (
      `Here are the shortest queues right now:\n` +
      topThree.map((s) => `• **${s.id}** (Section ${s.nearSection}) — ${s.popularItem}, ~${s.queueMinutes} min`).join("\n") +
      `\n\nI'd suggest **${quickest.id}** if you want to get back to the action fast!`
    );
  }

  // ── MEDICAL / FIRST AID ──────────────────────────────────────────────────
  if (/\b(medical|first aid|doctor|nurse|injured|hurt|sick|unwell|dizzy|faint)\b/.test(q)) {
    const staffed = data.amenities.medical.filter((m) => m.status === "staffed");
    if (staffed.length === 0) return "I can't find a staffed first aid post right now — please find the nearest staff member immediately.";
    const posts = staffed.map((m) => `**${m.id}** (near Section ${m.nearSection})`).join(" and ");
    return `Our First Aid stations are ${posts}, both fully staffed. For anything serious please head there straight away or flag any steward in a yellow vest.`;
  }

  // ── PARKING ─────────────────────────────────────────────────────────────
  if (/\b(park|parking|lot|car park|vehicle)\b/.test(q)) {
    const lots = data.amenities.parking;
    const available = lots.filter((l) => l.status === "open" && l.occupancyPct < 95);
    const bySpace = [...available].sort((a, b) => a.occupancyPct - b.occupancyPct);
    if (bySpace.length === 0) return "All parking lots are showing as full right now. You may need to use street parking or a nearby garage.";
    const best = bySpace[0];
    const report = lots.map((l) => `**${l.id}**: ${l.occupancyPct}% full`).join(", ");
    return `Current parking: ${report}. **${best.id}** has the most space. For accessible parking, Lot C has a dedicated section and it's only ${lots.find((l) => /accessible/i.test(l.id))?.occupancyPct ?? "?"}% full.`;
  }

  // ── ACCESSIBILITY ────────────────────────────────────────────────────────
  if (/\b(wheelchair|accessible|accessibility|elevator|lift|ramp|hearing|disability|disabled|sensory)\b/.test(q)) {
    const acc = data.amenities.accessibility;

    if (/\b(hearing|deaf|loop|listen)\b/.test(q)) {
      return `Assisted listening devices are available at **${acc.hearingAssistance.location}** — just bring a valid ID. Status: ${acc.hearingAssistance.status}.`;
    }
    if (/\b(sensory|quiet.room|sensory.room)\b/.test(q)) {
      return `The sensory room is located at **${acc.sensoryRoom.location}** and is currently ${acc.sensoryRoom.status}. A great spot if you need a break from the noise.`;
    }
    if (/\b(priority|fast.?track|priority.entry)\b/.test(q)) {
      return `Priority entry is available at **${acc.priorityEntry.location}** — currently ${acc.priorityEntry.status}. Just show your accessibility credential to the steward there.`;
    }

    const elevators = acc.elevators.join(", ");
    const routes = acc.wheelchairRoutes.join("; ");
    const seats = acc.wheelchairSeating.join(", ");
    return (
      `We've got full accessibility support here! ` +
      `**Wheelchair seating**: ${seats}. ` +
      `**Elevators**: ${elevators}. ` +
      `**Ramp routes**: ${routes}. ` +
      `**Priority entry**: ${acc.priorityEntry.location} (${acc.priorityEntry.status}). ` +
      `Need anything specific? Just ask!`
    );
  }

  // ── MATCH / SCORE questions ──────────────────────────────────────────────
  if (/\b(score|match|game|team|kickoff|kick off|argentina|brazil|result|winning|live)\b/.test(q)) {
    const m = data.match;
    return (
      `We're live! **${m.homeTeam} vs ${m.awayTeam}** — kickoff was at ${m.kickoffDisplay}. ` +
      `Attendance: ${m.attendance.toLocaleString("en-US")} fans in here with you. ` +
      `Weather is a lovely ${m.weatherC}°C. Match status: **${m.status}**. Enjoy the game! ⚽`
    );
  }

  // ── WAIT TIME / HOW LONG ─────────────────────────────────────────────────
  if (/\b(wait|queue|how long|busy|crowded|crowd)\b/.test(q)) {
    const open = data.gates.filter((g) => g.status === "open");
    const byWait = [...open].sort((a, b) => (a.waitMinutes || 99) - (b.waitMinutes || 99));
    const food = [...data.amenities.foodStalls].sort((a, b) => a.queueMinutes - b.queueMinutes);
    return (
      `Here's a quick snapshot: ` +
      `Gate waits: ${byWait.map((g) => `${g.id} ${g.waitMinutes} min`).join(", ")}. ` +
      `Food queues: ${food.slice(0, 3).map((s) => `${s.id} ${s.queueMinutes} min`).join(", ")}. ` +
      `Overall crowd is **${pickOverallCrowdLevel(data.gates)}** right now.`
    );
  }

  // ── LOST & FOUND ─────────────────────────────────────────────────────────
  if (/\b(lost|found|lost.and.found|missing.item|belongings|left.behind)\b/.test(q)) {
    return (
      `For lost items, head to **Guest Services at Section 120** — they're running Lost & Found today. ` +
      `There are currently ${data.dashboard.lostAndFound} items logged. If you've lost a child, please alert the nearest steward immediately.`
    );
  }

  // ── SECTION / SEAT questions ─────────────────────────────────────────────
  if (/\b(section|seat|row|block|stand|find my seat|where is section)\b/.test(q)) {
    const match = q.match(/section\s*(\d+)/i);
    if (match) {
      const sec = parseInt(match[1], 10);
      const gate = data.gates.find((g) => {
        const [lo, hi] = g.sections[0].split("-").map(Number);
        return sec >= lo && sec <= hi;
      });
      if (gate) {
        const status = gate.status === "open" ? `open with a ${gate.waitMinutes}-min wait` : gate.status;
        return `Section ${sec} is served by **${gate.id}** — currently ${status}. Follow the signs from the main concourse or ask any steward!`;
      }
    }
    return `Tell me your section number and I'll point you to the right gate! Sections 101–115 → Gate A, 116–130 → Gate B, 131–145 → Gate C, 146–160 → Gate D, 161–175 → Gate E.`;
  }

  // ── WEATHER ──────────────────────────────────────────────────────────────
  if (/\b(weather|temperature|cold|hot|rain|raining|umbrella)\b/.test(q)) {
    return `It's **${data.match.weatherC}°C** outside — pretty comfortable match-day weather! No rain expected. Enjoy the atmosphere ☀️`;
  }

  // ── THANKS ───────────────────────────────────────────────────────────────
  if (/\b(thank|thanks|cheers|great|perfect|awesome|brilliant|helpful)\b/.test(q)) {
    return `Happy to help! Enjoy the match — it's going to be a great one! ⚽ Let me know if you need anything else.`;
  }

  // ── HELP / WHAT CAN YOU DO ───────────────────────────────────────────────
  if (/\b(help|what can you|what do you|capabilities|menu|options)\b/.test(q)) {
    return (
      `I'm Concourse AI — here's what I can help with today:\n` +
      `• **Gates** — wait times, open/closed status, best entry\n` +
      `• **Food & drinks** — queue times, popular items, vegan options\n` +
      `• **Restrooms** — shortest queues, nearest locations\n` +
      `• **Parking** — lot availability and accessible parking\n` +
      `• **Accessibility** — wheelchair routes, elevators, hearing assistance\n` +
      `• **Medical** — first aid station locations\n` +
      `• **Match info** — teams, kickoff, attendance\n\n` +
      `Just ask naturally — I'm here all match! 🏟️`
    );
  }

  // ── FALLBACK ─────────────────────────────────────────────────────────────
  const fallbacks = [
    `Hmm, I'm not sure about that one — I'm best at gates, food, restrooms, parking, and accessibility. Want help with any of those?`,
    `That's a bit outside my area! I'm your stadium concourse guide — try asking me about wait times, food queues, or how to get to your seat.`,
    `I'm focused on making your match-day experience smooth! Ask me about gates, food, restrooms, medical stations, or anything else stadium-related.`,
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

function pickOverallCrowdLevel(gates) {
  const weights = { low: 0, medium: 1, high: 2 };
  const avg = gates.reduce((sum, g) => sum + weights[g.crowdLevel], 0) / gates.length;
  if (avg < 0.66) return "low";
  if (avg < 1.33) return "medium";
  return "high";
}

app.post("/api/chat", (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const stadiumData = loadStadiumData();
    const reply = humanReply(stadiumData, message.trim());
    // small simulated "thinking" delay so the typing indicator feels real
    setTimeout(() => res.json({ reply }), 400 + Math.random() * 600);
  } catch (err) {
    console.error("chat endpoint error:", err);
    res.status(500).json({ error: "Something went wrong processing your request." });
  }
});

// catches malformed JSON bodies (e.g. Content-Type: application/json with
// broken JSON) before they hit express.json()'s default error page - without
// this, a bad request body came back as an HTML error page instead of JSON,
// which made the frontend's res.json() call throw and log a confusing
// "network error" for what was actually a 400
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    console.error("received malformed JSON body:", err.message);
    return res.status(400).json({ error: "Request body was not valid JSON" });
  }
  console.error("unhandled server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Concourse is up on http://localhost:${PORT}`);
});
