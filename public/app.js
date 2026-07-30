// --- element refs, grabbed once up top so the render functions below don't
// have to keep re-querying the DOM ---
const tickerTrack = document.getElementById("tickerTrack");
const clockEl = document.getElementById("clock");

const matchTeams = document.getElementById("matchTeams");
const matchKickoff = document.getElementById("matchKickoff");
const matchAttendance = document.getElementById("matchAttendance");
const matchWeather = document.getElementById("matchWeather");
const matchStatus = document.getElementById("matchStatus");

const statOpenGates = document.getElementById("statOpenGates");
const statAvgQueue = document.getElementById("statAvgQueue");
const statCrowdDensity = document.getElementById("statCrowdDensity");
const statMedicalAlerts = document.getElementById("statMedicalAlerts");

const stadiumMap = document.getElementById("stadiumMap");
const heatmapList = document.getElementById("heatmapList");
const gateBoard = document.getElementById("gateBoard");
const opsDashboard = document.getElementById("opsDashboard");

const notifBell = document.getElementById("notifBell");
const notifBadge = document.getElementById("notifBadge");
const notifPanel = document.getElementById("notifPanel");
const notifList = document.getElementById("notifList");

const emergencyBtn = document.getElementById("emergencyBtn");
const emergencyModal = document.getElementById("emergencyModal");
const emergencyCancelBtn = document.getElementById("emergencyCancelBtn");

const quickActions = document.getElementById("quickActions");
const chatLog = document.getElementById("chatLog");
const typingIndicator = document.getElementById("typingIndicator");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

// roughly where each gate/amenity sits on the schematic map - hand-picked
// percentages, not tied to any real venue survey, just enough to look like
// a stadium bowl with a pitch in the middle
const MAP_POSITIONS = {
  "Gate A": { top: "10%", left: "22%" },
  "Gate B": { top: "10%", left: "70%" },
  "Gate C": { top: "50%", left: "94%" },
  "Gate D": { top: "88%", left: "70%" },
  "Gate E": { top: "88%", left: "22%" },
  foodCourt: { top: "32%", left: "38%", label: "🍔 Food Court" },
  restroom: { top: "32%", left: "62%", label: "🚻 Restroom" },
  medical: { top: "68%", left: "38%", label: "🚑 Medical" },
  accessibility: { top: "68%", left: "62%", label: "♿ Lift" },
  parking: { top: "50%", left: "5%", label: "🚗 Parking" },
};

let latestData = null; // last thing we got back from /api/stadium, other functions read from this

// ---------- clock ----------
function tickClock() {
  clockEl.textContent = new Date().toLocaleTimeString("en-US", { hour12: true });
}
tickClock();
setInterval(tickClock, 1000);

// ---------- loading + rendering ----------
async function loadStadium() {
  try {
    const res = await fetch("/api/stadium");
    const data = await res.json();
    latestData = data;
    renderEverything(data);
  } catch (err) {
    console.error("couldn't load stadium data:", err);
  }
}

function renderEverything(data) {
  renderTicker(data.liveTicker);
  renderMatchCard(data.match);
  renderStats(data);
  renderMap(data.gates);
  renderHeatmap(data.gates);
  renderGates(data.gates);
  renderOpsDashboard(data);
  renderNotifications(data.notifications);
}

function renderTicker(items) {
  tickerTrack.innerHTML = "";
  // duping the list so the CSS scroll loop doesn't show a visible seam
  const looped = [...items, ...items];
  for (const item of looped) {
    const span = document.createElement("span");
    span.textContent = `● ${item}`;
    tickerTrack.appendChild(span);
  }
}

function renderMatchCard(match) {
  matchTeams.textContent = `${match.homeTeam} vs ${match.awayTeam}`;
  matchKickoff.textContent = match.kickoffDisplay;
  matchAttendance.textContent = match.attendance.toLocaleString("en-US");
  matchWeather.textContent = `${match.weatherC}°C`;
  matchStatus.textContent = match.status === "LIVE" ? "LIVE ●" : match.status;
}

function renderStats(data) {
  const openGates = data.gates.filter((g) => g.status === "open").length;
  const waitTimes = data.gates.map((g) => g.waitMinutes).filter((n) => n !== null);
  const avgQueue = waitTimes.length ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) : 0;
  const overallCrowd = pickOverallCrowdLevel(data.gates);

  // little fade-flash so a changing number doesn't feel like it just teleported
  flashUpdate(statOpenGates, openGates);
  flashUpdate(statAvgQueue, `${avgQueue} min`);
  flashUpdate(statCrowdDensity, capitalize(overallCrowd));
  flashUpdate(statMedicalAlerts, data.medicalAlerts.length);
}

