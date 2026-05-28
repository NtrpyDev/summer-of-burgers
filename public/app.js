const VIEW_PATHS = {
  gallery: "/",
  duel: "/duel",
  fan: "/fan_burgers",
  leaderboard: "/leaderboard"
};

const PATH_VIEWS = Object.fromEntries(
  Object.entries(VIEW_PATHS).map(([view, path]) => [path, view])
);

const state = {
  burgers: [],
  fanBurgers: [],
  view: "gallery",
  voterId: getVoterId(),
  limits: {
    official: { allowed: true },
    fan: { allowed: true }
  },
  fanUpload: { allowed: true },
  duel: [],
  fanDuel: [],
  duelSubmitting: false,
  fanDuelSubmitting: false,
  fanSubmitting: false
};

const els = {
  tabs: document.querySelectorAll(".tab"),
  viewLinks: document.querySelectorAll("[data-view-link]"),
  views: document.querySelectorAll(".view"),
  heroBackdrop: document.querySelector("#heroBackdrop"),
  statBurgerCount: document.querySelector("#statBurgerCount"),
  statFanCount: document.querySelector("#statFanCount"),
  search: document.querySelector("#searchInput"),
  dailyStatus: document.querySelector("#dailyStatus"),
  gallery: document.querySelector("#galleryGrid"),
  galleryCount: document.querySelector("#galleryCount"),
  duelArena: document.querySelector("#duelArena"),
  duelNotice: document.querySelector("#duelNotice"),
  duelMessage: document.querySelector("#duelMessage"),
  newDuel: document.querySelector("#newDuelButton"),
  fanForm: document.querySelector("#fanForm"),
  fanSubmitMessage: document.querySelector("#fanSubmitMessage"),
  fanSubmitButton: document.querySelector("#fanSubmitButton"),
  fanImageInput: document.querySelector("#fanImageInput"),
  fanImageName: document.querySelector("#fanImageName"),
  fanGrid: document.querySelector("#fanGrid"),
  fanDuelArena: document.querySelector("#fanDuelArena"),
  fanDuelMessage: document.querySelector("#fanDuelMessage"),
  newFanDuel: document.querySelector("#newFanDuelButton"),
  leaderboard: document.querySelector("#leaderboardList"),
  fanLeaderboard: document.querySelector("#fanLeaderboardList"),
  dialog: document.querySelector("#burgerDialog"),
  details: document.querySelector("#burgerDetails"),
  voteDialog: document.querySelector("#voteDialog"),
  voteDetails: document.querySelector("#voteDetails")
};

els.tabs.forEach((tab) => {
  tab.addEventListener("click", (event) => {
    event.preventDefault();
    setView(tab.dataset.view);
  });
});

els.viewLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    setView(link.dataset.viewLink);
  });
});

window.addEventListener("popstate", () => {
  setView(viewFromPath(window.location.pathname), { skipHistory: true });
});

els.search.addEventListener("input", renderGallery);
els.newDuel.addEventListener("click", startDuel);
els.newFanDuel.addEventListener("click", startFanDuel);
els.fanForm.addEventListener("submit", submitFanBurger);
els.fanImageInput.addEventListener("change", updateFanImageName);
document.querySelector(".dialog-close").addEventListener("click", () => els.dialog.close());
document.querySelector(".vote-dialog-close").addEventListener("click", () => els.voteDialog.close());

await Promise.all([loadBurgers(), loadFanBurgers(), refreshLimits(), refreshFanUploadStatus()]);
renderAll();
setView(viewFromPath(window.location.pathname), { replace: true, skipHistory: true });

async function loadBurgers() {
  try {
    state.burgers = normalizeBurgers(await requestJson("/api/burgers"));
  } catch {
    const response = await fetch("/data/burgers.json");
    state.burgers = normalizeBurgers(await response.json());
  }
}

async function loadFanBurgers() {
  try {
    state.fanBurgers = normalizeFanBurgers(await requestJson("/api/fan-burgers"));
  } catch {
    const response = await fetch("/data/fan-burgers.json");
    state.fanBurgers = normalizeFanBurgers(await response.json());
  }
}

