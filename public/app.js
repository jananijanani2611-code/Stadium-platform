// --- element refs ---
const tickerTrack = document.getElementById("tickerTrack");

const matchTeams = document.getElementById("matchTeams");
const matchSummary = document.getElementById("matchSummary");

const statOpenGates = document.getElementById("statOpenGates");
const statAvgQueue = document.getElementById("statAvgQueue");
const statCrowdDensity = document.getElementById("statCrowdDensity");
const statMedicalAlerts = document.getElementById("statMedicalAlerts");

const gateBoard = document.getElementById("gateBoard");
const densityFill = document.getElementById("densityFill");
const densityMarker = document.getElementById("densityMarker");
const densityLabel = document.getElementById("densityLabel");
const opsDashboard = document.getElementById("opsDashboard");

const stadiumMap = document.getElementById("stadiumMap");
const recommendationList = document.getElementById("recommendationList");
const sectionInput = document.getElementById("sectionInput");
const matchdayDetails = document.getElementById("matchdayDetails");
const weatherCard = document.getElementById("weatherCard");

const notifBell = document.getElementById("notifBell");
const notifBadge = document.getElementById("notifBadge");
const notifPanel = document.getElementById("notifPanel");
const notifList = document.getElementById("notifList");

const languageSelect = document.getElementById("languageSelect");
const contrastToggle = document.getElementById("contrastToggle");
const audioToggle = document.getElementById("audioToggle");

const emergencyBtn = document.getElementById("emergencyBtn");
const emergencyModal = document.getElementById("emergencyModal");
const emergencyStepIssue = document.getElementById("emergencyStepIssue");
const emergencyStepLocation = document.getElementById("emergencyStepLocation");
const emergencyCancelBtn = document.getElementById("emergencyCancelBtn");
const emergencyBackBtn = document.getElementById("emergencyBackBtn");
const emergencyLocationDetail = document.getElementById("emergencyLocationDetail");
const emergencyLocationInput = document.getElementById("emergencyLocationInput");
const emergencyLocationSubmit = document.getElementById("emergencyLocationSubmit");

const quickActions = document.getElementById("quickActions");
const suggestionChips = document.getElementById("suggestionChips");
const chatLog = document.getElementById("chatLog");
const typingIndicator = document.getElementById("typingIndicator");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");

// roughly where each gate/amenity sits on the schematic map - hand-picked
// percentages, just enough to look like a stadium bowl with a pitch in the middle
const MAP_POSITIONS = {
  "Gate A": { top: "10%", left: "22%" },
  "Gate B": { top: "10%", left: "70%" },
  "Gate C": { top: "50%", left: "94%" },
  "Gate D": { top: "88%", left: "70%" },
  "Gate E": { top: "88%", left: "22%" },
  foodCourt: { top: "32%", left: "38%", label: "🍔 Food" },
  restroom: { top: "32%", left: "62%", label: "🚻 Restroom" },
  medical: { top: "68%", left: "38%", label: "🏥 Medical" },
  accessibility: { top: "68%", left: "62%", label: "♿ Lift" },
  parking: { top: "50%", left: "5%", label: "🚗 Parking" },
};

let latestData = null; // last thing we got back from /api/stadium, other functions read from this

// ==================== loading + rendering ====================
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
  renderHeaderMatch(data.match);
  renderStats(data);
  renderGates(data.gates);
  renderDensity(data.gates);
  renderOpsDashboard(data);
  renderMap(data.gates);
  renderRecommendations(data);
  renderMatchday(data);
  renderWeather(data.match);
  renderNotifications(data.notifications);
}

function renderTicker(items) {
  tickerTrack.innerHTML = "";
  const looped = [...items, ...items]; // dupe so the CSS scroll loop doesn't show a visible seam
  for (const item of looped) {
    const span = document.createElement("span");
    span.textContent = `● ${item}`;
    tickerTrack.appendChild(span);
  }
}

function renderHeaderMatch(match) {
  matchTeams.textContent = `${match.homeTeam} 🇦🇷 vs 🇧🇷 ${match.awayTeam}`;
  matchSummary.textContent = `${match.kickoffDisplay} • ${match.attendance.toLocaleString("en-US")} Fans • ${match.weatherC}°C • ${match.weatherCondition}`;
}

