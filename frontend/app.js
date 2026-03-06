const themes = {
  purple: "from-purple-600 to-pink-600",
  cyan: "from-cyan-600 to-blue-600",
  green: "from-green-600 to-emerald-600",
  orange: "from-orange-600 to-red-600"
};

// Official Dexscreener latest feed used as the "newest" source.
const DEXSCREENER_RECENT_URL = "https://api.dexscreener.com/token-profiles/latest/v1";
const DEXSCREENER_TOKENS_URL = "https://api.dexscreener.com/tokens/v1";
const FEED_REFRESH_MS = 30_000;
const FEED_MAX_BACKOFF_MS = 60_000;

const coinForm = document.getElementById("coinForm");
const connectWalletBtn = document.getElementById("connectWallet");
const walletAddressEl = document.getElementById("walletAddress");
const networkLabelEl = document.getElementById("networkLabel");
const launchFeeLabelEl = document.getElementById("launchFeeLabel");
const formStatusEl = document.getElementById("formStatus");

const previewCard = document.getElementById("previewCard");
const previewName = document.getElementById("previewName");
const previewSymbol = document.getElementById("previewSymbol");
const previewSupply = document.getElementById("previewSupply");
const previewLogo = document.getElementById("previewLogo");

const recentCoinsContainer = document.getElementById("recentCoins");
const topGainersContainer = document.getElementById("topGainers");
const topLosersContainer = document.getElementById("topLosers");
const hotTokensContainer = document.getElementById("hotTokens");
const liveLaunchFeedContainer = document.getElementById("live-launch-feed");
const discoveryGridEl = document.getElementById("discovery-grid");
const discoveryRefreshStatusEl = document.getElementById("discovery-refresh-status");
const tickerEl = document.getElementById("global-crypto-ticker");
const recentStatusEl = document.getElementById("recentStatus");
const recentUpdatedAtEl = document.getElementById("recentUpdatedAt");
const activityRefreshStatusEl = document.getElementById("activity-refresh-status");
const launchRefreshStatusEl = document.getElementById("launch-refresh-status");
const leaderboardRefreshStatusEl = document.getElementById("leaderboard-refresh-status");

const statRegisteredUsersEl = document.getElementById("stat-registered-users");
const statCommunityCoinsEl = document.getElementById("stat-community-coins");
const statTokensCreatedEl = document.getElementById("stat-tokens-created");
const statCommunityReferralsEl = document.getElementById("stat-community-referrals");

const dailyEarnersEl = document.getElementById("daily-earners");
const dailyReferrersEl = document.getElementById("daily-referrers");
const dailyCreatorsEl = document.getElementById("daily-creators");

const streakDay1El = document.getElementById("streak-day-1");
const streakDay2El = document.getElementById("streak-day-2");
const streakDay3El = document.getElementById("streak-day-3");
const streakBadgeEl = document.getElementById("streak-badge");

const successModal = document.getElementById("successModal");
const modalOverlay = document.getElementById("modalOverlay");
const modalContent = document.getElementById("modalContent");
const closeModalBtn = document.getElementById("closeModalBtn");
const contractAddressEl = document.getElementById("contractAddress");
const txLinkEl = document.getElementById("txLink");
const viewTokenLinkEl = document.getElementById("viewTokenLink");

let provider;
let signer;
let contract;
let launchFeeWei;
let currentTheme = "purple";
let uploadedImage = null;
let recentFetchInFlight = false;
let moversFetchInFlight = false;
let hasRenderedRecent = false;
let hasRenderedGainers = false;
let hasRenderedLosers = false;
let hasRenderedHot = false;
let feedIntervalMs = FEED_REFRESH_MS;
let feedTimerId = null;
let recentProfiles = [];
let lastLiveLaunchSignature = "";
let lastRecentLaunches = [];
let lastTopGainers = [];
let lastTopLosers = [];
let lastHotTokens = [];
let tickerCursor = 0;
let socialProofCursor = 0;
const knownLiveLaunches = new Set();
// Frontend-only tracking for engagement-based rewards
const activitySessions = {};

// --- Injected wallet provider selection (wallet-only fix) ---
// When multiple wallets are installed (e.g., MetaMask + Phantom),
// `window.ethereum` may be a shim that doesn't forward requests correctly.
// We keep the same flow but choose a concrete provider instance.
let injectedEvmProvider = null;

function pickInjectedEvmProvider() {
  const eth = window.ethereum;
  if (!eth) return null;

  // Some browsers expose multiple providers.
  const providers = Array.isArray(eth.providers) ? eth.providers : null;
  if (providers && providers.length) {
    // Prefer MetaMask, then Phantom, then first available.
    return (
      providers.find((p) => p?.isMetaMask) ||
      providers.find((p) => p?.isPhantom) ||
      providers[0]
    );
  }

  return eth;
}

function getInjectedProviderOrThrow() {
  injectedEvmProvider = injectedEvmProvider || pickInjectedEvmProvider();
  if (!injectedEvmProvider) {
    throw new Error("No EVM wallet found. Install MetaMask or Phantom.");
  }
  return injectedEvmProvider;
}

// --- NEW AUTH AND STATE MANAGEMENT ---

const API_BASE_URL = "https://cdk-launchpad.onrender.com/api";

// DOM Elements
const showAuthModalBtn = document.getElementById("show-auth-modal-btn");
const userInfoD = document.getElementById("user-info-d");
const userCoinBalanceEl = document.getElementById("user-coin-balance");
const userEmailEl = document.getElementById("user-email");
const logoutBtn = document.getElementById("logout-btn");

const authModal = document.getElementById("auth-modal");
const authModalOverlay = document.getElementById("auth-modal-overlay");
const authModalContent = document.getElementById("auth-modal-content");
const authCloseBtn = document.getElementById("auth-close-btn");
const authTabLogin = document.getElementById("auth-tab-login");
const authTabRegister = document.getElementById("auth-tab-register");
const authStatusEl = document.getElementById("auth-status");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

const userDashboard = document.getElementById("user-dashboard");
const dashboardStatusEl = document.getElementById("dashboard-status");
const dailyClaimBtn = document.getElementById("daily-claim-btn");
const adClaimBtn = document.getElementById("ad-claim-btn");
const referralCodeInput = document.getElementById("referral-code-input");
const copyReferralBtn = document.getElementById("copy-referral-btn");

const userStatEmail = document.getElementById("user-stat-email");
const userStatBalance = document.getElementById("user-stat-balance");
const userStatReferrals = document.getElementById("user-stat-referrals");
const userStatTokens = document.getElementById("user-stat-tokens");

const userTokensStatusEl = document.getElementById("user-tokens-status");
const userTokensListEl = document.getElementById("user-tokens-list");

// Sections considered for activity rewards
const activitySections = {
  dashboard: document.getElementById("user-dashboard"),
  explore: document.getElementById("marketplace"),
  market: document.getElementById("marketplace"),
  leaderboard: document.getElementById("community"),
};

const leaderboardReferrersEl = document.getElementById("leaderboard-referrers");
const leaderboardEarnersEl = document.getElementById("leaderboard-earners");

// App state
const state = {
  token: localStorage.getItem("token"),
  user: null,
  walletConnected: localStorage.getItem("walletConnected") === "true",
  walletAddress: localStorage.getItem("walletAddress") || null,
};

// --- Dashboard placement (layout only) ---
// Requirement: after login, show the existing dashboard near the top,
// without changing any other functional logic.
const dashboardPlacement = {
  originalParent: null,
  originalNextSibling: null,
  moved: false,
};

function ensureDashboardPlacementCache() {
  if (dashboardPlacement.originalParent) return;
  if (!userDashboard) return;
  dashboardPlacement.originalParent = userDashboard.parentNode;
  dashboardPlacement.originalNextSibling = userDashboard.nextSibling;
}