async function refreshLimits() {
  await Promise.all(["official", "fan"].map(async (type) => {
    try {
      const result = await requestJson(`/api/vote/status?type=${encodeURIComponent(type)}&voterId=${encodeURIComponent(state.voterId)}`);
      state.limits[type] = { ...result, allowed: result.allowed && localVoteAllowed(type) };
    } catch {
      state.limits[type] = { allowed: localVoteAllowed(type), localOnly: true };
    }
  }));
}

async function refreshFanUploadStatus() {
  try {
    const result = await requestJson(`/api/fan-burgers/status?voterId=${encodeURIComponent(state.voterId)}`);
    state.fanUpload = { ...result, allowed: result.allowed && localFanUploadAllowed() };
  } catch {
    state.fanUpload = { allowed: localFanUploadAllowed(), localOnly: true };
  }
  updateFanSubmitUi();
}

function fanUploadAllowed() {
  return Boolean(state.fanUpload?.allowed);
}

function localFanUploadAllowed() {
  return localStorage.getItem("sob_v3_fan_submit_day") !== todayKey();
}

function markFanUploadUsed() {
  localStorage.setItem("sob_v3_fan_submit_day", todayKey());
}

function updateFanSubmitUi() {
  const allowed = fanUploadAllowed();
  if (els.fanSubmitButton) els.fanSubmitButton.disabled = !allowed;
  if (!allowed && state.view === "fan") {
    setMessage(els.fanSubmitMessage, "You already submitted a fan burger today. Come back tomorrow.");
  }
}

function normalizeBurgers(rows) {
  return rows.map((burger) => ({
    ...burger,
    tags: Array.isArray(burger.tags) ? burger.tags : safeJson(burger.tags, []),
    elo: Number(burger.elo || 1500),
    wins: Number(burger.wins || 0),
    losses: Number(burger.losses || 0),
  }));
}

function normalizeFanBurgers(rows) {
  return rows.map((burger) => ({
    ...burger,
    title: burger.title || "Fan burger",
    caption: burger.caption || "",
    elo: Number(burger.elo || 1500),
    wins: Number(burger.wins || 0),
    losses: Number(burger.losses || 0)
  }));
}

function renderAll() {
  renderStats();
  renderDailyStatus();
  renderGallery();
  startDuel();
  renderFanLane();
  startFanDuel();
  renderLeaderboard();
}

function renderStats() {
  els.statBurgerCount.textContent = state.burgers.length;
  els.statFanCount.textContent = state.fanBurgers.length;
  const latest = [...state.burgers].sort((a, b) => dateValue(b) - dateValue(a))[0];
  if (latest) {
    els.heroBackdrop.style.setProperty("--hero-image", `url("${imageFor(latest)}")`);
  }
}

function renderDailyStatus() {
  const items = [
    ["official", "Big Cat vote"],
    ["fan", "Fan vote"]
  ];
  els.dailyStatus.innerHTML = items.map(([type, label]) => {
    const allowed = voteAllowed(type);
    return `<span class="status-chip ${allowed ? "is-open" : "is-locked"}">${escapeHtml(label)} ${allowed ? "open" : "used"}</span>`;
  }).join("");
}

function viewFromPath(pathname) {
  const path = String(pathname || "/").replace(/\/+$/, "") || "/";
  return PATH_VIEWS[path] || "gallery";
}

function setView(view, options = {}) {
  const { replace = false, skipHistory = false } = options;
  const nextView = VIEW_PATHS[view] ? view : "gallery";
  state.view = nextView;
  els.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === nextView));
  els.views.forEach((section) => section.classList.toggle("is-active", section.id === `${nextView}View`));

  if (!skipHistory) {
    const path = VIEW_PATHS[nextView];
    const current = window.location.pathname.replace(/\/+$/, "") || "/";
    if (current !== path) {
      const method = replace ? "replaceState" : "pushState";
      history[method]({ view: nextView }, "", path);
    }
  }

  document.title = nextView === "gallery"
    ? "Summer of Burgers"
    : `${pageTitleFor(nextView)} | Summer of Burgers`;

  if (nextView === "duel") startDuel();
  if (nextView === "fan") {
    renderFanLane();
    startFanDuel();
    updateFanSubmitUi();
  }
  if (nextView === "leaderboard") renderLeaderboard();
}