function renderStats(data) {
  const openGates = data.gates.filter((g) => g.status === "open").length;
  const waitTimes = data.gates.map((g) => g.waitMinutes).filter((n) => n !== null);
  const avgQueue = waitTimes.length ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) : 0;
  const overallCrowd = pickOverallCrowdLevel(data.gates);

  statOpenGates.textContent = `${openGates}`;
  statAvgQueue.textContent = `${avgQueue} min`;
  statCrowdDensity.textContent = capitalize(overallCrowd);
  statMedicalAlerts.textContent = `${data.medicalAlerts.length}`;
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

// ==================== gate wait times ====================
function renderGates(gates) {
  gateBoard.innerHTML = "";
  const best = bestOpenGate(gates);

  gates.forEach((gate) => {
    const row = document.createElement("div");
    row.className = `gate-row ${gate.status}${best && gate.id === best.id ? " best" : ""}`;
    const waitLabel = gate.waitMinutes !== null ? `${gate.waitMinutes}<small> min</small>` : "—";
    row.innerHTML = `
      <div class="gate-left">
        <span class="status-dot ${gate.crowdLevel}"></span>
        <div>
          <span class="gate-id">${gate.id}${best && gate.id === best.id ? '<span class="best-tag">FASTEST</span>' : ""}</span>
          <span class="gate-crowd">${gate.status === "closed" ? "Closed" : `${capitalize(gate.crowdLevel)} crowd`}</span>
        </div>
      </div>
      <span class="gate-wait">${waitLabel}</span>
    `;
    gateBoard.appendChild(row);
  });
}

function bestOpenGate(gates) {
  const open = gates.filter((g) => g.status === "open" && g.waitMinutes !== null);
  if (!open.length) return null;
  return open.reduce((a, b) => (a.waitMinutes <= b.waitMinutes ? a : b));
}

// ==================== crowd density scale ====================
function renderDensity(gates) {
  const level = pickOverallCrowdLevel(gates);
  const pct = { low: 15, medium: 50, high: 85 }[level];
  densityMarker.style.left = `${pct}%`;
  densityFill.style.width = `${pct}%`;
  const dotColor = { low: "🟢", medium: "🟡", high: "🔴" }[level];
  densityLabel.textContent = `${dotColor} ${capitalize(level)}`;
}

// ==================== operations dashboard ====================
function renderOpsDashboard(data) {
  const d = data.dashboard;
  const rows = [
    { label: "Crowd Management", pct: d.crowdManagementPct },
    { label: "Gate Operations", pct: d.gateOperationsPct },
    { label: "Medical Services", pct: d.medicalServicesPct },
    { label: "Cleaning", pct: d.cleaningPct },
    { label: "Lost & Found", pct: d.lostAndFoundPct },
    { label: "Security", pct: d.securityPct },
  ];

  opsDashboard.innerHTML = rows
    .map((r) => {
      const tone = r.pct < 50 ? "critical" : r.pct < 75 ? "warn" : "";
      return `
        <div class="ops-row">
          <div class="ops-top"><span class="ops-label">${r.label}</span><span class="ops-value">${r.pct}%</span></div>
          <div class="ops-bar-track"><div class="ops-bar-fill ${tone}" style="width:${r.pct}%"></div></div>
        </div>
      `;
    })
    .join("");
}

// ==================== stadium map ====================
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
// action) points somewhere - keyword-driven highlight, not real NLP-to-map linking
function highlightMapLocation(key) {
  const marker = stadiumMap.querySelector(`[data-key="${key}"]`);
  if (!marker) return;
  marker.classList.remove("active");
  void marker.offsetWidth; // force reflow so the class removal actually registers before re-adding
  marker.classList.add("active");
}

// ==================== recommendation engine ====================
// everything here is derived directly from the live stadium data - no
// invented names, locations, or numbers. "best" just means "lowest wait /
// lowest occupancy among open options", computed fresh on every render.
function bestOpenFood(foodStalls) {
  const open = foodStalls.filter((f) => f.status === "open");
  if (!open.length) return null;
  return open.reduce((a, b) => (a.queueMinutes <= b.queueMinutes ? a : b));
}

function bestOpenRestroom(restrooms) {
  const open = restrooms.filter((r) => r.status === "open");
  if (!open.length) return null;
  return open.reduce((a, b) => (a.occupancyPct <= b.occupancyPct ? a : b));
}