function moveDashboardNearTopIfLoggedIn() {
  if (!userDashboard) return;
  ensureDashboardPlacementCache();

  const loggedIn = Boolean(state.token && state.user);
  const heroSection = document.querySelector("section.hero-bg");

  if (loggedIn) {
    if (!heroSection) return;
    if (!dashboardPlacement.moved) {
      heroSection.parentNode.insertBefore(userDashboard, heroSection.nextSibling);
      dashboardPlacement.moved = true;
    }
    return;
  }

  // Logged out: restore original DOM position
  if (dashboardPlacement.moved && dashboardPlacement.originalParent) {
    if (dashboardPlacement.originalNextSibling) {
      dashboardPlacement.originalParent.insertBefore(userDashboard, dashboardPlacement.originalNextSibling);
    } else {
      dashboardPlacement.originalParent.appendChild(userDashboard);
    }
    dashboardPlacement.moved = false;
  }
}

function setAuthStatus(message, isError = true) {
  authStatusEl.textContent = message;
  authStatusEl.style.color = isError ? "#f87171" : "#4ade80";
}

function setDashboardStatus(message, isError = false) {
    dashboardStatusEl.textContent = message;
    dashboardStatusEl.style.color = isError ? "#f87171" : "#a78bfa";
    setTimeout(() => dashboardStatusEl.textContent = '', 5000);
}

function setUserTokensStatus(message, isError = false) {
  if (!userTokensStatusEl) return;
  userTokensStatusEl.textContent = message || "";
  userTokensStatusEl.style.color = isError ? "#f87171" : "#9ca3af";
}