function pageTitleFor(view) {
  return ({
    duel: "Burger Duel",
    fan: "Fan Burgers",
    leaderboard: "Leaderboards"
  })[view] || "Gallery";
}

function filteredBurgers() {
  const query = els.search.value.trim().toLowerCase();
  return state.burgers
    .filter((burger) => {
      const haystack = [
        burger.tweet_id,
        burger.caption,
        burger.posted_at
      ].join(" ").toLowerCase();
      return !query || haystack.includes(query);
    })
    .sort((a, b) => dateValue(b) - dateValue(a) || Number(a.media_index || 0) - Number(b.media_index || 0));
}

function renderGallery() {
  const rows = filteredBurgers();
  els.galleryCount.textContent = `${rows.length} burger${rows.length === 1 ? "" : "s"}`;
  if (!rows.length) {
    els.gallery.innerHTML = `<div class="empty-state">Run the collector and the roll fills from the newest burger down.</div>`;
    return;
  }

  els.gallery.innerHTML = rows.map((burger, index) => officialCardHtml(burger, index)).join("");
  bindCards(els.gallery, "official");
}

function officialCardHtml(burger, index) {
  return `
    <article class="burger-card ${index === 0 ? "feature-card" : ""}" data-burger-id="${escapeAttr(burger.id)}" tabindex="0">
      <img src="${escapeAttr(imageFor(burger, "thumb"))}" alt="${escapeAttr(altFor(burger))}" loading="${index < 2 ? "eager" : "lazy"}">
      <div class="burger-card-body">
        <span class="card-index">${String(index + 1).padStart(2, "0")}</span>
        <h3>${escapeHtml(shortCaption(burger))}</h3>
        <div class="tag-row">
          <span class="pill">${escapeHtml(dateLabel(burger))}</span>
          <span class="pill">${Math.round(burger.elo)} Elo</span>
        </div>
      </div>
    </article>
  `;
}

function bindCards(container, type) {
  container.querySelectorAll("[data-burger-id]").forEach((card) => {
    const open = () => showDetails(card.dataset.burgerId, type);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  });
}

function startDuel() {
  clearMessage(els.duelMessage);
  clearDuelNotice();
  if (state.burgers.length < 2) {
    els.duelArena.innerHTML = `<div class="empty-state">Two Big Cat burgers unlock the duel.</div>`;
    return;
  }
  state.duel = sample(state.burgers, 2);
  renderDuel();
}

function renderDuel() {
  const [left, right] = state.duel;
  const locked = !voteAllowed("official");
  els.duelArena.innerHTML = `
    ${matchCard(left, "left", "duel", locked)}
    <div class="versus">VS</div>
    ${matchCard(right, "right", "duel", locked)}
  `;
  els.duelArena.querySelectorAll("[data-duel-pick]").forEach((button) => {
    button.addEventListener("click", () => voteDuel(button.dataset.duelPick));
  });
  if (locked) {
    setDuelNotice("Today's official Big Cat vote is already used.");
    clearMessage(els.duelMessage);
  } else {
    clearDuelNotice();
  }
}

function matchCard(burger, side, mode, locked = false) {
  return `
    <article class="match-card">
      <img src="${escapeAttr(imageFor(burger))}" alt="${escapeAttr(altFor(burger))}">
      <div class="match-card-body">
        <span class="pill">${escapeHtml(dateLabel(burger))}</span>
        <h3>${escapeHtml(shortCaption(burger))}</h3>
        <button class="primary-button" type="button" data-${mode}-pick="${side}" ${locked ? "disabled" : ""}>Pick this burger</button>
      </div>
    </article>
  `;
}