function bestOpenParking(parkingLots) {
  const open = parkingLots.filter((p) => p.status === "open");
  if (!open.length) return null;
  return open.reduce((a, b) => (a.occupancyPct <= b.occupancyPct ? a : b));
}

function renderRecommendations(data) {
  const gate = bestOpenGate(data.gates);
  const food = bestOpenFood(data.amenities.foodStalls);
  const restroom = bestOpenRestroom(data.amenities.restrooms);
  const parking = bestOpenParking(data.amenities.parking);

  const items = [];
  if (gate) {
    items.push({ label: "Best Entrance", name: gate.id, detail: `${gate.waitMinutes} min wait • ${capitalize(gate.crowdLevel)} crowd`, tag: "FASTEST" });
  }
  if (food) {
    items.push({ label: "Best Food", name: food.id, detail: `${food.queueMinutes} min queue`, tag: "RECOMMENDED" });
  }
  if (restroom) {
    items.push({ label: "Best Restroom", name: `Near Section ${restroom.nearSection}`, detail: `${restroom.occupancyPct}% occupancy`, tag: "RECOMMENDED" });
  }
  if (parking) {
    items.push({ label: "Best Parking", name: parking.id, detail: `${parking.occupancyPct}% full`, tag: "MOST SPACE" });
  }

  recommendationList.innerHTML = items
    .map(
      (i) => `
    <div class="recommendation-item">
      <div class="rec-label">${i.label}</div>
      <div class="rec-name">${i.name}</div>
      <div class="rec-detail">${i.detail}</div>
      <span class="rec-tag">${i.tag}</span>
    </div>
  `
    )
    .join("");
}

// ==================== matchday panel (section-aware) ====================
// parses a "101-115" style range into [101, 115]
function parseSectionRange(rangeStr) {
  const [start, end] = rangeStr.split("-").map((n) => parseInt(n, 10));
  return [start, end];
}

function gateForSection(sectionNum, gates) {
  return gates.find((g) => g.sections.some((r) => {
    const [start, end] = parseSectionRange(r);
    return sectionNum >= start && sectionNum <= end;
  }));
}

// finds the item (restroom/food stall) whose nearSection is numerically closest
function nearestBySection(sectionNum, items) {
  const withSection = items.filter((i) => i.nearSection && i.status !== "maintenance");
  if (!withSection.length) return null;
  return withSection.reduce((a, b) =>
    Math.abs(parseInt(a.nearSection, 10) - sectionNum) <= Math.abs(parseInt(b.nearSection, 10) - sectionNum) ? a : b
  );
}

function renderMatchday(data) {
  const sectionRaw = sectionInput.value.trim();
  const sectionNum = parseInt(sectionRaw.replace(/\D/g, ""), 10);
  const hasSection = !Number.isNaN(sectionNum);

  const entranceGate = (hasSection && gateForSection(sectionNum, data.gates)) || bestOpenGate(data.gates);
  const restroom = (hasSection && nearestBySection(sectionNum, data.amenities.restrooms)) || bestOpenRestroom(data.amenities.restrooms);
  const food = (hasSection && nearestBySection(sectionNum, data.amenities.foodStalls)) || bestOpenFood(data.amenities.foodStalls);

  const rows = [];
  rows.push(`
    <div class="matchday-row">
      <div class="md-label">Match</div>
      <div class="md-value">${data.match.homeTeam} vs ${data.match.awayTeam}</div>
      <div class="md-sub">${data.match.kickoffDisplay} • Today</div>
    </div>
  `);
  if (entranceGate) {
    rows.push(`
      <div class="matchday-row">
        <div class="md-label">Recommended Entrance</div>
        <div class="md-value">${entranceGate.id} • ${entranceGate.waitMinutes ?? "—"} min</div>
        <div class="md-sub">${hasSection ? "Closest to your section" : "Fastest open gate"}</div>
      </div>
    `);
  }
  if (restroom) {
    rows.push(`
      <div class="matchday-row">
        <div class="md-label">Nearest Restroom</div>
        <div class="md-value">Section ${restroom.nearSection}</div>
        <div class="md-sub">${restroom.occupancyPct}% occupancy</div>
      </div>
    `);
  }
  if (food) {
    rows.push(`
      <div class="matchday-row">
        <div class="md-label">Best Nearby Food</div>
        <div class="md-value">${food.id}</div>
        <div class="md-sub">${food.queueMinutes} min queue</div>
      </div>
    `);
  }

  matchdayDetails.innerHTML = rows.join("");
}