function flashUpdate(el, value) {
  el.style.opacity = 0;
  setTimeout(() => {
    el.textContent = value;
    el.style.opacity = 1;
  }, 120);
}

function pickOverallCrowdLevel(gates) {
  const weights = { low: 0, medium: 1, high: 2 };
  const avg = gates.reduce((sum, g) => sum + weights[g.crowdLevel], 0) / gates.length;
  if (avg < 0.66) return "low";
  if (avg < 1.33) return "medium";
  return "high";
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function renderMap(gates) {
  stadiumMap.querySelectorAll(".map-marker").forEach((el) => el.remove());

  gates.forEach((gate) => {
    const pos = MAP_POSITIONS[gate.id];
    if (!pos) return; // shouldn't happen, but don't blow up the whole map if data drifts
    const marker = document.createElement("div");
    marker.className = "map-marker gate";
    marker.dataset.key = gate.id;
    marker.textContent = gate.status === "closed" ? `${gate.id} ✕` : gate.id;
    marker.style.top = pos.top;
    marker.style.left = pos.left;
    stadiumMap.appendChild(marker);
  });

  ["foodCourt", "restroom", "medical", "accessibility", "parking"].forEach((key) => {
    const pos = MAP_POSITIONS[key];
    const marker = document.createElement("div");
    marker.className = "map-marker amenity";
    marker.dataset.key = key;
    marker.textContent = pos.label;
    marker.style.top = pos.top;
    marker.style.left = pos.left;
    stadiumMap.appendChild(marker);
  });
}

// briefly pulses a marker so the map visibly reacts when the AI (or a quick
// action) points somewhere - not a real "AI detected this" system, just a
// keyword-driven highlight, good enough for a demo
function highlightMapLocation(key) {
  const marker = stadiumMap.querySelector(`[data-key="${key}"]`);
  if (!marker) return;
  marker.classList.remove("active"); // restart animation if it's already mid-pulse
  void marker.offsetWidth; // force reflow so the class removal actually registers
  marker.classList.add("active");
}

function renderHeatmap(gates) {
  heatmapList.innerHTML = "";
  gates.forEach((gate) => {
    const row = document.createElement("div");
    row.className = "heatmap-row";
    row.innerHTML = `
      <span class="dot ${gate.crowdLevel}"></span>
      <span>${gate.id}</span>
      <span class="bar-track"><span class="bar-fill ${gate.crowdLevel}"></span></span>
    `;
    heatmapList.appendChild(row);
  });
}

function renderGates(gates) {
  gateBoard.innerHTML = "";
  gates.forEach((gate) => {
    const row = document.createElement("div");
    row.className = `gate-row ${gate.status}`;
    const waitLabel = gate.waitMinutes !== null ? `${gate.waitMinutes} min wait` : "—";
    row.innerHTML = `
      <span class="gate-id"><span class="dot ${gate.crowdLevel}"></span> ${gate.id} <small>(${gate.sections.join(", ")})</small></span>
      <span class="gate-status">${gate.status.toUpperCase()} · ${waitLabel}</span>
    `;
    gateBoard.appendChild(row);
  });
}

function renderOpsDashboard(data) {
  const openGates = data.gates.filter((g) => g.status === "open").length;
  const overallCrowd = pickOverallCrowdLevel(data.gates);
  const crowdPct = { low: 35, medium: 65, high: 92 }[overallCrowd];

  const rows = [
    { label: "Current Crowd", value: capitalize(overallCrowd), pct: crowdPct, tone: crowdPct > 80 ? "critical" : crowdPct > 55 ? "warn" : "" },
    { label: "Open Gates", value: `${openGates} / ${data.gates.length}`, pct: (openGates / data.gates.length) * 100, tone: "" },
    { label: "Medical Incidents", value: data.medicalAlerts.length, pct: Math.min(100, data.medicalAlerts.length * 30), tone: data.medicalAlerts.length > 2 ? "warn" : "" },
    { label: "Cleaning Requests", value: data.dashboard.cleaningRequests, pct: Math.min(100, data.dashboard.cleaningRequests * 25), tone: "" },
    { label: "Lost & Found", value: data.dashboard.lostAndFound, pct: Math.min(100, data.dashboard.lostAndFound * 20), tone: "" },
    { label: "Security Alerts", value: data.dashboard.securityAlerts, pct: Math.min(100, data.dashboard.securityAlerts * 40), tone: data.dashboard.securityAlerts > 0 ? "warn" : "" },
  ];

  opsDashboard.innerHTML = rows
    .map(
      (r) => `
    <div class="ops-row">
      <div class="ops-top"><span class="ops-label">${r.label}</span><span class="ops-value">${r.value}</span></div>
      <div class="ops-bar-track"><div class="ops-bar-fill ${r.tone}" style="width:${r.pct}%"></div></div>
    </div>
  `
    )
    .join("");
}

// ---------- notifications ----------
function renderNotifications(notifications) {
  const unread = notifications.filter((n) => !n.read).length;
  notifBadge.hidden = unread === 0;
  notifBadge.textContent = unread;

  notifList.innerHTML = "";
  if (notifications.length === 0) {
    notifList.innerHTML = `<p class="notif-empty">Nothing new right now.</p>`;
    return;
  }

  notifications.forEach((n) => {
    const item = document.createElement("div");
    item.className = `notif-item ${n.read ? "" : "unread"}`;
    item.innerHTML = `${n.message}<span class="notif-time">${n.time}</span>`;
    item.addEventListener("click", () => markNotificationRead(n.id));
    notifList.appendChild(item);
  });
}

async function markNotificationRead(id) {
  try {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    const note = latestData.notifications.find((n) => n.id === id);
    if (note) note.read = true;
    renderNotifications(latestData.notifications);
  } catch (err) {
    console.error("couldn't mark notification read:", err);
  }
}

notifBell.addEventListener("click", () => {
  const isOpen = !notifPanel.hidden;
  notifPanel.hidden = isOpen;
  notifBell.setAttribute("aria-expanded", String(!isOpen));
});

// close the notif panel if you click anywhere else on the page
document.addEventListener("click", (e) => {
  if (!notifPanel.hidden && !e.target.closest(".notif-wrap")) {
    notifPanel.hidden = true;
    notifBell.setAttribute("aria-expanded", "false");
  }
});

// ---------- emergency mode ----------
// BUG FIX: previously this just flipped the `hidden` attribute, which (see
// the CSS fix above) had no visual effect at all - the modal never actually
// closed. Now it's a small explicit state machine so open/close always
// agree with what's on screen, background scroll gets locked/restored,
// and focus moves somewhere sensible on every close path.
let isEmergencyOpen = false;

function openEmergencyModal() {
  if (isEmergencyOpen) return; // guard: don't re-open (and re-lock scroll) if it's already open
  isEmergencyOpen = true;
  emergencyModal.classList.add("is-open");
  emergencyModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden"; // lock background scroll while the modal is up
  const firstOption = emergencyModal.querySelector(".emergency-option");
  if (firstOption) firstOption.focus();
}

function closeEmergencyModal() {
  if (!isEmergencyOpen) return;
  isEmergencyOpen = false;
  emergencyModal.classList.remove("is-open");
  emergencyModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = ""; // restore scrolling
  chatInput.focus();
}

emergencyBtn.addEventListener("click", openEmergencyModal);
emergencyCancelBtn.addEventListener("click", closeEmergencyModal);
emergencyModal.addEventListener("click", (e) => {
  if (e.target === emergencyModal) closeEmergencyModal(); // click on the backdrop, not the card itself
});

const EMERGENCY_CONFIG = {
  fire: { label: "Fire", highlight: "medical" },
  medical: { label: "Medical Emergency", highlight: "medical" },
  "lost-child": { label: "Lost Child", highlight: "medical" },
  security: { label: "Security Incident", highlight: "medical" },
};

// builds the "Emergency: X / Location: Y / Time: Z" prompt the assistant expects.
// there's no real GPS/beacon feed in this demo, so location falls back to the
// most relevant thing we do know (an active medical alert location) or a
// sensible default - this is called out as mock data in the README.
function buildEmergencyPrompt(label) {
  const location = latestData?.medicalAlerts?.[0]?.location || "Main Concourse";
  const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `Emergency: ${label}\nLocation: ${location}\nTime: ${time}`;
}

document.querySelectorAll(".emergency-option").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (isSending) return; // don't stack an emergency request on top of one already in flight
    const config = EMERGENCY_CONFIG[btn.dataset.emergency];
    closeEmergencyModal();
    if (config.highlight) highlightMapLocation(config.highlight);
    sendMessage(buildEmergencyPrompt(config.label));
  });
});