async function voteDuel(side) {
  if (state.duelSubmitting || !voteAllowed("official")) return;
  state.duelSubmitting = true;
  setDuelButtons(true);
  clearMessage(els.duelMessage);

  const [left, right] = state.duel;
  const winner = side === "left" ? left : right;
  const loser = side === "left" ? right : left;

  try {
    const result = await postVote("/api/vote", winner.id, loser.id, "official");
    applyDuelResult(winner, loser, result);
    setMessage(els.duelMessage, "Ranked pick counted.");
    renderLeaderboard();
    renderGallery();
    showVoteCelebration(winner, "official");
    startDuel();
  } catch (error) {
    handleVoteError(error, "official", els.duelMessage);
    renderDuel();
  } finally {
    state.duelSubmitting = false;
    renderDailyStatus();
  }
}

function setDuelButtons(disabled) {
  els.duelArena.querySelectorAll("[data-duel-pick]").forEach((button) => {
    button.disabled = disabled;
  });
}

function applyDuelResult(winner, loser, result) {
  winner.elo = Number(result.winnerElo || winner.elo);
  loser.elo = Number(result.loserElo || loser.elo);
  winner.wins += 1;
  loser.losses += 1;
  markVoteUsed("official", result);
}

function renderFanLane() {
  renderFanGrid();
  renderFanLeaderboard();
  renderStats();
}

function renderFanGrid() {
  if (!state.fanBurgers.length) {
    els.fanGrid.innerHTML = `<div class="empty-state">Fan burgers land here after submission.</div>`;
    return;
  }
  const rows = [...state.fanBurgers].sort((a, b) => dateValue(b) - dateValue(a));
  els.fanGrid.innerHTML = rows.map((burger, index) => fanCardHtml(burger, index)).join("");
  bindCards(els.fanGrid, "fan");
}

function fanCardHtml(burger, index) {
  return `
    <article class="burger-card fan-card" data-burger-id="${escapeAttr(burger.id)}" tabindex="0">
      <img src="${escapeAttr(fanImageFor(burger, "thumb"))}" alt="${escapeAttr(fanAltFor(burger))}" loading="${index < 2 ? "eager" : "lazy"}">
      <div class="burger-card-body">
        <span class="card-index">F${String(index + 1).padStart(2, "0")}</span>
        <h3>${escapeHtml(burger.title)}</h3>
        <p>${escapeHtml(shortFanCaption(burger))}</p>
        <div class="tag-row">
          <span class="pill">${Math.round(burger.elo)} Elo</span>
          <span class="pill">${burger.wins}-${burger.losses}</span>
        </div>
      </div>
    </article>
  `;
}

async function submitFanBurger(event) {
  event.preventDefault();
  if (state.fanSubmitting || !fanUploadAllowed()) return;

  const file = els.fanImageInput.files?.[0];
  const fileError = validateFanImageFile(file);
  if (fileError) {
    setMessage(els.fanSubmitMessage, fileError);
    return;
  }

  state.fanSubmitting = true;
  clearMessage(els.fanSubmitMessage);
  const button = els.fanSubmitButton || els.fanForm.querySelector("button[type='submit']");
  button.disabled = true;

  try {
    const form = new FormData(els.fanForm);
    form.set("voterId", state.voterId);
    const burger = await requestJson("/api/fan-burgers", { method: "POST", body: form });
    state.fanBurgers.unshift(...normalizeFanBurgers([burger]));
    markFanUploadUsed();
    state.fanUpload = { allowed: false };
    els.fanForm.reset();
    updateFanImageName();
    setMessage(els.fanSubmitMessage, "Fan burger submitted.");
    renderFanLane();
    startFanDuel();
    updateFanSubmitUi();
  } catch (error) {
    setMessage(els.fanSubmitMessage, error?.body?.error || "Submission did not go through.");
    if (error?.status === 429) {
      markFanUploadUsed();
      state.fanUpload = { allowed: false };
      updateFanSubmitUi();
    }
  } finally {
    state.fanSubmitting = false;
    if (fanUploadAllowed()) button.disabled = false;
  }
}

function validateFanImageFile(file) {
  if (!file) return "Choose a JPG, PNG, or WebP image.";
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) return "Use a JPG, PNG, or WebP image.";
  if (file.size > 6 * 1024 * 1024) return "Image must be 6MB or smaller.";
  if (file.size < 4 * 1024) return "Image is too small.";
  return "";
}