sectionInput.addEventListener("input", () => {
  if (latestData) renderMatchday(latestData);
});

// ==================== weather card ====================
function renderWeather(match) {
  weatherCard.innerHTML = `
    <div class="weather-headline">
      <span class="wtemp">${match.weatherC}°C</span>
      <span class="wcondition">${match.weatherCondition}</span>
    </div>
    <div class="weather-detail-row"><span>Wind</span><strong>${match.windKmh} km/h</strong></div>
    <div class="weather-detail-row"><span>Humidity</span><strong>${match.humidityPct}%</strong></div>
    <div class="weather-detail-row"><span>Precip</span><strong>${match.precipPct}%</strong></div>
  `;
}

// ==================== notifications ====================
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

document.addEventListener("click", (e) => {
  if (!notifPanel.hidden && !e.target.closest(".notif-wrap")) {
    notifPanel.hidden = true;
    notifBell.setAttribute("aria-expanded", "false");
  }
});

// ==================== header controls: language, contrast, audio ====================
let currentLanguage = "en";
languageSelect.addEventListener("change", () => {
  currentLanguage = languageSelect.value;
});

contrastToggle.addEventListener("click", () => {
  const isOn = document.body.classList.toggle("high-contrast");
  contrastToggle.setAttribute("aria-pressed", String(isOn));
});

let isAudioGuidance = false;
audioToggle.addEventListener("click", () => {
  isAudioGuidance = !isAudioGuidance;
  audioToggle.setAttribute("aria-pressed", String(isAudioGuidance));
  if (!isAudioGuidance && "speechSynthesis" in window) {
    window.speechSynthesis.cancel(); // stop mid-sentence if turned off while reading
  }
});

function speakIfEnabled(text) {
  if (!isAudioGuidance || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utterance);
}

// ==================== voice input ====================
// uses the browser's built-in SpeechRecognition - no external dependency.
// Firefox and some browsers don't support this, so the button just disables
// itself rather than throwing errors at the user.
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let isListening = false;

if (SpeechRecognitionAPI) {
  recognizer = new SpeechRecognitionAPI();
  recognizer.continuous = false;
  recognizer.interimResults = false;

  recognizer.addEventListener("result", (e) => {
    const transcript = e.results[0][0].transcript;
    chatInput.value = transcript;
    sendMessage(transcript);
  });
  recognizer.addEventListener("end", () => {
    isListening = false;
    micBtn.setAttribute("aria-pressed", "false");
  });
  recognizer.addEventListener("error", (e) => {
    console.error("speech recognition error:", e.error);
    isListening = false;
    micBtn.setAttribute("aria-pressed", "false");
  });

  micBtn.addEventListener("click", () => {
    if (isSending) return;
    if (isListening) {
      recognizer.stop();
      return;
    }
    isListening = true;
    micBtn.setAttribute("aria-pressed", "true");
    recognizer.lang = { en: "en-US", hi: "hi-IN", es: "es-ES", pt: "pt-BR", fr: "fr-FR" }[currentLanguage] || "en-US";
    recognizer.start();
  });
} else {
  // graceful fallback - no crash, just tell the user via the button itself
  micBtn.disabled = true;
  micBtn.title = "Voice input isn't supported in this browser";
}

// ==================== emergency mode (2-step: issue -> location) ====================
let isEmergencyOpen = false;
let pendingEmergencyLabel = null;

function openEmergencyModal() {
  if (isEmergencyOpen) return;
  isEmergencyOpen = true;
  showEmergencyStep("issue");
  emergencyModal.classList.add("is-open");
  emergencyModal.removeAttribute("aria-hidden");
  emergencyModal.inert = false;
  document.body.style.overflow = "hidden";
  const firstOption = emergencyStepIssue.querySelector(".emergency-option");
  if (firstOption) firstOption.focus();
}