// ---------- quick actions ----------
quickActions.querySelectorAll("button").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (isSending) return; // belt-and-suspenders on top of the disabled attribute during a request
    sendMessage(btn.dataset.prompt);
  });
});

// ---------- chat ----------
let isSending = false; // single source of truth for "a request is in flight" - guards against duplicate/overlapping sends

function timestamp() {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Converts the bot's lightweight markdown (bold, newlines, bullets) to safe HTML.
// Only used for assistant messages — user/error messages stay as plain text.
function formatBotText(text) {
  return text
    .replace(/&/g, "&amp;")          // escape HTML entities first
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")  // **bold**
    .replace(/\n/g, "<br>");          // line breaks
}

function appendMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `msg msg-${role}`;

  const avatar = document.createElement("span");
  avatar.className = `avatar avatar-${role === "user" ? "user" : "assistant"}`;
  // 🏟️ for the bot, a person silhouette initial for the user
  avatar.textContent = role === "user" ? "You" : "🏟️";

  const body = document.createElement("div");
  body.className = "msg-body";

  const label = document.createElement("span");
  label.className = "msg-label";
  label.textContent = role === "user" ? "You" : role === "error" ? "System" : "Concourse AI";

  const p = document.createElement("p");
  if (role === "assistant") {
    p.innerHTML = formatBotText(text); // render markdown for bot messages
  } else {
    p.textContent = text; // plain text for user + error messages
  }

  const time = document.createElement("span");
  time.className = "msg-timestamp";
  time.textContent = timestamp();

  body.append(label, p, time);
  wrapper.append(avatar, body);
  chatLog.appendChild(wrapper);
  chatLog.scrollTop = chatLog.scrollHeight; // snap to bottom on new message
}