function updateFanImageName() {
  const file = els.fanImageInput.files?.[0];
  els.fanImageName.textContent = file ? file.name : "No image selected";
  els.fanImageInput.closest(".file-field").classList.toggle("has-file", Boolean(file));
}

function startFanDuel() {
  clearMessage(els.fanDuelMessage);
  if (state.fanBurgers.length < 2) {
    els.fanDuelArena.innerHTML = `<div class="empty-state">Two fan burgers unlock the fan duel.</div>`;
    return;
  }
  state.fanDuel = sample(state.fanBurgers, 2);
  renderFanDuel();
}

function renderFanDuel() {
  const [left, right] = state.fanDuel;
  const locked = !voteAllowed("fan");
  els.fanDuelArena.innerHTML = `
    <div class="duel-arena compact-duel">
      ${fanMatchCard(left, "left", locked)}
      <div class="versus">VS</div>
      ${fanMatchCard(right, "right", locked)}
    </div>
  `;
  els.fanDuelArena.querySelectorAll("[data-fan-duel-pick]").forEach((button) => {
    button.addEventListener("click", () => voteFanDuel(button.dataset.fanDuelPick));
  });
  if (locked) setMessage(els.fanDuelMessage, "Today's fan vote is already used.");
}

function fanMatchCard(burger, side, locked) {
  return `
    <article class="match-card">
      <img src="${escapeAttr(fanImageFor(burger))}" alt="${escapeAttr(fanAltFor(burger))}">
      <div class="match-card-body">
        <span class="pill">${Math.round(burger.elo)} Elo</span>
        <h3>${escapeHtml(burger.title)}</h3>
        <button class="primary-button" type="button" data-fan-duel-pick="${side}" ${locked ? "disabled" : ""}>Pick this burger</button>
      </div>
    </article>
  `;
}

async function voteFanDuel(side) {
  if (state.fanDuelSubmitting || !voteAllowed("fan")) return;
  state.fanDuelSubmitting = true;
  els.fanDuelArena.querySelectorAll("[data-fan-duel-pick]").forEach((button) => {
    button.disabled = true;
  });
  clearMessage(els.fanDuelMessage);

  const [left, right] = state.fanDuel;
  const winner = side === "left" ? left : right;
  const loser = side === "left" ? right : left;

  try {
    const result = await postVote("/api/fan-vote", winner.id, loser.id, "fan");
    winner.elo = Number(result.winnerElo || winner.elo);
    loser.elo = Number(result.loserElo || loser.elo);
    winner.wins += 1;
    loser.losses += 1;
    markVoteUsed("fan", result);
    setMessage(els.fanDuelMessage, "Fan pick counted.");
    showVoteCelebration(winner, "fan");
    renderFanLane();
    startFanDuel();
  } catch (error) {
    handleVoteError(error, "fan", els.fanDuelMessage);
    renderFanDuel();
  } finally {
    state.fanDuelSubmitting = false;
    renderDailyStatus();
  }
}

async function postVote(endpoint, winnerId, loserId, type) {
  const result = await requestJson(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ winnerId, loserId, voterId: state.voterId })
  });
  markVoteUsed(type, result);
  return result;
}

function handleVoteError(error, type, target) {
  if (error?.status === 429) {
    markVoteUsed(type, error.body || {});
    setMessage(target, error.body?.error || "Today's ranked result is already used.");
    return;
  }
  setMessage(target, error?.body?.error || "Ranked voting needs the live API.");
}

function markVoteUsed(type, result = {}) {
  state.limits[type] = { ...state.limits[type], ...result, allowed: false };
  localStorage.setItem(`sob_v3_${type}_vote_day`, todayKey());
}

function voteAllowed(type) {
  return Boolean(state.limits[type]?.allowed) && localVoteAllowed(type);
}

function localVoteAllowed(type) {
  return localStorage.getItem(`sob_v3_${type}_vote_day`) !== todayKey();
}

function renderLeaderboard() {
  renderOfficialLeaderboard();
  renderFanLeaderboard();
}

