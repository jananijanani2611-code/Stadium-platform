# Concourse AI — Stadium Operations Platform

**PromptWars Virtual · Challenge 4: Smart Stadiums & Tournament Operations**

Concourse AI is a GenAI-powered assistant and operations dashboard for a FIFA World Cup 2026 matchday at MetLife Stadium. It started as a chat-only fan assistant and has since grown into something closer to what a stadium ops team would actually look at on a screen: a live match card, gate/crowd status, a schematic stadium map, an operations dashboard, notifications, and an emergency mode — all wrapped around the same GenAI chat core.

## Chosen vertical

**Fan Navigation & Experience Assistant.** Rather than trying to cover every stadium operations persona, this build focuses deeply on the matchday fan: someone standing in the concourse, phone in hand, who needs a fast, accurate answer instead of squinting at a static signage map.

## Approach & logic

Stadium conditions change constantly on matchday — a gate backs up, a restroom closes for cleaning, a food stall gets swamped at halftime. A static wayfinding map or FAQ page can't keep up. Concourse solves this by pairing:

1. A **live stadium data feed** (gates, restrooms, food stalls, medical points, accessibility resources) that updates in real time, and
2. A **GenAI layer** that reads that live data as context and answers the fan's question conversationally — reasoning over current conditions rather than reciting fixed facts.

This means the assistant can say things like "Restroom RR-3 near your section is closed for cleaning, but RR-4 near Section 150 is open with only a 5-minute wait" — a response that requires combining several live facts, not a canned lookup.

## What's on screen

- **Match info card** — teams, kickoff, attendance, weather, live status
- **Stats cards** — open gates, average queue, overall crowd density, active medical alerts, all computed live from the underlying data rather than hardcoded
- **Stadium map** — a schematic layout of gates and amenities; markers pulse when a quick action or emergency option points somewhere specific
- **Crowd heatmap** — green/amber/red bars per gate, refreshed on the same live cycle as everything else
- **Gate status board** — carried over from v1, now with a crowd-level dot alongside status
- **Operations dashboard** — current crowd, open gates, medical incidents, cleaning requests, lost & found, and security alerts, each with a small progress bar
- **Notifications** — a bell icon with an unread count; clicking a notification marks it read via the backend
- **Emergency mode** — a dedicated red button opens a modal (fire, medical, lost child, security incident); picking one sends a priority prompt straight to the assistant
- **Quick actions** — one-tap buttons above the chat input for the most common asks (gate, restroom, food, medical, accessibility, parking)
- **Chat** — avatars, timestamps, a "Concourse AI is thinking…" typing indicator, and auto-scroll

Everything above the chat window reads from the same `/api/stadium` payload and refreshes automatically every 10 seconds (in addition to a manual "simulate update" style refresh built into that same polling loop) — so the dashboard, map, heatmap, and ticker all move together instead of drifting out of sync.

## How it works

```
Frontend polls /api/stadium on load, then /api/simulate-update every 10s
        │
        ▼
 Dashboard, map, heatmap, gate board, notifications all re-render
        │
Fan types a question or taps a quick action / emergency option
        │
        ▼
 POST /api/chat ──▶ Express backend
                          │
                          ▼
              current stadium data (data/stadium.json)
                          │
                          ▼
              Anthropic API (Claude)
              system prompt = live data + assistant role
                          │
                          ▼
              Natural-language reply ──▶ rendered as a chat bubble
```

- **Frontend** (`public/`): the stadium-ops interface — match card, stats cards, schematic map, heatmap, gate board, ops dashboard, notifications panel, emergency modal, quick actions, and chat, all built as plain HTML/CSS/JS components sharing one `latestData` object in `app.js` rather than a framework.
- **Backend** (`server.js`): serves the static frontend and exposes:
  - `GET /api/stadium` — current full stadium state
  - `POST /api/simulate-update` — nudges gate waits, crowd levels, food/restroom occupancy, and medical alerts to mimic a live feed, and pushes any resulting changes into `liveTicker` and `notifications`
  - `POST /api/notifications/:id/read` — marks a single notification as read
  - `POST /api/chat` — proxies a fan's question to Claude with the live dataset injected as context
- **Data** (`data/stadium.json`): a structured mock dataset covering match info, gates (with crowd level), restrooms, food stalls, medical points, parking, accessibility resources, medical alerts, ops dashboard counts, and notifications for one stadium on one matchday.

## Running locally

```bash
npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm start
# visit http://localhost:3000
```

## Design & code quality pass

Feedback on an earlier build was fair: the UI read as one flat plane of identical bordered boxes, and the chat felt like documentation rather than a messaging app. Addressed directly:

- **Real visual hierarchy.** Introduced three explicit background levels (`--bg-base`, `--bg-panel`, `--bg-elevated`) instead of every card sharing one `--card-bg`. The match card and chat panel are now genuinely "elevated" (gradient/shadow, bigger type); the map, heatmap, gate board, and ops dashboard stay quieter and flatter so they don't compete for attention.
- **Stadium map had a placeholder look.** Added running-track texture, yard-line pitch markings, and a center circle; markers are now pill badges with a status dot instead of plain bordered text tags.
- **Chat bubbles look more like an actual chat app** — more rounding, subtle shadow, slightly heavier avatar treatment.
- **Panel titles no longer all render in the same green** — they're neutral now, so color is reserved for things that are actually live/status-related (per the amber-for-warning, red-for-alert, green-for-success rule already in place).
- **Replaced the bullet-list welcome message** with plainer, more conversational copy.
- **Removed dead code**: an unused `.skeleton` CSS block that was written speculatively but never actually applied anywhere in `app.js`.

No layout, routes, or DOM structure changed — this was strictly visual depth/typography/copy plus one dead-code removal.

## Bugfix pass (post-launch)

A round of debugging fixed several issues that only showed up once the app was actually being used:

- **Emergency modal wouldn't close.** Root cause: `.modal-overlay` set `display: flex` unconditionally in CSS, which overrides the browser's default `[hidden] { display: none }` regardless of specificity (author styles beat the user-agent stylesheet at equal specificity). Toggling `hidden` from JS was doing nothing visually. Same latent bug was also silently affecting the typing indicator and the notification badge. Fixed with a global `[hidden] { display: none !important; }` rule, and the modal was moved to a class-based (`.is-open`) opacity transition so it can also fade smoothly.
- **Chat errors were too generic to debug.** The server was swallowing the real reason for failures (most commonly a missing/invalid `ANTHROPIC_API_KEY`) and returning one hardcoded message for every case. The server now checks for the API key up front, distinguishes network failures from API error responses from malformed responses, and returns a specific `error` field for each. The frontend now logs and displays that real message instead of one canned string, and a JSON-parsing error middleware was added so a malformed request body returns clean JSON instead of an HTML error page.
- **Send button and quick actions weren't disabled while waiting on a reply.** Only the text input was disabled before, so rapid clicks could fire overlapping requests. There's now a single `isSending` flag that disables the input, Send button, and all quick-action buttons together, and guards `sendMessage()` itself against being called while a request is already in flight.
- **Emergency prompts didn't match the required format.** They previously sent free-text questions instead of a structured `Emergency: X / Location: Y / Time: Z` message.
- **No background scroll lock on the modal**, and Escape didn't restore it. Both now go through the same `closeEmergencyModal()` function so every close path (Cancel, overlay click, Escape, or picking an emergency type) behaves identically.

## Testing

```bash
npm test
```

Covers data integrity: valid JSON, valid gate statuses, closed gates report no wait time, all amenity categories present, every gate has a crowd level the heatmap can render, match info has what the match card needs, dashboard counts are numbers, and notifications carry the fields the panel expects.

## A note on the stack

This build is intentionally plain HTML/CSS/JS on the frontend and Express on the backend — no React, no build step. That's a deliberate choice for a project this size on a hackathon timeline: it keeps the repo tiny, makes every line easy to review, and means "clone it and run `npm start`" just works with no bundler config. The component boundaries (map, heatmap, dashboard, notifications, chat) are still kept separate in `app.js` so it wouldn't be a large lift to port to React later if this ever needed to grow past a single stadium/single match demo.

## Security notes

- The Anthropic API key is read from an environment variable and never exposed to the frontend or committed to the repo (`.env` is gitignored).
- The `/api/chat` endpoint validates that a message string is present before calling the model.
- The system prompt constrains the assistant to stadium-related topics using only the supplied live data, reducing the chance of off-topic or fabricated responses.

## Accessibility notes

- Semantic HTML (`role="log"`, `aria-live="polite"` on the chat log; `role="status"` on the ticker) so screen readers announce new messages and live updates.
- Visible keyboard focus states on all interactive controls.
- `prefers-reduced-motion` is respected — the ticker animation is disabled for users who request reduced motion.
- Live stadium data includes a dedicated accessibility resource list (wheelchair seating, elevators, sensory room) that the assistant can surface directly.

## Assumptions

- Stadium data (gate wait times, queue lengths, statuses) is **simulated for demo purposes** — in a real deployment this would be fed by turnstile counters, IoT sensors, or stadium ops staff input.
- One stadium, one match, is modeled as a representative example; the same architecture would extend to multiple concurrent venues.
- The "simulate live update" button stands in for a real-time data pipeline (e.g., a websocket feed or polling job) that would push live updates in production.
- Assumes Node.js 18+ and a valid Anthropic API key are available in the deployment environment.