// toggles every control that could trigger another request while one is
// already pending - previously only the text input was disabled, so the
// Send button and quick-action buttons could still be clicked mid-request
function setBusy(busy) {
  isSending = busy;
  chatInput.disabled = busy;
  sendBtn.disabled = busy;
  quickActions.querySelectorAll("button").forEach((btn) => {
    btn.disabled = busy;
  });
  typingIndicator.hidden = !busy;
  if (busy) chatLog.scrollTop = chatLog.scrollHeight; // make sure "thinking" is visible if the log is long
}

async function sendMessage(message) {
  if (!message || isSending) return; // guards duplicate sends: Enter/click spam, overlapping quick actions, etc.

  setBusy(true);
  appendMessage("user", message);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    // the backend always replies with JSON (including on errors), but guard
    // this parse anyway in case something upstream (a proxy, a crash before
    // Express's handler even ran) returns something else entirely
    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      console.error("chat response was not valid JSON:", parseErr);
      appendMessage("error", "The server sent back something unexpected. Please try again.");
      return;
    }

    if (!res.ok) {
      // BUG FIX: previously the actual server error (data.error) was thrown
      // away and every failure showed the same hardcoded string, which is
      // exactly what made this look like a mystery bug. Now the real reason
      // (missing API key, rate limit, bad request, etc) is both logged and
      // shown, so "something went wrong" only appears when we truly don't
      // know more than that.
      console.error(`POST /api/chat failed with ${res.status}:`, data.error || data);
      appendMessage("error", data.error || "Sorry, something went wrong. Please try again.");
      return;
    }

    if (!data.reply) {
      console.error("chat response was ok but had no reply field:", data);
      appendMessage("error", "Sorry, I didn't get a proper response. Please try again.");
      return;
    }

    appendMessage("assistant", data.reply);
  } catch (networkErr) {
    // fetch() itself threw - this is a real network failure (offline, DNS,
    // CORS, server not running), distinct from the server responding with
    // an error status above
    console.error("network error calling /api/chat:", networkErr);
    appendMessage("error", "Network error — could not reach the assistant. Check your connection and try again.");
  } finally {
    setBusy(false);
    chatInput.focus();
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (isSending) return; // extra guard on top of the disabled Send button, covers Enter-key submits
  const message = chatInput.value.trim();
  if (!message) return;
  chatInput.value = "";
  sendMessage(message);
});

// ---------- keyboard shortcuts ----------
// "/" jumps to the chat box (unless you're already typing somewhere),
// Escape backs out of whatever overlay is open
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== chatInput) {
    e.preventDefault();
    chatInput.focus();
  }
  if (e.key === "Escape") {
    closeEmergencyModal();
    if (!notifPanel.hidden) {
      notifPanel.hidden = true;
      notifBell.setAttribute("aria-expanded", "false");
    }
  }
});

// ---------- live updates ----------
// polling instead of websockets - simpler to reason about for a demo this
// size, and 10s is plenty to feel "live" without hammering the server
async function pollLiveUpdate() {
  try {
    const res = await fetch("/api/simulate-update", { method: "POST" });
    const data = await res.json();
    latestData = data;
    renderEverything(data);
  } catch (err) {
    // one missed tick isn't worth surfacing to the user, board just skips a beat
    console.error(err);
  }
}
setInterval(pollLiveUpdate, 10000);

loadStadium();