function renderOfficialLeaderboard() {
  const rows = [...state.burgers].sort((a, b) => b.elo - a.elo || b.wins - a.wins);
  if (!rows.length) {
    els.leaderboard.innerHTML = `<div class="empty-state">The official table starts when burgers import.</div>`;
    return;
  }
  els.leaderboard.innerHTML = rows.map((burger, index) => leaderRowHtml(burger, index, "official")).join("");
}

function renderFanLeaderboard() {
  const rows = [...state.fanBurgers].sort((a, b) => b.elo - a.elo);
  if (!rows.length) {
    els.fanLeaderboard.innerHTML = `<div class="empty-state">The fan table starts after two submissions.</div>`;
    return;
  }
  els.fanLeaderboard.innerHTML = rows.map((burger, index) => leaderRowHtml(burger, index, "fan")).join("");
}

function leaderRowHtml(burger, index, type) {
  const image = type === "fan" ? fanImageFor(burger, "thumb") : imageFor(burger, "thumb");
  const title = type === "fan" ? burger.title : shortCaption(burger);
  const sub = type === "fan" ? shortFanCaption(burger) : dateLabel(burger);
  return `
    <article class="leader-row">
      <div class="rank">#${index + 1}</div>
      <img src="${escapeAttr(image)}" alt="${escapeAttr(type === "fan" ? fanAltFor(burger) : altFor(burger))}" loading="lazy">
      <div>
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(sub)}</p>
      </div>
      <div class="score">
        <span class="pill">${Math.round(burger.elo)} Elo</span>
        <span class="pill">${burger.wins}-${burger.losses}</span>
      </div>
    </article>
  `;
}

function showDetails(id, type) {
  const burger = type === "fan"
    ? state.fanBurgers.find((row) => row.id === id)
    : state.burgers.find((row) => row.id === id);
  if (!burger) return;

  if (type === "fan") {
    els.details.innerHTML = `
      <div class="details">
        <img src="${escapeAttr(fanImageFor(burger))}" alt="${escapeAttr(fanAltFor(burger))}">
        <div>
          <span class="pill">Fan burger</span>
          <h2 class="details-title">${escapeHtml(burger.title)}</h2>
          <p class="details-caption">${escapeHtml(burger.caption || "No caption submitted.")}</p>
          <div class="tag-row">
            <span class="pill">${Math.round(burger.elo)} Elo</span>
            <span class="pill">${burger.wins}-${burger.losses}</span>
          </div>
        </div>
      </div>
    `;
  } else {
    els.details.innerHTML = `
      <div class="details">
        <img src="${escapeAttr(imageFor(burger))}" alt="${escapeAttr(altFor(burger))}">
        <div>
          <span class="pill">${escapeHtml(dateLabel(burger))}</span>
          <p class="details-caption">${escapeHtml(burger.caption || "No caption captured yet.")}</p>
          <p class="muted">Tweet ${escapeHtml(burger.tweet_id || "")}</p>
          <p><a href="${escapeAttr(burger.source_url)}" target="_blank" rel="noreferrer">Open source post</a></p>
        </div>
      </div>
    `;
  }
  els.dialog.showModal();
}

function showVoteCelebration(burger, type) {
  const isFan = type === "fan";
  const title = isFan ? burger.title : shortCaption(burger);
  const image = isFan ? fanImageFor(burger) : imageFor(burger);
  const alt = isFan ? fanAltFor(burger) : altFor(burger);
  const lane = isFan ? "Fan Burger vote" : "Burger Duel vote";
  const shareUrl = shareOnXUrl(burger, type);

  els.voteDetails.innerHTML = `
    <div class="vote-confirmation">
      <div class="vote-confirmation-image">
        <img src="${escapeAttr(image)}" alt="${escapeAttr(alt)}">
      </div>
      <div class="vote-confirmation-copy">
        <p class="eyebrow">${escapeHtml(lane)}</p>
        <h2>Your vote has been cast for today.</h2>
        <p>Come back tomorrow and cast your vote again.</p>
        <div class="voted-for">
          <span>You backed</span>
          <strong>${escapeHtml(title)}</strong>
        </div>
        <div class="vote-actions">
          <a class="share-button" href="${escapeAttr(shareUrl)}" target="_blank" rel="noreferrer">Share your vote on X</a>
          <button class="secondary-button" type="button" data-close-vote>Back to burgers</button>
        </div>
      </div>
    </div>
  `;

  els.voteDetails.querySelector("[data-close-vote]").addEventListener("click", () => els.voteDialog.close());
  els.voteDialog.showModal();
}