function closeEmergencyModal() {
  if (!isEmergencyOpen) return;
  isEmergencyOpen = false;
  emergencyModal.classList.remove("is-open");
  // BUG FIX: aria-hidden="true" on a container whose descendants are still
  // focusable (no tabindex=-1) is an actual WCAG violation - a keyboard/
  // screen-reader user could tab into buttons the AT is told don't exist.
  // `inert` is the correct modern fix: it removes the whole subtree from
  // both the tab order and the accessibility tree in one step, so the
  // manual aria-hidden dance isn't needed at all.
  emergencyModal.inert = true;
  document.body.style.overflow = "";
  pendingEmergencyLabel = null;
  emergencyLocationDetail.hidden = true;
  emergencyLocationInput.value = "";
  chatInput.focus();
}

function showEmergencyStep(step) {
  emergencyStepIssue.hidden = step !== "issue";
  emergencyStepLocation.hidden = step !== "location";
}

emergencyBtn.addEventListener("click", openEmergencyModal);
emergencyCancelBtn.addEventListener("click", closeEmergencyModal);
emergencyBackBtn.addEventListener("click", () => {
  emergencyLocationDetail.hidden = true;
  showEmergencyStep("issue");
});
emergencyModal.addEventListener("click", (e) => {
  if (e.target === emergencyModal) closeEmergencyModal(); // click on the backdrop, not the card itself
});

const EMERGENCY_CONFIG = {
  medical: { label: "Medical Emergency", highlight: "medical" },
  fire: { label: "Fire", highlight: "medical" },
  "lost-child": { label: "Lost Child", highlight: "medical" },
  security: { label: "Security Issue", highlight: "medical" },
  accessibility: { label: "Accessibility Assistance", highlight: "accessibility" },
};

document.querySelectorAll("#emergencyStepIssue .emergency-option").forEach((btn) => {
  btn.addEventListener("click", () => {
    const config = EMERGENCY_CONFIG[btn.dataset.emergency];
    pendingEmergencyLabel = config.label;
    if (config.highlight) highlightMapLocation(config.highlight);
    showEmergencyStep("location");
  });
});

document.querySelectorAll("#emergencyLocationGrid .emergency-option").forEach((btn) => {
  btn.addEventListener("click", () => {
    const location = btn.dataset.location;
    if (location === "Section" || location === "Other") {
      emergencyLocationDetail.hidden = false;
      emergencyLocationInput.placeholder = location === "Section" ? "e.g. Section 130" : "Describe your location";
      emergencyLocationInput.focus();
      return;
    }
    submitEmergency(location);
  });
});

emergencyLocationSubmit.addEventListener("click", () => {
  const detail = emergencyLocationInput.value.trim();
  submitEmergency(detail || "Location not specified");
});

function submitEmergency(location) {
  if (isSending || !pendingEmergencyLabel) return;
  const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const message = `Emergency: ${pendingEmergencyLabel}\nLocation: ${location}\nTime: ${time}`;
  closeEmergencyModal();
  sendMessage(message);
}

// ==================== quick actions ====================
quickActions.querySelectorAll("button").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (isSending) return;
    sendMessage(btn.dataset.prompt);
  });
});

// ==================== contextual suggestion chips ====================
// a lightweight keyword heuristic on what the user just asked - not real
// intent classification, just enough to make the follow-up chips feel relevant
const CHIP_SETS = {
  food: [
    { label: "📍 Show Route", prompt: "Show me the route to that food stall" },
    { label: "🍕 More Food", prompt: "What other food options are there?" },
    { label: "⏱️ Shortest Queue", prompt: "Which food stall has the shortest queue?" },
  ],
  gate: [
    { label: "📍 Show Gate", prompt: "Show me that gate on the map" },
    { label: "🚪 Find Faster Gate", prompt: "Is there a faster gate right now?" },
    { label: "🗺️ Show Route", prompt: "What's the route to that gate?" },
  ],
  restroom: [
    { label: "📍 Show Route", prompt: "Show me the route to that restroom" },
    { label: "🚻 More Restrooms", prompt: "What other restrooms are nearby?" },
    { label: "ℹ️ Restroom Guide", prompt: "Are there any accessible restrooms?" },
  ],
  medical: [
    { label: "📍 Show Route", prompt: "Show me the route to the nearest medical point" },
    { label: "🚑 Nearest First Aid", prompt: "Where's the nearest first aid station?" },
  ],
  accessibility: [
    { label: "Start Accessible Route", prompt: "Start a step-free accessible route for me" },
    { label: "🔊 Audio Guidance", prompt: "Can you describe the accessible route out loud?" },
  ],
  parking: [
    { label: "📍 Show Route", prompt: "Show me the route to that parking lot" },
    { label: "🚗 More Parking", prompt: "What other parking options are there?" },
  ],
  default: [
    { label: "What about food?", prompt: "What about food?" },
    { label: "Show me Gate A", prompt: "Show me Gate A" },
    { label: "Accessible restroom", prompt: "I need an accessible restroom" },
    { label: "Where is first aid?", prompt: "Where is first aid?" },
  ],
};