function shortenAddressFull(address, createdAtIso) {
  if (!address) return "-";
  if (address === "unknown") {
    // Show "Indexing..." only for very recent launches; older ones are missing data.
    const createdAtMs = createdAtIso ? new Date(createdAtIso).getTime() : NaN;
    const isRecent = Number.isFinite(createdAtMs) ? Date.now() - createdAtMs < 5 * 60 * 1000 : false;
    return isRecent ? "Indexing..." : "Unknown";
  }
  return address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

function renderUserTokens(tokens) {
  if (!userTokensListEl) return;
  if (!Array.isArray(tokens) || tokens.length === 0) {
    userTokensListEl.innerHTML = `
      <div class="col-span-full text-sm text-gray-400 border border-white/10 rounded-xl p-4 bg-white/5 text-center">
        No tokens launched yet.
      </div>
    `;
    return;
  }

  const explorer = window.LAUNCHPAD_CONFIG?.blockExplorerBaseUrl || "";
  userTokensListEl.innerHTML = tokens
    .slice(0, 20)
    .map((t) => {
      const name = t.token_name || "Token";
      const symbol = t.token_symbol ? `$${String(t.token_symbol).toUpperCase()}` : "";
      const address = t.contract_address || "unknown";
      const addressLabel = shortenAddressFull(address, t.created_at);
      const addressUrl = explorer && address && address !== "unknown" ? `${explorer}/token/${address}` : "";
      const createdAt = t.created_at ? new Date(t.created_at).toLocaleString() : "";
      return `
        <div class="glass-card rounded-2xl p-4 border border-white/10">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="font-semibold text-white truncate">${name} <span class="text-gray-400 font-mono text-sm">${symbol}</span></div>
              <div class="text-xs text-gray-400 mt-1">${createdAt}</div>
              <div class="text-sm mt-2 font-mono text-purple-300 break-all">
                ${addressUrl ? `<a href="${addressUrl}" target="_blank" rel="noreferrer" class="underline hover:text-purple-200">${address}</a>` : addressLabel}
              </div>
            </div>
            <div class="shrink-0">
              ${addressUrl ? `<a href="${addressUrl}" target="_blank" rel="noreferrer" class="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-semibold transition-colors">View</a>` : ""}
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

async function fetchAndRenderUserTokens() {
  if (!state.token || !state.user) {
    setUserTokensStatus("");
    if (userTokensListEl) userTokensListEl.innerHTML = "";
    return;
  }

  try {
    setUserTokensStatus("Loading your launched tokens...");
    const data = await apiFetch("/tokens/mine", { method: "GET" });
    const tokens = Array.isArray(data?.tokens) ? data.tokens : [];
    renderUserTokens(tokens);
    setUserTokensStatus(tokens.length ? "" : "No tokens launched yet.");
  } catch (e) {
    setUserTokensStatus("Could not load your tokens.", true);
  }
}

async function claimActivityReward(activityKey) {
  if (!state.token || !state.user) return;
  try {
    const result = await apiFetch("/activity-reward", {
      method: "POST",
      body: { activityKey },
    });
    if (typeof result.newBalance === "number") {
      state.user.rewardBalance = result.newBalance;
      localStorage.setItem("user", JSON.stringify(state.user));
      updateUI();
    }
    setDashboardStatus(result.message || "Activity reward earned!", false);
  } catch (error) {
    const msg = error.error || error.message;
    setDashboardStatus(msg || "Could not claim activity reward.", true);
  }
}

function scheduleActivityReward(activityKey) {
  if (!state.token || !state.user) return;
  const key = activityKey || "activity";
  const existing = activitySessions[key];
  if (existing && existing.timerId) {
    clearTimeout(existing.timerId);
  }
  activitySessions[key] = {
    startTime: Date.now(),
    timerId: setTimeout(() => {
      if (document.visibilityState === "visible") {
        claimActivityReward(key);
      }
    }, 30_000),
  };
}

function initActivityTracking() {
  if (!("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const target = entry.target;
        if (target === activitySections.dashboard) {
          scheduleActivityReward("dashboard");
        } else if (target === activitySections.explore) {
          scheduleActivityReward("explore");
        } else if (target === activitySections.leaderboard) {
          scheduleActivityReward("leaderboard");
        }
      });
    },
    { threshold: 0.5 }
  );

  Object.values(activitySections).forEach((el) => {
    if (el) observer.observe(el);
  });
}

function getEngagementState() {
  const key = "engagement_rewards_state";
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || parsed.date !== today) {
      const next = { date: today, count: 0 };
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    }
    return parsed;
  } catch {
    const fallback = { date: today, count: 0 };
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
}

function setEngagementState(next) {
  localStorage.setItem("engagement_rewards_state", JSON.stringify(next));
}

function showEngagementPopup(message) {
  const existing = document.getElementById("engagement-popup");
  if (existing) existing.remove();
  const popup = document.createElement("div");
  popup.id = "engagement-popup";
  popup.className = "fixed z-[120] right-4 bottom-24 px-4 py-3 rounded-xl bg-emerald-600/95 text-white text-sm shadow-2xl border border-emerald-300/40 animate-fade-in";
  popup.textContent = message;
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 2800);
}

function scheduleEngagementReward(areaKey) {
  const key = `engage_${areaKey}`;
  const existing = activitySessions[key];
  if (existing?.timerId) clearTimeout(existing.timerId);

  activitySessions[key] = {
    timerId: setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      const stateNow = getEngagementState();
      if (stateNow.count >= 5) return;

      stateNow.count += 1;
      setEngagementState(stateNow);
      showEngagementPopup("🎁 You earned 3 CDK for staying active!");
    }, 30_000),
  };
}

function initEngagementObservers() {
  if (!("IntersectionObserver" in window)) return;
  const exploreSection = document.getElementById("live-launches");
  const marketSection = document.getElementById("marketplace");
  if (!exploreSection && !marketSection) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        if (entry.target === exploreSection) scheduleEngagementReward("explore");
        if (entry.target === marketSection) scheduleEngagementReward("market");
      });
    },
    { threshold: 0.5 }
  );

  if (exploreSection) observer.observe(exploreSection);
  if (marketSection) observer.observe(marketSection);
}

function initScrollTrendingPrompt() {
  let shown = false;
  const onScroll = () => {
    if (shown) return;
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const maxScroll = Math.max(
      1,
      document.documentElement.scrollHeight - document.documentElement.clientHeight
    );
    const ratio = scrollTop / maxScroll;
    if (ratio < 0.6) return;
    shown = true;

    const popup = document.createElement("div");
    popup.className = "fixed z-[121] left-1/2 -translate-x-1/2 bottom-8 bg-rose-600/95 text-white px-5 py-4 rounded-2xl shadow-2xl border border-rose-300/50";
    popup.innerHTML = `
      <div class="text-sm font-semibold mb-2">🔥 Trending tokens are launching right now.</div>
      <button type="button" class="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-semibold">Explore Tokens</button>
    `;
    const btn = popup.querySelector("button");
    btn?.addEventListener("click", () => {
      const target = document.getElementById("live-launches");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      popup.remove();
    });
    document.body.appendChild(popup);
    setTimeout(() => {
      if (popup.isConnected) popup.remove();
    }, 8000);
    window.removeEventListener("scroll", onScroll);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
}

function initLazyAds() {
  const lazyAds = document.querySelectorAll(".ad-lazy");
  if (!lazyAds.length) return;
  const adClient = "ca-pub-REPLACE_WITH_PUBLISHER_ID";

  const activateAd = (ad) => {
    if (!ad || ad.dataset.loaded === "true") return;
    ad.dataset.loaded = "true";
    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.setAttribute("data-ad-client", adClient);
    ins.setAttribute("data-ad-slot", ad.dataset.adSlot || "REPLACE_WITH_SLOT");
    ins.setAttribute("data-ad-format", "auto");
    ins.setAttribute("data-full-width-responsive", "true");
    ad.innerHTML = "";
    ad.appendChild(ins);
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Ignore blocked/ad-disabled environments.
    }
    ad.classList.add("ad-loaded");
  };

  const adObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const ad = entry.target;
        activateAd(ad);
        adObserver.unobserve(ad);
      });
    },
    { rootMargin: "300px" }
  );

  lazyAds.forEach((ad) => adObserver.observe(ad));
  window.observeLazyAdElement = (el) => {
    if (!el || el.dataset.loaded === "true") return;
    adObserver.observe(el);
  };
}

// API Fetch wrapper
async function apiFetch(endpoint, options = {}) {
  const { body, ...rest } = options;
  const headers = {
    "Content-Type": "application/json",
    ...rest.headers,
  };

  if (state.token) {
    headers["Authorization"] = `Bearer ${state.token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...rest,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw || "Unexpected response from server" };
  }

  if (!response.ok) {
    if (response.status === 401 && state.token) {
      handleLogout(); // Token is invalid or expired
    }
    const error = new Error(data?.error || data?.message || `HTTP ${response.status}`);
    error.response = { data };
    error.status = response.status;
    throw error;
  }
  return data;
}

// UI Update logic
function updateUI() {
  if (state.token && state.user) {
    // Logged-in state
    showAuthModalBtn.classList.add("hidden");
    userInfoD.classList.remove("hidden");
    userInfoD.classList.add("flex");
    userDashboard.classList.remove("hidden");
    moveDashboardNearTopIfLoggedIn();
    fetchAndRenderUserTokens();
    // Kick off a dashboard activity session on login
    scheduleActivityReward("dashboard");

    // Nav bar stats
    userEmailEl.textContent = state.user.email;
    userCoinBalanceEl.textContent = state.user.rewardBalance.toLocaleString();
    
    // Dashboard stats
    userStatEmail.textContent = state.user.email;
    userStatBalance.textContent = state.user.rewardBalance.toLocaleString();
    userStatReferrals.textContent = state.user.referralCount.toLocaleString();
    userStatTokens.textContent = state.user.tokensLaunched.toLocaleString();


    referralCodeInput.value = state.user.referralCode;

  } else {
    // Logged-out state
    showAuthModalBtn.classList.remove("hidden");
    userInfoD.classList.add("hidden");
    userInfoD.classList.remove("flex");
    userDashboard.classList.add("hidden");
    moveDashboardNearTopIfLoggedIn();
    setUserTokensStatus("");
    if (userTokensListEl) userTokensListEl.innerHTML = "";
  }
  lucide.createIcons();
}

// Auth Modal visibility
function showAuthModal() {
    authModal.classList.remove("hidden");
    authModal.classList.add("flex");
    setTimeout(() => {
        authModalContent.classList.remove("scale-95", "opacity-0");
        authModalContent.classList.add("scale-100", "opacity-100");
    }, 10);
    lucide.createIcons();
}

function hideAuthModal() {
    authModalContent.classList.remove("scale-100", "opacity-100");
    authModalContent.classList.add("scale-95", "opacity-0");
    setTimeout(() => {
        authModal.classList.add("hidden");
        authModal.classList.remove("flex");
    }, 300);
}


// Auth handlers
async function handleLogin(e) {
  e.preventDefault();
  setAuthStatus("", false);
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  try {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    updateUI();
    hideAuthModal();
  } catch (error) {
    setAuthStatus(error.error || "Login failed");
  }
}

async function handleRegister(e) {
  e.preventDefault();
  setAuthStatus("", false);
  const email = document.getElementById("register-email").value;
  const password = document.getElementById("register-password").value;
  const referral = document.getElementById("register-referral").value;
  try {
    const data = await apiFetch("/auth/register", {
      method: "POST",
      body: { email, password, referral },
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    updateUI();
    hideAuthModal();
  } catch (error) {
    setAuthStatus(error.error || "Registration failed");
  }
}

function handleLogout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  updateUI();
}

function checkAuthState() {
    const token = localStorage.getItem("token");
    const user = localStorage.getItem("user");
    if (token && user) {
        state.token = token;
        state.user = JSON.parse(user);
    }
    updateUI();
}

// Dashboard handlers
async function handleDailyClaim() {
    try {
        const result = await apiFetch("/rewards/daily-claim", { method: "POST" });
        state.user.rewardBalance = result.newBalance;
        localStorage.setItem("user", JSON.stringify(state.user));
        advanceStreakOnDailyClaim();
        updateUI();
        setDashboardStatus(result.message, false);
    } catch (error) {
        setDashboardStatus(error.message || error.error, true);
    }
}

async function handleAdClaim() {
    setDashboardStatus("Stay active on Dashboard, Explore/Trending, and Leaderboard sections for at least 30 seconds to automatically earn small activity rewards. Daily limits apply.", false);
}

function copyReferralCode() {
    referralCodeInput.select();
    document.execCommand("copy");
    setDashboardStatus("Referral code copied!", false);
}

// Leaderboard Logic
function renderLeaderboard(container, data, valueKey, valueLabel) {
    if (!container) return;
    if (!data || data.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No data available yet.</p>';
        return;
    }

    container.innerHTML = data.slice(0, 5).map((row, index) => `
        <div class="flex items-center justify-between text-sm p-2 rounded-lg ${index % 2 === 0 ? 'bg-white/5' : ''}">
            <span class="text-gray-400">${index + 1}. ${row.email.split('@')[0]}...</span>
            <span class="font-bold text-white">${Number(row[valueKey]).toLocaleString()} ${valueLabel}</span>
        </div>
    `).join('');
}

async function fetchAndRenderLeaderboards() {
    try {
        if (leaderboardRefreshStatusEl) leaderboardRefreshStatusEl.textContent = `Leaderboards updating... ${formatClock()}`;
        const leaderboards = await apiFetch("/leaderboard");
        renderLeaderboard(leaderboardReferrersEl, leaderboards.topReferrers, 'referral_count', 'referrals');
        renderLeaderboard(leaderboardEarnersEl, leaderboards.topEarners, 'coins_earned', 'coins');

        // Daily leaderboard proxies (client-side reset every local day).
        const today = getTodayKey();
        const todayEarners = (leaderboards.topEarners || []).map((r) => ({
          ...r,
          coins_earned: Number(r.coins_earned || 0)
        }));
        const todayReferrers = (leaderboards.topReferrers || []).map((r) => ({
          ...r,
          referral_count: Number(r.referral_count || 0)
        }));

        if (dailyEarnersEl) dailyEarnersEl.innerHTML = buildRankRows(todayEarners, "coins_earned", " coins");
        if (dailyReferrersEl) dailyReferrersEl.innerHTML = buildRankRows(todayReferrers, "referral_count", " refs");

        const creatorMap = new Map();
        (lastRecentLaunches || []).forEach((t) => {
          const createdDay = parseLocalDay(t.created_at);
          if (createdDay !== today) return;
          const creator = t.creator_email || t.creator_wallet || "creator";
          creatorMap.set(creator, (creatorMap.get(creator) || 0) + 1);
        });
        const creators = Array.from(creatorMap.entries())
          .map(([creator, created]) => ({ creator, created }))
          .sort((a, b) => b.created - a.created);
        if (dailyCreatorsEl) dailyCreatorsEl.innerHTML = buildRankRows(creators, "created", " tokens");

        const uniqueUsers = new Set([
          ...(leaderboards.topReferrers || []).map((r) => r.id || r.email),
          ...(leaderboards.topEarners || []).map((r) => r.id || r.email)
        ]);
        const totalUsersApprox = uniqueUsers.size || null;
        const totalCoinsApprox = (leaderboards.topEarners || []).reduce((acc, r) => acc + Number(r.coins_earned || 0), 0) || null;
        const totalTokens = (lastRecentLaunches || []).length || null;
        const totalRefsApprox = (leaderboards.topReferrers || []).reduce((acc, r) => acc + Number(r.referral_count || 0), 0) || null;
        setStatValue(statRegisteredUsersEl, totalUsersApprox);
        setStatValue(statCommunityCoinsEl, totalCoinsApprox);
        setStatValue(statTokensCreatedEl, totalTokens);
        setStatValue(statCommunityReferralsEl, totalRefsApprox);
    } catch (error) {
        if(leaderboardReferrersEl) leaderboardReferrersEl.innerHTML = '<p class="text-red-400 text-sm">Could not load referrers.</p>';
        if(leaderboardEarnersEl) leaderboardEarnersEl.innerHTML = '<p class="text-red-400 text-sm">Could not load earners.</p>';
        setStatValue(statRegisteredUsersEl, null);
        setStatValue(statCommunityCoinsEl, null);
        setStatValue(statTokensCreatedEl, null);
        setStatValue(statCommunityReferralsEl, null);
    } finally {
        if (leaderboardRefreshStatusEl) leaderboardRefreshStatusEl.textContent = `Leaderboards updating... ${formatClock()}`;
    }
}


// --- END OF NEW LOGIC ---


function renderFeedNotice(targetEl, message) {
  if (!targetEl) return;
  targetEl.innerHTML = `<div class="col-span-full text-sm text-gray-400 border border-white/10 rounded-xl p-4 bg-white/5">${message}</div>`;
}

function formatClock(ms = Date.now()) {
  return new Date(ms)
    .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })
    .toUpperCase();
}

function updateFeedClock() {
  if (!recentUpdatedAtEl) return;
  recentUpdatedAtEl.textContent = formatClock();
}

function setStatValue(el, value) {
  if (!el) return;
  if (value === null || value === undefined || value === "") {
    el.textContent = "Live data updating";
    el.classList.add("text-gray-400");
    return;
  }
  el.classList.remove("text-gray-400");
  el.textContent = Number(value).toLocaleString();
}

function parseLocalDay(isoLike) {
  const d = isoLike ? new Date(isoLike) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getTodayKey() {
  return parseLocalDay(new Date().toISOString());
}

function getStreakState() {
  const key = "cdk_streak_state";
  const today = getTodayKey();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { dayCount: 0, lastClaimDay: null, today };
    const parsed = JSON.parse(raw);
    return { dayCount: Number(parsed.dayCount || 0), lastClaimDay: parsed.lastClaimDay || null, today };
  } catch {
    return { dayCount: 0, lastClaimDay: null, today };
  }
}

function saveStreakState(state) {
  localStorage.setItem("cdk_streak_state", JSON.stringify({ dayCount: state.dayCount, lastClaimDay: state.lastClaimDay }));
}

function refreshStreakUI() {
  const state = getStreakState();
  if (state.lastClaimDay) {
    const prev = new Date(`${state.lastClaimDay}T00:00:00`);
    const now = new Date(`${getTodayKey()}T00:00:00`);
    const diffDays = Math.round((now - prev) / (24 * 60 * 60 * 1000));
    if (diffDays > 1) {
      state.dayCount = 0;
      saveStreakState(state);
    }
  }
  if (!streakBadgeEl || !streakDay1El || !streakDay2El || !streakDay3El) return;

  const classesOn = "bg-emerald-500/20 border-emerald-400/40 text-emerald-200";
  const classesOff = "bg-white/5 border-white/10 text-gray-300";
  [streakDay1El, streakDay2El, streakDay3El].forEach((el, idx) => {
    const active = state.dayCount >= idx + 1;
    el.classList.remove(...classesOn.split(" "), ...classesOff.split(" "));
    el.classList.add(...(active ? classesOn : classesOff).split(" "));
  });
  streakBadgeEl.textContent = state.dayCount > 0 ? `Streak: ${state.dayCount} day${state.dayCount > 1 ? "s" : ""}` : "No streak yet";
}

function advanceStreakOnDailyClaim() {
  const state = getStreakState();
  const today = getTodayKey();
  if (state.lastClaimDay === today) return;

  if (!state.lastClaimDay) {
    state.dayCount = 1;
  } else {
    const prev = new Date(`${state.lastClaimDay}T00:00:00`);
    const now = new Date(`${today}T00:00:00`);
    const diffDays = Math.round((now - prev) / (24 * 60 * 60 * 1000));
    state.dayCount = diffDays === 1 ? Math.min(3, state.dayCount + 1) : 1;
  }
  state.lastClaimDay = today;
  saveStreakState(state);
  refreshStreakUI();
}

function buildRankRows(rows, valueKey, valueSuffix = "") {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<p class="text-gray-500 text-sm">Live data updating</p>`;
  }
  return rows.slice(0, 5).map((row, idx) => {
    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;
    const name = String(row.email || row.creator || "user").split("@")[0];
    return `<div class="flex items-center justify-between rounded-lg p-2 ${idx % 2 === 0 ? "bg-white/5" : ""}">
      <span class="text-gray-300">${medal} ${name}</span>
      <span class="text-white font-semibold">${Number(row[valueKey] || 0).toLocaleString()}${valueSuffix}</span>
    </div>`;
  }).join("");
}

function updateDiscoveryGrid() {
  if (!discoveryGridEl) return;
  const categories = [
    { title: "Recent Launches", items: lastRecentLaunches },
    { title: "Trending Tokens", items: lastHotTokens },
    { title: "Top Gainers", items: lastTopGainers },
    { title: "Top Losers", items: lastTopLosers }
  ];
  const html = categories
    .map((cat) => {
      const first = (cat.items || [])[0];
      if (!first) {
        return `<div class="glass-card rounded-2xl p-4 border border-white/10"><h4 class="font-semibold mb-2">${cat.title}</h4><p class="text-xs text-gray-400">Live data updating</p></div>`;
      }
      const symbol = first.symbol || first.token_symbol || shortenAddress(first.tokenAddress || first.contract_address);
      const change = Number(first.changeH24 || first.price_change || 0);
      const volume = Number(first.volume24h || 0);
      return `<div class="glass-card rounded-2xl p-4 border border-white/10">
        <h4 class="font-semibold mb-2">${cat.title}</h4>
        <div class="flex items-center gap-3">
          <img loading="lazy" src="${getTokenLogo(first)}" class="w-10 h-10 rounded-lg object-cover" alt="token">
          <div>
            <p class="font-semibold">${symbol}</p>
            <p class="text-xs ${change >= 0 ? "text-green-300" : "text-rose-300"}">${change.toFixed(2)}%</p>
            <p class="text-xs text-gray-400">Vol $${volume.toLocaleString()}</p>
          </div>
        </div>
      </div>`;
    })
    .join("");
  discoveryGridEl.innerHTML = html;
  if (discoveryRefreshStatusEl) discoveryRefreshStatusEl.textContent = `Discovery grid updating: ${formatClock()}`;
}

function updateTicker() {
  if (!tickerEl) return;
  const pool = [...lastHotTokens, ...lastTopGainers, ...lastRecentLaunches];
  if (!pool.length) {
    tickerEl.innerHTML = `<span class="inline-block px-4">Live market data updating...</span>`;
    return;
  }
  const slice = [];
  for (let i = 0; i < Math.min(12, pool.length); i += 1) {
    const item = pool[(tickerCursor + i) % pool.length];
    const symbol = item.symbol || item.token_symbol || shortenAddress(item.tokenAddress || item.contract_address);
    const change = Number(item.changeH24 || item.price_change || 0);
    const volume = Number(item.volume24h || 0);
    slice.push(`<span class="inline-block px-6">${symbol} <span class="${change >= 0 ? "text-green-300" : "text-rose-300"}">${change.toFixed(2)}%</span> Vol $${volume.toLocaleString()}</span>`);
  }
  tickerEl.innerHTML = `${slice.join("")}${slice.join("")}`;
  tickerCursor = (tickerCursor + 1) % Math.max(1, pool.length);
}

function showSocialProofToast(item) {
  if (!item) return;
  const existing = document.getElementById("social-proof-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "social-proof-toast";
  toast.className = "fixed left-4 bottom-6 z-[122] bg-slate-900/95 border border-white/10 rounded-xl px-4 py-3 text-sm shadow-2xl animate-fade-in";
  toast.innerHTML = `<p class="text-white">${item}</p>`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

function rotateSocialProof() {
  const items = [];
  lastRecentLaunches.forEach((t) => {
    const creator = resolveCreatorWalletLabel(t.creator_wallet, t.creator_email);
    items.push(`${creator} launched ${t.token_symbol ? `$${String(t.token_symbol).toUpperCase()}` : "a token"}`);
  });
  if (state.user?.email) {
    items.push(`${state.user.email.split("@")[0]} earned platform activity rewards`);
  }
  items.push("A new member joined using referral");
  if (!items.length) return;
  const msg = items[socialProofCursor % items.length];
  socialProofCursor += 1;
  showSocialProofToast(msg);
}

function ensureConfig() {
  if (!window.LAUNCHPAD_CONFIG) {
    throw new Error("Missing config.js.");
  }
}

function getReadableError(error) {
  return (
    error?.error?.message ||
    error?.info?.error?.message ||
    error?.data?.message ||
    error?.reason ||
    error?.shortMessage ||
    error?.message ||
    "Unknown error"
  );
}

function setStatus(message, isError = true) {
  formStatusEl.style.color = isError ? "#fda4af" : "#86efac";
  formStatusEl.innerHTML = message;
}

function shortenAddress(address) {
  if (!address || address.length < 10) return address || "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTimeAgo(value) {
  if (!value) return "-";
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return "-";
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff} seconds ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

function isWithinMinutes(value, minutes) {
  if (!value) return false;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= minutes * 60 * 1000;
}

function getTokenLogo(token) {
  return (
    token?.icon ||
    token?.logo ||
    token?.iconUrl ||
    `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(
      token?.token_symbol || token?.symbol || token?.tokenAddress || token?.contract_address || "token"
    )}`
  );
}

function resolveCreatorWalletLabel(creatorWallet, creatorEmail) {
  if (creatorWallet && /^0x[a-fA-F0-9]{40}$/.test(String(creatorWallet))) {
    return shortenAddress(creatorWallet);
  }
  if (creatorEmail) {
    const local = String(creatorEmail).split("@")[0] || "user";
    return `${local.slice(0, 8)}...`;
  }
  return "unknown";
}

function getBadgeMarkup({ priceChange, launchedAt }) {
  const chips = [];
  if (Number(priceChange) > 20) {
    chips.push(`<span class="px-2 py-1 rounded-full text-[10px] font-semibold badge-trending">🔥 TRENDING</span>`);
  }
  if (isWithinMinutes(launchedAt, 10)) {
    chips.push(`<span class="px-2 py-1 rounded-full text-[10px] font-semibold badge-new">🆕 NEW</span>`);
  }
  return chips.join("");
}

function formatSupply(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return n.toLocaleString();
}

function updatePreview() {
  const name = document.getElementById("tokenName").value || "MOON";
  const symbol = document.getElementById("tokenSymbol").value || "MOON";
  const supply = document.getElementById("totalSupply").value || "1000000000";

  previewName.textContent = name;
  previewSymbol.textContent = `$${symbol.toUpperCase()}`;
  previewSupply.textContent = formatSupply(supply);
  previewCard.className = `relative w-64 h-80 rounded-3xl bg-gradient-to-br ${themes[currentTheme]} p-6 shadow-2xl transform transition-all duration-500 hover:scale-105 flex flex-col items-center text-center`;
}

function bindThemeButtons() {
  document.querySelectorAll(".theme-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".theme-btn").forEach((b) => {
        b.classList.remove("active", "border-purple-500");
        b.classList.add("border-transparent");
      });
      btn.classList.add("active", "border-purple-500");
      btn.classList.remove("border-transparent");
      currentTheme = btn.dataset.theme || "purple";
      updatePreview();
    });
  });
}

function bindLogoUpload() {
  document.getElementById("logoUpload").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      uploadedImage = event.target?.result;
      previewLogo.innerHTML = `<img src="${uploadedImage}" class="w-full h-full object-cover rounded-xl">`;
    };
    reader.readAsDataURL(file);
  });
}

function renderRecentCards(items) {
  if (!recentCoinsContainer) return;
  if (!items.length) {
    renderFeedNotice(recentCoinsContainer, "No recent coins available right now.");
    return;
  }
  hasRenderedRecent = true;

  recentCoinsContainer.innerHTML = items
    .slice(0, 8)
    .map((coin) => {
      const chain = String(coin.chainId || "unknown").toUpperCase();
      const address = shortenAddress(coin.tokenAddress);
      const icon = getTokenLogo(coin);
      const desc = String(coin.description || "New token profile").slice(0, 90);
      const badges = getBadgeMarkup({
        priceChange: coin.changeH24,
        launchedAt: coin.pairCreatedAt || coin.created_at
      });
      return `
      <a href="${coin.url || "#"}" target="_blank" rel="noreferrer" class="glass-card rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-all hover:transform hover:scale-105 cursor-pointer group block">
          <div class="flex items-center gap-3 mb-3">
              <img loading="lazy" src="${icon}" alt="token icon" class="w-12 h-12 rounded-xl object-cover" onerror="this.src='https://placehold.co/96x96/1e293b/e2e8f0?text=%24'">
              <div>
                  <h4 class="font-semibold text-white group-hover:text-purple-400 transition-colors">${chain}</h4>
                  <span class="text-xs text-gray-400">${address}</span>
              </div>
          </div>
          <div class="flex flex-wrap gap-2 mb-2">${badges}</div>
          <p class="text-sm text-gray-400">${desc}</p>
      </a>`;
    })
    .join("");
}

function renderHotTokens(items) {
  if (!hotTokensContainer) return;
  if (!items.length) {
    renderFeedNotice(hotTokensContainer, "No hot tokens available right now.");
    return;
  }
  hasRenderedHot = true;

  hotTokensContainer.innerHTML = items
    .slice(0, 4)
    .map((item) => {
      const change = Number(item.changeH24 || 0);
      const price = Number(item.priceUsd || 0);
      const volume = Number(item.volume24h || 0);
      const badges = getBadgeMarkup({
        priceChange: change,
        launchedAt: item.pairCreatedAt
      });
      return `
      <a href="${item.url || "#"}" target="_blank" rel="noreferrer" class="glass-card rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-all block">
          <div class="flex items-center gap-3 mb-3">
              <img loading="lazy" src="${getTokenLogo(item)}" alt="token icon" class="w-11 h-11 rounded-xl object-cover" onerror="this.src='https://placehold.co/96x96/1e293b/e2e8f0?text=%24'">
              <div class="min-w-0">
                  <h4 class="font-semibold truncate">${item.symbol || shortenAddress(item.tokenAddress)}</h4>
                  <p class="text-xs text-gray-400 truncate">${shortenAddress(item.tokenAddress)}</p>
              </div>
          </div>
          <div class="flex flex-wrap gap-2 mb-2">${badges}</div>
          <p class="text-sm text-gray-300">Price: $${price > 0 ? price.toFixed(8) : "0.00000000"}</p>
          <p class="text-sm ${change >= 0 ? "text-green-300" : "text-rose-300"}">24h: ${change.toFixed(2)}%</p>
          <p class="text-xs text-gray-400">Volume: $${volume.toLocaleString()}</p>
      </a>`;
    })
    .join("");
}

function getTokenDetailUrl(address) {
  return `./token.html?address=${encodeURIComponent(address || "")}`;
}

function getTokenShareMessage(token) {
  const tokenName = token?.token_name || token?.symbol || "this token";
  return `🚀 I just launched a new token on Cow Dung Cake. Check out ${tokenName} before it explodes!`;
}

function getShareUrls(tokenLink, token) {
  const text = encodeURIComponent(getTokenShareMessage(token));
  const url = encodeURIComponent(tokenLink);
  return {
    twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
    telegram: `https://t.me/share/url?url=${url}&text=${text}`
  };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function renderLiveLaunchCards(tokens) {
  if (!liveLaunchFeedContainer) return;
  if (!Array.isArray(tokens) || tokens.length === 0) {
    renderFeedNotice(liveLaunchFeedContainer, "No launches yet. Be the first to launch.");
    return;
  }

  const nextKnown = new Set();
  const fragment = document.createDocumentFragment();

  tokens.slice(0, 10).forEach((token) => {
    const address = token.contract_address || "";
    const tokenKey = address.toLowerCase();
    nextKnown.add(tokenKey);

    const isNew = !knownLiveLaunches.has(tokenKey);
    const card = document.createElement("div");
    card.className =
      "glass-card live-launch-card rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-all cursor-pointer";

    const logo = getTokenLogo(token);
    const detailUrl = getTokenDetailUrl(address);
    const createdAt = token.created_at;
    const creatorLabel = resolveCreatorWalletLabel(token.creator_wallet, token.creator_email);
    const views = Number(token.views || 0).toLocaleString();
    const badges = getBadgeMarkup({ priceChange: token.price_change, launchedAt: createdAt });
    const supplyText = token.supply ? formatSupply(token.supply) : "Live data updating";
    const share = getShareUrls(detailUrl, token);

    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
              <img loading="lazy" src="${logo}" alt="token icon" class="w-12 h-12 rounded-xl object-cover" onerror="this.src='https://placehold.co/96x96/1e293b/e2e8f0?text=%24'">
              <div class="min-w-0">
                  <h4 class="font-semibold text-white truncate">${token.token_name || "Token"}</h4>
                  <p class="text-xs text-gray-400">${token.token_symbol ? `$${String(token.token_symbol).toUpperCase()}` : "-"}</p>
              </div>
          </div>
          <span class="text-xs text-gray-400 whitespace-nowrap">${formatTimeAgo(createdAt)}</span>
      </div>
      <div class="mt-3 space-y-1 text-sm">
          <p class="text-gray-300">Creator: <span class="font-mono text-cyan-300">${creatorLabel}</span></p>
          <p class="text-gray-300">Supply: <span class="font-mono text-yellow-300">${supplyText}</span></p>
          <p class="text-gray-300 break-all">Address: <span class="font-mono text-purple-300">${address || "unknown"}</span></p>
          <div class="flex flex-wrap gap-2">${badges}</div>
          <p class="text-gray-400">👁 ${views} views</p>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
          <a href="${detailUrl}" class="inline-flex items-center justify-center px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-semibold transition-colors">View Token</a>
          <a href="${share.twitter}" target="_blank" rel="noreferrer" class="share-twitter inline-flex items-center justify-center px-3 py-2 bg-sky-500/20 hover:bg-sky-500/30 rounded-xl text-xs font-semibold transition-colors">Share on Twitter</a>
          <a href="${share.telegram}" target="_blank" rel="noreferrer" class="share-telegram inline-flex items-center justify-center px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-xl text-xs font-semibold transition-colors">Share on Telegram</a>
          <button type="button" class="share-copy inline-flex items-center justify-center px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-xl text-xs font-semibold transition-colors">Copy Link</button>
      </div>
    `;
    card.querySelector(".share-copy")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const shareLink = new URL(detailUrl, window.location.href).href;
      const ok = await copyText(shareLink);
      if (ok) setDashboardStatus("Token link copied.", false);
    });
    card.querySelectorAll("a,button").forEach((el) => {
      el.addEventListener("click", (e) => e.stopPropagation());
    });
    card.addEventListener("click", () => {
      window.location.href = detailUrl;
    });

    if (isNew) {
      card.classList.add("live-launch-new");
      setTimeout(() => {
        card.classList.add("live-launch-glow-fade");
        card.classList.remove("live-launch-new");
      }, 3000);
    }

    fragment.appendChild(card);
  });

  liveLaunchFeedContainer.replaceChildren(fragment);
  knownLiveLaunches.clear();
  nextKnown.forEach((v) => knownLiveLaunches.add(v));
}

async function loadLiveLaunches() {
  if (!liveLaunchFeedContainer) return;
  try {
    if (launchRefreshStatusEl) launchRefreshStatusEl.textContent = `(updating ${formatClock()})`;
    const res = await fetch(`${API_BASE_URL}/tokens/recent`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const tokens = Array.isArray(data?.tokens) ? data.tokens.slice(0, 10) : [];
    lastRecentLaunches = tokens;
    const signature = tokens.map((t) => `${t.contract_address}:${t.created_at}:${t.views || 0}`).join("|");
    if (signature === lastLiveLaunchSignature) return;
    lastLiveLaunchSignature = signature;
    renderLiveLaunchCards(tokens);
    if (launchRefreshStatusEl) launchRefreshStatusEl.textContent = `(updated ${formatClock()})`;
  } catch {
    if (!liveLaunchFeedContainer.children.length) {
      renderFeedNotice(liveLaunchFeedContainer, "Live token launches are temporarily unavailable.");
    }
    if (launchRefreshStatusEl) launchRefreshStatusEl.textContent = "(updating)";
  }
}

function renderMoverCards(targetEl, items, isGainer) {
  if (!targetEl) return;
  if (!items.length) {
    renderFeedNotice(targetEl, "No market movers available right now.");
    return;
  }
  if (isGainer) hasRenderedGainers = true;
  else hasRenderedLosers = true;
  targetEl.innerHTML = items
    .slice(0, 8)
    .map((item) => {
      const change = Number(item.changeH24).toFixed(2);
      const chipClass = isGainer ? "text-green-300 bg-green-500/20" : "text-rose-300 bg-rose-500/20";
      const badges = getBadgeMarkup({
        priceChange: Number(item.changeH24),
        launchedAt: item.pairCreatedAt
      });
      return `
      <a href="${item.url || "#"}" target="_blank" rel="noreferrer" class="glass-card rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-all block">
          <div class="flex justify-between items-center mb-2">
              <h4 class="font-semibold">${item.symbol || shortenAddress(item.tokenAddress)}</h4>
              <span class="px-2 py-1 rounded-full text-xs font-semibold ${chipClass}">${change}%</span>
          </div>
          <div class="flex flex-wrap gap-2 mb-2">${badges}</div>
          <p class="text-xs text-gray-400">${item.chainId?.toUpperCase() || "-"} | ${shortenAddress(item.tokenAddress)}</p>
      </a>`;
    })
    .join("");
}

async function updateTopMoversFromProfiles(profiles) {
  if (moversFetchInFlight) return;
  moversFetchInFlight = true;
  try {
    const chainAddressMap = new Map();
    profiles.forEach((p) => {
      const chainId = String(p?.chainId || "").toLowerCase();
      const tokenAddress = String(p?.tokenAddress || "").trim();
      if (!chainId || !tokenAddress) return;
      if (!chainAddressMap.has(chainId)) chainAddressMap.set(chainId, []);
      const arr = chainAddressMap.get(chainId);
      if (!arr.includes(tokenAddress) && arr.length < 15) arr.push(tokenAddress);
    });

    if (!chainAddressMap.size) {
      renderMoverCards(topGainersContainer, [], true);
      renderMoverCards(topLosersContainer, [], false);
      renderHotTokens([]);
      return;
    }

    const requests = Array.from(chainAddressMap.entries()).map(async ([chainId, addresses]) => {
      const url = `${DEXSCREENER_TOKENS_URL}/${chainId}/${addresses.map((a) => encodeURIComponent(a)).join(",")}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    });

    const pairs = (await Promise.all(requests)).flat();
    const bestByToken = new Map();
    pairs.forEach((pair) => {
      const chainId = String(pair?.chainId || "").toLowerCase();
      const tokenAddress = String(pair?.baseToken?.address || "").toLowerCase();
      const changeH24 = Number(pair?.priceChange?.h24);
      const liquidity = Number(pair?.liquidity?.usd || 0);
      const volume24h = Number(pair?.volume?.h24 || 0);
      const txns24h = Number(pair?.txns?.h24?.buys || 0) + Number(pair?.txns?.h24?.sells || 0);
      const priceUsd = Number(pair?.priceUsd || 0);
      const pairCreatedAt = pair?.pairCreatedAt ? Number(pair.pairCreatedAt) : null;
      if (!chainId || !tokenAddress || !Number.isFinite(changeH24)) return;
      const key = `${chainId}:${tokenAddress}`;
      const current = bestByToken.get(key);
      if (!current || liquidity > current.liquidity) {
        const activityScore = volume24h * 0.5 + changeH24 * 0.3 + txns24h * 0.2;
        bestByToken.set(key, {
          chainId,
          tokenAddress,
          symbol: pair?.baseToken?.symbol || "",
          changeH24,
          liquidity,
          url: pair?.url || "",
          icon: pair?.info?.imageUrl || "",
          volume24h,
          txns24h,
          priceUsd,
          pairCreatedAt,
          activityScore
        });
      }
    });

    const movers = Array.from(bestByToken.values());
    const gainers = [...movers].sort((a, b) => b.changeH24 - a.changeH24).slice(0, 8);
    const losers = [...movers].sort((a, b) => a.changeH24 - b.changeH24).slice(0, 8);
    const hot = [...movers].sort((a, b) => b.activityScore - a.activityScore).slice(0, 4);
    lastTopGainers = gainers;
    lastTopLosers = losers;
    lastHotTokens = hot;
    renderMoverCards(topGainersContainer, gainers, true);
    renderMoverCards(topLosersContainer, losers, false);
    renderHotTokens(hot);
    updateDiscoveryGrid();
    updateTicker();
  } catch {
    // keep previous cards
  } finally {
    moversFetchInFlight = false;
  }
}