function shareOnXUrl(burger, type) {
  const isFan = type === "fan";
  const title = cleanShareTitle(isFan ? burger.title : shortCaption(burger));
  const text = `I voted in #SummerOfBurgers. My pick: ${title}. Make yours:`;
  const url = new URL("https://x.com/intent/tweet");
  url.searchParams.set("text", text);
  const shareSite = publicShareUrl(type, burger.id);
  if (shareSite) url.searchParams.set("url", shareSite);
  return url.toString();
}

function cleanShareTitle(value) {
  return String(value || "Today's pick").replace(/#\S+/g, "").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
}

function publicShareUrl(type, id) {
  const configured = document.querySelector('meta[name="share-url"]')?.content?.trim();
  const sharePath = `/share/${encodeURIComponent(type === "fan" ? "fan" : "official")}/${encodeURIComponent(id)}`;
  if (configured) return `${configured.replace(/\/$/, "")}${sharePath}`;
  if (["localhost", "127.0.0.1", ""].includes(window.location.hostname)) return "";
  return `${window.location.origin}${sharePath}`;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed with ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function getVoterId() {
  const key = "sob_voter_id_v3";
  if (new URLSearchParams(window.location.search).get("resetVotes") === "1") {
    localStorage.removeItem("sob_v3_official_vote_day");
    localStorage.removeItem("sob_v3_fan_vote_day");
    localStorage.removeItem("sob_v3_fan_submit_day");
    localStorage.removeItem(key);
  }
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(key, value);
  }
  return value;
}

function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date()).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function imageFor(burger, size = "image") {
  if (size === "thumb") return burger.thumb_url || burger.thumbnailUrl || burger.image_url || burger.imageUrl || "/images/placeholder.svg";
  return burger.image_url || burger.imageUrl || burger.thumb_url || burger.thumbnailUrl || "/images/placeholder.svg";
}

function fanImageFor(burger, size = "image") {
  if (size === "thumb") return burger.thumb_url || burger.image_url || "/images/placeholder.svg";
  return burger.image_url || burger.thumb_url || "/images/placeholder.svg";
}

function altFor(burger) {
  return burger.caption ? `Burger from ${dateLabel(burger)}: ${burger.caption}` : `Burger from ${dateLabel(burger)}`;
}

function fanAltFor(burger) {
  return burger.title ? `Fan burger: ${burger.title}` : "Fan burger";
}

function dateLabel(burger) {
  if (!burger.posted_at && !burger.created_at) return "Date unknown";
  const date = new Date(burger.posted_at || burger.created_at);
  if (Number.isNaN(date.getTime())) return String(burger.posted_at || burger.created_at).slice(0, 10);
  return new Intl.DateTimeFormat("en", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function dateValue(burger) {
  return new Date(burger.posted_at || burger.created_at || 0).getTime() || 0;
}

function shortCaption(burger) {
  const caption = (burger.caption || "Untitled burger").replace(/\s+/g, " ").trim();
  return caption.length > 96 ? `${caption.slice(0, 93)}...` : caption;
}

function shortFanCaption(burger) {
  const caption = (burger.caption || "Fan submission").replace(/\s+/g, " ").trim();
  return caption.length > 96 ? `${caption.slice(0, 93)}...` : caption;
}

function sample(rows, count) {
  const shuffled = [...rows];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled.slice(0, count);
}

function setMessage(element, value) {
  element.textContent = value;
  element.classList.toggle("has-message", Boolean(value));
}

function clearMessage(element) {
  setMessage(element, "");
}

function setDuelNotice(value) {
  if (!els.duelNotice) return;
  els.duelNotice.textContent = value;
  els.duelNotice.hidden = !value;
}

function clearDuelNotice() {
  setDuelNotice("");
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}
