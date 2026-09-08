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

// supported languages for the chat responses - keys match what the
// frontend's language selector sends, values are what we tell Claude to
// actually respond in
const SUPPORTED_LANGUAGES = {
  en: "English",
  hi: "Hindi",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
};

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
app.post("/api/simulate-update", (req, res) => {
  try {
    const data = loadStadiumData();
    const tickerAdditions = [];

    // nudge one gate's wait time and occasionally its crowd level
    const gate = pick(data.gates);
    if (gate.waitMinutes !== null) {
      const before = gate.waitMinutes;
      const jitter = Math.floor(Math.random() * 7) - 3; // -3 to +3
      gate.waitMinutes = Math.max(1, gate.waitMinutes + jitter);
      if (gate.waitMinutes !== before) {
        tickerAdditions.push(`${gate.id} wait time updated to ${gate.waitMinutes} min`);
      }
    }
    if (Math.random() > 0.6) {
      gate.crowdLevel = pick(CROWD_LEVELS);
    }

    // nudge one food stall's queue
    const stall = pick(data.amenities.foodStalls);
    const stallBefore = stall.queueMinutes;
    stall.queueMinutes = Math.max(1, stall.queueMinutes + (Math.floor(Math.random() * 5) - 2));
    if (Math.random() > 0.7 && stall.queueMinutes !== stallBefore) {
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

    if (tickerAdditions.length) {
      data.liveTicker = [...tickerAdditions, ...data.liveTicker].slice(0, 6);
    }

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

app.post("/api/chat", async (req, res) => {
  const { message, language } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set - check your .env file");
    return res.status(500).json({ error: "Server is missing its AI provider API key. Set ANTHROPIC_API_KEY in the environment." });
  }

  // language is optional and defaults to English - anything we don't
  // recognize just falls back rather than erroring the whole request
  const languageName = SUPPORTED_LANGUAGES[language] || SUPPORTED_LANGUAGES.en;

  try {
    const stadiumData = loadStadiumData();

    // rewritten as a concierge persona rather than a data-lookup tool - the
    // instructions below specifically forbid the "based on the dataset"
    // phrasing that made the old version feel like it was reading from a
    // database out loud
    const systemPrompt = `You are "Concourse AI", a warm and helpful human-sounding concierge at ${stadiumData.stadiumName} during ${stadiumData.event}.
Today's match: ${stadiumData.match.homeTeam} vs ${stadiumData.match.awayTeam}, kickoff ${stadiumData.match.kickoffDisplay}, attendance ${stadiumData.match.attendance}, weather ${stadiumData.match.weatherC}°C (${stadiumData.match.weatherCondition}), status ${stadiumData.match.status}.

PERSONALITY
Talk like a friendly, knowledgeable staff member who genuinely wants to help a fan have a great day - not like a system reading from a database. Be warm, brief, and conversational.
NEVER say things like "based on the dataset", "according to the JSON", "the available stadium data indicates", "that's outside my area", or anything that reveals you're reading from a file or database. If you don't know something, say so naturally, like a staff member would ("I don't have that on hand, but here's what I can help with instead...").

UNDERSTANDING WHAT FANS MEAN
Fans won't always use exact terms. Recognize the intent behind casual phrasing:
- Gate questions: "where's my gate", "how do I get in", "take me to Gate A", "I need Gate A" all mean gate/entrance help.
- Food questions: "I'm hungry", "where can I eat", "any pizza nearby" all mean food help.
- Restroom questions: "restroom", "bathroom", "washroom", "toilet" are all the same request.
- Medical questions: "I need help", "doctor", "first aid", "medical" all mean medical help.
- Accessibility questions: "wheelchair route", "step-free", "accessible seating" all mean accessibility help.
- Parking questions: "where's parking", "where did I park" mean parking help.
If a fan gives you a section number (e.g. "I'm at Section 130"), use it to recommend the closest gate, restroom, or amenity based on the section ranges in the data below.

RECOMMENDATIONS
Don't just list raw numbers - tell the fan what you'd actually recommend and why, the way a helpful local would. When there's a clearly best option among several (fastest gate, shortest food queue, lowest-occupancy restroom, least full parking lot), say so directly and call it out as the best current option.

CROWD PREDICTIONS
You may make a simple, clearly-labeled estimate about how a queue might trend in the next 10-15 minutes based on the current numbers (e.g. a gate whose wait is already high and climbing). Always label this explicitly as "estimated" or "a prediction" - never state a future wait time as if it were a current fact.

DATA HONESTY - this is important
Only use information from the STADIUM DATA below. Never invent gate names, restaurant names, wait times, medical locations, parking lots, routes, or crowd levels. If something isn't in the data, say so naturally and offer the closest useful alternative instead of making something up.

EMERGENCIES
If a fan describes a real emergency (fire, medical emergency, lost child, security incident), respond calmly and immediately, tell them to alert the nearest staff member or medical point right away, and point them to the closest relevant location from the data below. This is a simulated demo, not a real dispatch system - don't claim to have contacted emergency services.

LANGUAGE
Respond in ${languageName}, regardless of what language the fan writes in, unless they explicitly ask you to switch.

If the question has nothing to do with the stadium experience, gently and warmly bring the conversation back to how you can help with their matchday.

STADIUM DATA:
${JSON.stringify(stadiumData, null, 2)}`;

    let anthropicRes;
    try {
      anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 400,
          system: systemPrompt,
          messages: [{ role: "user", content: message }],
        }),
      });
    } catch (networkErr) {
      console.error("network error calling Anthropic API:", networkErr);
      return res.status(502).json({ error: "Could not reach the AI service. Please try again in a moment." });
    }

    if (!anthropicRes.ok) {
      let errDetail = "";
      try {
        errDetail = await anthropicRes.text();
      } catch {
        errDetail = "(could not read error body)";
      }
      console.error(`Anthropic API returned ${anthropicRes.status}:`, errDetail);

      if (anthropicRes.status === 401) {
        return res.status(500).json({ error: "AI service rejected the API key. Check ANTHROPIC_API_KEY." });
      }
      if (anthropicRes.status === 429) {
        return res.status(429).json({ error: "The AI service is rate-limited right now. Please try again shortly." });
      }
      return res.status(502).json({ error: "The AI service returned an error. Please try again." });
    }

    let result;
    try {
      result = await anthropicRes.json();
    } catch (parseErr) {
      console.error("Anthropic response wasn't valid JSON:", parseErr);
      return res.status(502).json({ error: "Received an unreadable response from the AI service." });
    }

    const textBlock = Array.isArray(result.content) ? result.content.find((block) => block.type === "text") : null;

    if (!textBlock) {
      console.error("Anthropic response had no text block:", JSON.stringify(result));
      return res.status(502).json({ error: "The AI service didn't return a usable response." });
    }

    res.json({ reply: textBlock.text });
  } catch (err) {
    console.error("chat endpoint blew up:", err);
    res.status(500).json({ error: "Something went wrong processing your request" });
  }
});

// catches malformed JSON bodies before they hit express.json()'s default
// error page - without this, a bad request body came back as an HTML error
// page instead of JSON
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