async function fetchMarketFeed() {
  if (recentFetchInFlight) return;
  recentFetchInFlight = true;
  try {
    const res = await fetch(DEXSCREENER_RECENT_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Dexscreener API ${res.status}`);
    const data = await res.json();
    const profiles = Array.isArray(data) ? data : [];
    recentProfiles = profiles;
    renderRecentCards(recentProfiles);
    updateTopMoversFromProfiles(recentProfiles);
    feedIntervalMs = FEED_REFRESH_MS;
    if (recentStatusEl) recentStatusEl.textContent = "Live";
    updateFeedClock();
  } catch {
    if (recentStatusEl) recentStatusEl.textContent = hasRenderedRecent ? "Live" : "Connecting...";
    feedIntervalMs = FEED_REFRESH_MS;
    if (!hasRenderedRecent) {
      renderFeedNotice(recentCoinsContainer, "Live feed is temporarily unavailable. Retrying...");
    }
    if (!hasRenderedGainers) {
      renderFeedNotice(topGainersContainer, "Live feed is temporarily unavailable. Retrying...");
    }
    if (!hasRenderedLosers) {
      renderFeedNotice(topLosersContainer, "Live feed is temporarily unavailable. Retrying...");
    }
    if (!hasRenderedHot) {
      renderFeedNotice(hotTokensContainer, "Live feed is temporarily unavailable. Retrying...");
    }
  } finally {
    recentFetchInFlight = false;
    scheduleNextFeed();
  }
}

function scheduleNextFeed() {
  if (feedTimerId != null) clearTimeout(feedTimerId);
  feedTimerId = setTimeout(fetchMarketFeed, feedIntervalMs);
}

function startFeed() {
  updateFeedClock();
  setInterval(updateFeedClock, 1000);
  fetchMarketFeed();
}

async function ensureExpectedChain() {
  const cfg = window.LAUNCHPAD_CONFIG;
  const expectedHexChainId = `0x${Number(cfg.chainId).toString(16)}`;
  const ethProvider = getInjectedProviderOrThrow();
  try {
    await ethProvider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: expectedHexChainId }]
    });
  } catch (error) {
    if (error?.code !== 4902) throw error;
    await ethProvider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: expectedHexChainId,
          chainName: cfg.chainName,
          rpcUrls: cfg.rpcUrls,
          nativeCurrency: cfg.nativeCurrency,
          blockExplorerUrls: cfg.blockExplorerBaseUrl ? [cfg.blockExplorerBaseUrl] : []
        }
      ]
    });
  }
}

function parseEventTokenAddress(receipt, contractInstance) {
  for (const log of receipt.logs) {
    try {
      const parsed = contractInstance.interface.parseLog(log);
      if (parsed && parsed.name === "TokenLaunched") return parsed.args.token;
    } catch {
      // ignore
    }
  }
  return null;
}

async function connectWallet() {
  ensureConfig();
  const ethProvider = getInjectedProviderOrThrow();

  await ensureExpectedChain();
  await ethProvider.request({ method: "eth_requestAccounts" });
  provider = new ethers.BrowserProvider(ethProvider);
  signer = await provider.getSigner();
  const account = await signer.getAddress();

  const network = await provider.getNetwork();
  const actualChainId = Number(network.chainId);
  const expectedChainId = Number(window.LAUNCHPAD_CONFIG.chainId);
  if (actualChainId !== expectedChainId) {
    throw new Error(`Wrong network: ${actualChainId}. Switch to ${expectedChainId}.`);
  }

  const shortAddress = `${account.slice(0, 6)}...${account.slice(-4)}`;
  
  // Save to localStorage FIRST
  localStorage.setItem("walletConnected", "true");
  localStorage.setItem("walletAddress", shortAddress);
  
  // Then update state
  state.walletConnected = true;
  state.walletAddress = shortAddress;
  
  // Then update UI
  if (walletAddressEl) walletAddressEl.textContent = shortAddress;
  if (networkLabelEl) networkLabelEl.textContent = `${window.LAUNCHPAD_CONFIG.chainName} (${actualChainId})`;

  contract = new ethers.Contract(window.LAUNCHPAD_CONFIG.factoryAddress, window.LAUNCHPAD_CONFIG.abi, signer);
  launchFeeWei = await contract.launchFeeWei();
  if (launchFeeLabelEl) launchFeeLabelEl.textContent = `${ethers.formatEther(launchFeeWei)} BNB`;
  setStatus("Wallet connected.", false);
}

async function autoConnectWallet() {
  injectedEvmProvider = pickInjectedEvmProvider();
  if (!injectedEvmProvider) {
    state.walletConnected = false;
    return;
  }
  
  try {
    ensureConfig();
    const wasConnected = localStorage.getItem("walletConnected") === "true";
    if (!wasConnected) {
      state.walletConnected = false;
      return;
    }

    // Check if ethereum provider has accounts without requesting permission
    const accounts = await injectedEvmProvider.request({ method: "eth_accounts" });
    if (!accounts || accounts.length === 0) {
      state.walletConnected = false;
      localStorage.removeItem("walletConnected");
      localStorage.removeItem("walletAddress");
      return;
    }

    // Silently reconnect
    provider = new ethers.BrowserProvider(injectedEvmProvider);
    signer = await provider.getSigner();
    const account = await signer.getAddress();

    const network = await provider.getNetwork();
    const actualChainId = Number(network.chainId);
    const expectedChainId = Number(window.LAUNCHPAD_CONFIG.chainId);
    
    if (actualChainId !== expectedChainId) {
      state.walletConnected = false;
      localStorage.removeItem("walletConnected");
      localStorage.removeItem("walletAddress");
      return;
    }

    const shortAddress = `${account.slice(0, 6)}...${account.slice(-4)}`;
    
    // Save to localStorage
    localStorage.setItem("walletConnected", "true");
    localStorage.setItem("walletAddress", shortAddress);
    
    state.walletConnected = true;
    state.walletAddress = shortAddress;
    
    if (walletAddressEl) walletAddressEl.textContent = shortAddress;
    if (networkLabelEl) networkLabelEl.textContent = `${window.LAUNCHPAD_CONFIG.chainName} (${actualChainId})`;

    contract = new ethers.Contract(window.LAUNCHPAD_CONFIG.factoryAddress, window.LAUNCHPAD_CONFIG.abi, signer);
    launchFeeWei = await contract.launchFeeWei();
    if (launchFeeLabelEl) {
      launchFeeLabelEl.textContent = `${ethers.formatEther(launchFeeWei)} BNB`;
    }
  } catch (error) {
    state.walletConnected = false;
    localStorage.removeItem("walletConnected");
    localStorage.removeItem("walletAddress");
  }
}

function updateWalletUI() {
  const storedAddress = localStorage.getItem("walletAddress");
  const isConnected = localStorage.getItem("walletConnected") === "true" && storedAddress;
  
  if (isConnected && walletAddressEl) {
    // Wallet is connected - show address in button
    walletAddressEl.textContent = storedAddress;
  } else {
    // Wallet not connected - reset button
    if (walletAddressEl) walletAddressEl.textContent = "Connect Wallet";
    if (networkLabelEl) networkLabelEl.textContent = "";
    if (launchFeeLabelEl) launchFeeLabelEl.textContent = "";
  }
}

function showModal(tokenAddress, txUrl, tokenUrl) {
  contractAddressEl.textContent = tokenAddress || "N/A";
  txLinkEl.href = txUrl;
  txLinkEl.textContent = txUrl;
  viewTokenLinkEl.href = tokenUrl;

  successModal.classList.remove("hidden");
  successModal.classList.add("flex");
  setTimeout(() => {
    modalContent.classList.remove("scale-95", "opacity-0");
    modalContent.classList.add("scale-100", "opacity-100");
  }, 10);
  lucide.createIcons();
}

function closeModal() {
  modalContent.classList.remove("scale-100", "opacity-100");
  modalContent.classList.add("scale-95", "opacity-0");
  setTimeout(() => {
    successModal.classList.add("hidden");
    successModal.classList.remove("flex");
  }, 300);
}

async function handleLaunch(event) {
  event.preventDefault();
  
  if (!state.token) {
    setStatus("Please login or register to launch a token.");
    showAuthModal();
    return;
  }
  
  // The wallet must still be connected to pay the fee, which the backend will trigger.
  // The backend can't pay on the user's behalf without holding their private key.
  // The 'server.js' code confirms this, as it expects the user to pay the fee.
  // A 'connectWallet' call is still required.
  if (!signer) {
      try {
          await connectWallet();
      } catch (e) {
          setStatus(getReadableError(e));
          return;
      }
  }

  const name = document.getElementById("tokenName").value.trim();
  const symbol = document.getElementById("tokenSymbol").value.trim().toUpperCase();
  const supplyRaw = document.getElementById("totalSupply").value.trim();
  const taxRaw = document.getElementById("tokenTax").value.trim();

  if (!name || !symbol) {
    setStatus("Token name and symbol are required.");
    return;
  }
  if (!Number.isInteger(Number(supplyRaw)) || Number(supplyRaw) <= 0) {
    setStatus("Supply must be a positive whole number.");
    return;
  }
  if (!Number.isInteger(Number(taxRaw)) || Number(taxRaw) < 0 || Number(taxRaw) > 20) {
    setStatus("Tax must be an integer from 0 to 20.");
    return;
  }

  const submitBtn = coinForm.querySelector("button[type='submit']");
  const original = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Awaiting backend...`;
  lucide.createIcons();

  try {
    setStatus("Requesting launch from server... Please wait.", false);
    const launchData = {
        name,
        symbol,
        supply: supplyRaw,
        taxPercentage: taxRaw,
    };
    
    const result = await apiFetch("/tokens/launch", { method: "POST", body: launchData });
    
    setStatus("Launch successful! Token is being indexed.", false);
    
    const explorer = window.LAUNCHPAD_CONFIG.blockExplorerBaseUrl;
    const txUrl = `${explorer}/tx/${result.txHash}`;
    const tokenUrl = result.tokenAddress ? `${explorer}/token/${result.tokenAddress}` : txUrl;

    showModal(result.tokenAddress || "N/A", txUrl, tokenUrl);

    // Refresh dashboard token list (server is the source of truth)
    fetchAndRenderUserTokens();

    const patch = {
      chainId: "bsc",
      tokenAddress: result.tokenAddress || "N/A",
      icon: uploadedImage || "",
      description: `Newly launched ${name} (${symbol})`,
      url: tokenUrl
    };
    recentProfiles.unshift(patch);
    renderRecentCards(recentProfiles);

    coinForm.reset();
    uploadedImage = null;
    previewLogo.innerHTML = "R";
    updatePreview();
  } catch (error) {
    console.error("Launch error:", error);
    const msg = error?.response?.data?.error || error?.response?.data || error?.message || "Unknown error";
    alert(typeof msg === "string" ? msg : JSON.stringify(msg));
    setStatus(getReadableError(error) || "An unknown error occurred during launch.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = original;
    lucide.createIcons();
  }
}

function init() {
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Bind original functionality
  bindThemeButtons();
  bindLogoUpload();
  ["tokenName", "tokenSymbol", "totalSupply"].forEach((id) => {
    document.getElementById(id).addEventListener("input", updatePreview);
  });
  updatePreview();

  connectWalletBtn.addEventListener("click", async () => {
    try {
      await connectWallet();
    } catch (error) {
      setStatus(getReadableError(error));
    }
  });

  coinForm.addEventListener("submit", handleLaunch);
  modalOverlay.addEventListener("click", closeModal);
  closeModalBtn.addEventListener("click", closeModal);

  // Bind new auth functionality
  showAuthModalBtn.addEventListener("click", showAuthModal);
  authCloseBtn.addEventListener("click", hideAuthModal);
  authModalOverlay.addEventListener("click", hideAuthModal);
  logoutBtn.addEventListener("click", handleLogout);
  loginForm.addEventListener("submit", handleLogin);
  registerForm.addEventListener("submit", handleRegister);

  authTabLogin.addEventListener("click", () => {
      authTabLogin.classList.add("border-purple-500", "text-white");
      authTabLogin.classList.remove("border-transparent", "text-gray-500");
      authTabRegister.classList.add("border-transparent", "text-gray-500");
      authTabRegister.classList.remove("border-purple-500", "text-white");
      loginForm.classList.remove("hidden");
      registerForm.classList.add("hidden");
  });

  authTabRegister.addEventListener("click", () => {
      authTabRegister.classList.add("border-purple-500", "text-white");
      authTabRegister.classList.remove("border-transparent", "text-gray-500");
      authTabLogin.classList.add("border-transparent", "text-gray-500");
      authTabLogin.classList.remove("border-purple-500", "text-white");
      registerForm.classList.remove("hidden");
      loginForm.classList.add("hidden");
  });
  
  // Bind dashboard functionality
  dailyClaimBtn.addEventListener("click", handleDailyClaim);
  adClaimBtn.addEventListener("click", handleAdClaim);
  copyReferralBtn.addEventListener("click", copyReferralCode);

  // Initial setup
  checkAuthState();
  // Restore wallet state from localStorage first
  if (localStorage.getItem("walletConnected") === "true") {
    state.walletConnected = true;
    state.walletAddress = localStorage.getItem("walletAddress");
  }
  updateWalletUI();
  // Then try to auto-reconnect if it was previously connected
  autoConnectWallet().catch(() => {
    // If auto-reconnect fails, at least show the stored address
    updateWalletUI();
  });
  startFeed();
  loadLiveLaunches();
  setInterval(loadLiveLaunches, 5000);
  fetchAndRenderLeaderboards();
  setInterval(fetchAndRenderLeaderboards, 30000);
  setInterval(updateTicker, 20000);
  setInterval(rotateSocialProof, 15000);
  initActivityTracking();
  initEngagementObservers();
  initScrollTrendingPrompt();
  initLazyAds();
  refreshStreakUI();
  updateDiscoveryGrid();
  updateTicker();
  
  // Get referral from URL
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref');
  if (refCode) {
      document.getElementById('register-referral').value = refCode;
  }
}

init();