function detectIntent(text) {
  const t = text.toLowerCase();
  if (/food|hungry|eat|pizza|tacos|snack/.test(t)) return "food";
  if (/gate|entrance|entry/.test(t)) return "gate";
  if (/restroom|bathroom|washroom|toilet/.test(t)) return "restroom";
  if (/medical|first aid|doctor|hurt|injur/.test(t)) return "medical";
  if (/wheelchair|accessib|step-free|hearing/.test(t)) return "accessibility";
  if (/park/.test(t)) return "parking";
  return "default";
}

function renderSuggestionChips(intent) {
  const chips = CHIP_SETS[intent] || CHIP_SETS.default;
  suggestionChips.innerHTML = "";
  chips.forEach((chip) => {
    const btn = document.createElement("button");
    btn.textContent = chip.label;
    btn.dataset.prompt = chip.prompt;
    btn.addEventListener("click", () => {
      if (isSending) return;
      sendMessage(chip.prompt);
    });
    suggestionChips.appendChild(btn);
  });
}

// ==================== chat ====================
let isSending = false; // single source of truth for "a request is in flight"

function timestamp() {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function appendMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `msg msg-${role}`;

  const avatar = document.createElement("span");
  avatar.className = `avatar avatar-${role === "user" ? "user" : "assistant"}`;
  avatar.textContent = role === "user" ? "U" : "C";

  const body = document.createElement("div");
  body.className = "msg-body";

  const label = document.createElement("span");
  label.className = "msg-label";
  label.textContent = role === "user" ? "You" : role === "error" ? "System" : "Concourse AI";

  const p = document.createElement("p");
  p.textContent = text;

  const time = document.createElement("span");
  time.className = "msg-timestamp";
  time.textContent = timestamp();

  body.append(label, p, time);
  wrapper.append(avatar, body);
  chatLog.appendChild(wrapper);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function setBusy(busy) {
  isSending = busy;
  chatInput.disabled = busy;
  sendBtn.disabled = busy;
  quickActions.querySelectorAll("button").forEach((btn) => { btn.disabled = busy; });
  suggestionChips.querySelectorAll("button").forEach((btn) => { btn.disabled = busy; });
  typingIndicator.hidden = !busy;
  if (busy) chatLog.scrollTop = chatLog.scrollHeight;
}

async function sendMessage(message) {
  if (!message || isSending) return;

  setBusy(true);
  appendMessage("user", message);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, language: currentLanguage }),
    });

    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      console.error("chat response was not valid JSON:", parseErr);
      appendMessage("error", "The server sent back something unexpected. Please try again.");
      return;
    }

    if (!res.ok) {
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
    speakIfEnabled(data.reply);
    renderSuggestionChips(detectIntent(message));
  } catch (networkErr) {
    console.error("network error calling /api/chat:", networkErr);
    appendMessage("error", "Network error — could not reach the assistant. Check your connection and try again.");
  } finally {
    setBusy(false);
    chatInput.focus();
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (isSending) return;
  const message = chatInput.value.trim();
  if (!message) return;
  chatInput.value = "";
  sendMessage(message);
});

// ==================== keyboard shortcuts ====================
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

// ==================== live updates ====================
// polling instead of websockets - simpler to reason about for a demo this
// size, and 10s is plenty to feel "live" without hammering the server
async function pollLiveUpdate() {
  try {
    const res = await fetch("/api/simulate-update", { method: "POST" });
    const data = await res.json();
    latestData = data;
    renderEverything(data);
  } catch (err) {
    console.error(err); // one missed tick isn't worth surfacing to the user
  }
}
setInterval(pollLiveUpdate, 10000);

loadStadium();
