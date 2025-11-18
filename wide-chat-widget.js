// wide-chat-widget.js
(() => {
  const currentScript = document.currentScript;

  const CFG = {
    endpoint: currentScript?.dataset.endpoint || "",
    title: currentScript?.dataset.title || "Canon Product Assistant",
    primary: currentScript?.dataset.primary || "#0060df", // CTA blue
    accent: currentScript?.dataset.accent || "#ffffff",
    placeholder: currentScript?.dataset.placeholder || "Search Canon Product Catalogue",
    chatId: currentScript?.dataset.chatId || null,
    pageUrl: currentScript?.dataset.pageUrl || window.location.href,
    maxWidth: currentScript?.dataset.maxWidth || "1100px",
  };

  // ---------- language state ----------
  const LANG_KEY = `chatWidget:lang:${CFG.chatId || "default"}`;
  const SUPPORTED_LANGS = ["en", "de", "fr"];

  let currentLang = (() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (SUPPORTED_LANGS.includes(saved)) return saved;
    } catch {}
    return "en";
  })();

  function setLanguage(lang) {
    if (!SUPPORTED_LANGS.includes(lang)) return;
    currentLang = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch {}
    updateLanguageButtons();
  }

  // ---------- IDs & keys ----------
  if (!CFG.chatId) {
    const makeId = () =>
      crypto.randomUUID?.() ||
      (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
    CFG.chatId = localStorage.getItem("wideChatWidgetChatId") || makeId();
    localStorage.setItem("wideChatWidgetChatId", CFG.chatId);
  }
  const STORAGE_KEY = `wideChatWidget:transcript:${CFG.chatId}`;
  let comparesHistory = [];

  // ---------- styles ----------
  if (!document.getElementById("canon-wide-chat-widget-styles-v2")) {
    const style = document.createElement("style");
    style.id = "canon-wide-chat-widget-styles-v2";
    style.textContent = `
      .cwc-wide-section {
        box-sizing: border-box;
        width: 100%;
        background: #f5f5f7;
        display: flex;
        justify-content: center;
        padding: 40px 16px 56px;
        margin-top: 12vh; /* a bit higher than before */
      }

      @media (max-width: 768px) {
        .cwc-wide-section {
          margin-top: 8vh;
          padding: 28px 12px 40px;
        }
      }

      .cwc-wide-root {
        width: 100%;
        max-width: ${CFG.maxWidth};
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      }

      .cwc-wide-header-row {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        margin-bottom: 4px;
      }

      .cwc-wide-title {
        font-size: 32px;
        font-weight: 700;
        margin: 0;
        color: #111827;
        text-align: center;
        flex: 1;
      }

      .cwc-wide-subtitle {
        font-size: 14px;
        color: #6b7280;
        margin-bottom: 14px;
        text-align: center;
      }

      .cwc-wide-lang-switch {
        position: absolute;
        right: 0;
        bottom: 0;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: rgba(15,23,42,0.04);
        border-radius: 999px;
        padding: 3px;
      }

      .cwc-wide-lang-btn {
        border: none;
        background: transparent;
        cursor: pointer;
        font-size: 12px;
        padding: 4px 8px;
        border-radius: 999px;
        opacity: 0.6;
      }
      .cwc-wide-lang-btn.active {
        opacity: 1;
        background: rgba(15,23,42,0.08);
      }

      .cwc-wide-search-row {
        display: flex;
        gap: 8px;
        align-items: stretch;
        margin-bottom: 4px;
      }

      .cwc-wide-search-wrap {
        position: relative;
        flex: 1 1 auto;
        display: flex;
        align-items: center;
        background: #ffffff;
        border-radius: 999px;
        border: 1px solid #d1d5db;
        padding: 0 16px;
        box-shadow: 0 2px 4px rgba(15,23,42,0.08);
      }

      .cwc-wide-search-input {
        border: none;
        outline: none;
        flex: 1;
        font-size: 15px;
        padding: 12px 8px;
        background: transparent;
        color: #111827;
      }

      .cwc-wide-search-input::placeholder {
        color: #9ca3af;
      }

      .cwc-wide-search-icon {
        border: none;
        background: none;
        cursor: pointer;
        padding: 0;
        margin-left: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        color: #9ca3af;
      }

      .cwc-wide-search-submit {
        flex: 0 0 auto;
        border-radius: 999px;
        border: none;
        padding: 0 22px;
        font-size: 14px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        cursor: pointer;
        background: ${CFG.primary};
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
        box-shadow: 0 4px 10px rgba(0,0,0,0.18);
      }

      .cwc-wide-search-submit:disabled {
        opacity: 0.7;
        cursor: default;
      }

      /* container has zero height so dropdown *overlaps* chat box */
      .cwc-wide-suggestions {
        position: relative;
        width: 100%;
        height: 0;
      }

      .cwc-wide-suggestions-panel {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        border-radius: 12px;
        background: #f3f4f6;
        border: 1px solid #e5e7eb;
        padding: 8px 0;
        max-height: 220px;
        overflow-y: auto;
        box-shadow: 0 12px 24px rgba(15,23,42,0.12);
        z-index: 5;
      }

      .cwc-wide-suggestion {
        padding: 8px 16px;
        font-size: 14px;
        color: #4b5563;
        cursor: pointer;
      }

      .cwc-wide-suggestion:hover {
        background: #e5e7eb;
      }

      .cwc-wide-results {
        margin-top: 18px;
        border-radius: 18px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        padding: 16px 16px 12px;
        min-height: 260px;
        max-height: 420px;
        overflow-y: auto;
        box-shadow: 0 10px 24px rgba(15,23,42,0.10);
        font-size: 14px;
        color: #111827;
      }

      .cwc-wide-message {
        margin-bottom: 12px;
        line-height: 1.5;
      }

      .cwc-wide-message-inner {
        display: inline-flex;
        align-items: flex-start;
        gap: 8px;
        max-width: 100%;
      }

      .cwc-wide-message-user {
        text-align: right;
      }
      .cwc-wide-message-user .cwc-wide-message-inner {
        flex-direction: row-reverse;
      }

      /* circular avatars */
      .cwc-wide-avatar {
        flex: 0 0 auto;
        width: 26px;
        height: 26px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .cwc-wide-avatar-ai {
        background: #e5e7eb;
        color: #4b5563;
      }
      .cwc-wide-avatar-you {
        background: ${CFG.primary};
        color: #ffffff;
      }

      .cwc-wide-bubble {
        display: inline-block;
        padding: 8px 12px;
        border-radius: 16px;
        max-width: 72%;
      }
      .cwc-wide-bubble-user {
        background: ${CFG.primary};    /* blue, not black */
        color: #f9fafb;
        border-bottom-right-radius: 4px;
      }
      .cwc-wide-bubble-bot {
        background: #f3f4f6;
        color: #111827;
        border-bottom-left-radius: 4px;
      }

      .cwc-wide-links {
        margin-top: 6px;
        font-size: 12px;
      }

      .cwc-wide-link {
        display: inline-block;
        margin-right: 8px;
        margin-top: 4px;
        padding: 4px 8px;
        border-radius: 999px;
        background: #eef2ff;
        color: #1d4ed8;
        text-decoration: none;
        max-width: 100%;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
      }

      .cwc-wide-typing {
        display: none;
        margin: 4px 0 6px 4px;
        align-items: center;
        gap: 4px;
      }
      .cwc-wide-typing.show {
        display: inline-flex;
      }
      .cwc-wide-typing span {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: ${CFG.primary};
        opacity: 0.3;
        animation: cwc-wide-typing-bounce 1.1s infinite ease-in-out;
      }
      .cwc-wide-typing span:nth-child(2) { animation-delay: 0.15s; }
      .cwc-wide-typing span:nth-child(3) { animation-delay: 0.3s; }

      @keyframes cwc-wide-typing-bounce {
        0%,80%,100% { transform: translateY(0); opacity: .4; }
        40% { transform: translateY(-3px); opacity: 1; }
      }

      .cwc-wide-compare-block {
        margin: 4px 0 10px;
        padding: 10px 10px 8px;
        background: #ffffff;
        border-radius: 12px;
        border: 1px solid #e2e4ea;
        font-size: 12px;
      }
      .cwc-wide-compare-header {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 6px;
      }
      .cwc-wide-compare-title {
        font-size: 13px;
        font-weight: 600;
        color: #111827;
      }
      .cwc-wide-compare-products {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .cwc-wide-compare-prod-name {
        font-weight: 600;
        font-size: 12px;
        color: #111827;
        margin-bottom: 2px;
      }
      .cwc-wide-compare-prod-tagline {
        font-size: 11px;
        color: #4b5563;
        margin-bottom: 4px;
      }
      .cwc-wide-compare-prod-pill {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 999px;
        border: 1px solid #e5e7eb;
        font-size: 10px;
        color: #6b7280;
        background: #f9fafb;
      }
      .cwc-wide-compare-rows {
        border-top: 1px solid #e5e7eb;
        margin-top: 6px;
        padding-top: 6px;
      }
      .cwc-wide-compare-row {
        padding: 6px 0;
        border-bottom: 1px solid #f3f4f6;
      }
      .cwc-wide-compare-row:last-child {
        border-bottom: none;
      }
      .cwc-wide-compare-label {
        font-size: 11px;
        font-weight: 500;
        color: #374151;
        margin-bottom: 3px;
      }
      .cwc-wide-compare-label strong {
        font-weight: 600;
        color: #111827;
      }
      .cwc-wide-compare-values {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        font-size: 11px;
        color: #111827;
      }
      .cwc-wide-compare-value {
        white-space: pre-wrap;
      }

      @media (max-width: 640px) {
        .cwc-wide-title {
          font-size: 24px;
        }
        .cwc-wide-search-row {
          flex-direction: column;
        }
        .cwc-wide-search-submit {
          width: 100%;
          height: 40px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ---------- DOM ----------
  const section = document.createElement("section");
  section.className = "cwc-wide-section";

  section.innerHTML = `
    <div class="cwc-wide-root">
      <div class="cwc-wide-header-row">
        <h1 class="cwc-wide-title">Ask Canon AI to help</h1>
        <div class="cwc-wide-lang-switch" data-lang-switch>
          <button class="cwc-wide-lang-btn" data-lang="en">EN</button>
          <button class="cwc-wide-lang-btn" data-lang="de">DE</button>
          <button class="cwc-wide-lang-btn" data-lang="fr">FR</button>
        </div>
      </div>
      <div class="cwc-wide-subtitle">Search Canon Product Catalogue</div>

      <div class="cwc-wide-search-row">
        <div class="cwc-wide-search-wrap">
          <input
            type="text"
            class="cwc-wide-search-input"
            placeholder="${escapeHtml(CFG.placeholder)}"
            aria-label="Search Canon Product Catalogue"
          />
          <button class="cwc-wide-search-icon" aria-label="Search">
            &#128269;
          </button>
        </div>
        <button class="cwc-wide-search-submit">SHOW RESULTS</button>
      </div>

      <div class="cwc-wide-suggestions"></div>

      <div class="cwc-wide-results" aria-live="polite">
        <div class="cwc-wide-message">
          <div class="cwc-wide-message-inner">
            <div class="cwc-wide-avatar cwc-wide-avatar-ai">AI</div>
            <div class="cwc-wide-bubble cwc-wide-bubble-bot">
              Hi! Ask me about Canon cameras, lenses, printers, or ink compatibility and I’ll help you find the right products.
            </div>
          </div>
        </div>
      </div>
      <div class="cwc-wide-typing" data-typing>
        <span></span><span></span><span></span>
      </div>
    </div>
  `;

  const parent = currentScript.parentNode;
  if (parent) {
    parent.insertBefore(section, currentScript.nextSibling);
  } else {
    document.body.appendChild(section);
  }

  // ---------- refs ----------
  const root = section.querySelector(".cwc-wide-root");
  const inputEl = root.querySelector(".cwc-wide-search-input");
  const iconBtn = root.querySelector(".cwc-wide-search-icon");
  const submitBtn = root.querySelector(".cwc-wide-search-submit");
  const suggestionsRoot = root.querySelector(".cwc-wide-suggestions");
  const resultsEl = root.querySelector(".cwc-wide-results");
  const typingEl = root.querySelector("[data-typing]");
  const langButtons = root.querySelectorAll(".cwc-wide-lang-btn");

  function updateLanguageButtons() {
    langButtons.forEach((btn) => {
      const lang = btn.getAttribute("data-lang");
      btn.classList.toggle("active", lang === currentLang);
    });
  }
  updateLanguageButtons();
  langButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const lang = btn.getAttribute("data-lang");
      setLanguage(lang);
    });
  });

  // ---------- suggestions ----------
  const suggestions = [
    "Recommend a beginner-friendly Canon camera",
    "I’m looking for a Canon printer for home use",
    "Which ink is compatible with my Canon inkjet printer?",
    "Compare Canon EOS R5 with EOS R6",
    "Help me choose a Canon lens for travel photography",
    "Show Canon printers suitable for a small office"
  ];

  let suggestionsPanel = null;
  let isRequestInFlight = false;

  function renderSuggestions() {
    if (suggestionsPanel) suggestionsPanel.remove();
    suggestionsPanel = document.createElement("div");
    suggestionsPanel.className = "cwc-wide-suggestions-panel";

    suggestions.forEach((text) => {
      const item = document.createElement("div");
      item.className = "cwc-wide-suggestion";
      item.textContent = text;
      item.addEventListener("click", () => {
        inputEl.value = text;
        hideSuggestions();
        triggerSearch();
      });
      suggestionsPanel.appendChild(item);
    });

    suggestionsRoot.appendChild(suggestionsPanel);
  }

  function hideSuggestions() {
    if (suggestionsPanel) {
      suggestionsPanel.remove();
      suggestionsPanel = null;
    }
  }

  // ---------- transcript ----------
  function currentTranscriptArray() {
    const arr = [];
    resultsEl.querySelectorAll(".cwc-wide-message").forEach((el) => {
      const role = el.classList.contains("cwc-wide-message-user") ? "user" : "bot";
      const bubble = el.querySelector(".cwc-wide-bubble");
      const text = bubble ? bubble.textContent || "" : "";
      arr.push({ role, text });
    });
    return arr;
  }

  function persistTranscript() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentTranscriptArray()));
    } catch {}
  }

  function renderTranscript(arr) {
    resultsEl.innerHTML = "";
    for (const m of arr) {
      appendMessage(m.role, m.text);
    }
  }

  function hydrate() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : null;
      if (Array.isArray(arr) && arr.length) {
        renderTranscript(arr);
        return;
      }
    } catch {}
    // default greeting already rendered
  }
  hydrate();

  // ---------- messages ----------
  function appendMessage(role, text, links) {
    const message = document.createElement("div");
    message.className =
      "cwc-wide-message" +
      (role === "user" ? " cwc-wide-message-user" : "");

    const inner = document.createElement("div");
    inner.className = "cwc-wide-message-inner";

    const avatar = document.createElement("div");
    avatar.className =
      "cwc-wide-avatar " +
      (role === "user"
        ? "cwc-wide-avatar-you"
        : "cwc-wide-avatar-ai");
    avatar.textContent = role === "user" ? "YOU" : "AI";

    const bubble = document.createElement("div");
    bubble.className =
      "cwc-wide-bubble " +
      (role === "user"
        ? "cwc-wide-bubble-user"
        : "cwc-wide-bubble-bot");
    bubble.textContent = normalizeText(text);

    inner.appendChild(avatar);
    inner.appendChild(bubble);
    message.appendChild(inner);

    if (role === "bot" && Array.isArray(links) && links.length) {
      const linksWrap = document.createElement("div");
      linksWrap.className = "cwc-wide-links";
      links.forEach((l) => {
        if (!l || !l.url || !l.label) return;
        const a = document.createElement("a");
        a.className = "cwc-wide-link";
        a.href = l.url;
        a.target = "_blank";
        a.rel = "noreferrer";
        a.textContent = l.label.replace(/^https?:\/\//, "");
        linksWrap.appendChild(a);
      });
      message.appendChild(linksWrap);
    }

    resultsEl.appendChild(message);
    resultsEl.scrollTop = resultsEl.scrollHeight;
    persistTranscript();
  }

  function addComparison(compare) {
    if (!compare || !Array.isArray(compare.products) || compare.products.length !== 2) {
      return;
    }
    const [p1, p2] = compare.products;
    if (p1.family && p2.family && p1.family !== p2.family) return;

    const rowsRaw = Array.isArray(compare.rows) ? compare.rows.slice() : [];
    rowsRaw.sort((a, b) => (a.importance ?? 999) - (b.importance ?? 999));

    const container = document.createElement("div");
    container.className = "cwc-wide-compare-block";

    const title =
      compare.title ||
      `${p1.name || "Product 1"} vs ${p2.name || "Product 2"}`;

    const safe = (v) => escapeHtml(v ?? "");

    const rowsHTML = rowsRaw
      .map((row) => {
        const label = safe(row.label || row.key || "");
        const v1 = safe((row.values && row.values[0]) || "");
        const v2 = safe((row.values && row.values[1]) || "");
        if (!label && !v1 && !v2) return "";
        return `
        <div class="cwc-wide-compare-row">
          <div class="cwc-wide-compare-label"><strong>${label}</strong></div>
          <div class="cwc-wide-compare-values">
            <div class="cwc-wide-compare-value">${v1}</div>
            <div class="cwc-wide-compare-value">${v2}</div>
          </div>
        </div>`;
      })
      .join("");

    container.innerHTML = `
      <div class="cwc-wide-compare-header">
        <div class="cwc-wide-compare-title">${safe(title)}</div>
        <div class="cwc-wide-compare-products">
          <div>
            <div class="cwc-wide-compare-prod-name">${safe(p1.name || "Product 1")}</div>
            ${p1.tagline ? `<div class="cwc-wide-compare-prod-tagline">${safe(p1.tagline)}</div>` : ""}
            ${p1.family ? `<div class="cwc-wide-compare-prod-pill">${safe(p1.family)}</div>` : ""}
          </div>
          <div>
            <div class="cwc-wide-compare-prod-name">${safe(p2.name || "Product 2")}</div>
            ${p2.tagline ? `<div class="cwc-wide-compare-prod-tagline">${safe(p2.tagline)}</div>` : ""}
            ${p2.family ? `<div class="cwc-wide-compare-prod-pill">${safe(p2.family)}</div>` : ""}
          </div>
        </div>
      </div>
      <div class="cwc-wide-compare-rows">
        ${rowsHTML}
      </div>
    `;

    resultsEl.appendChild(container);
    resultsEl.scrollTop = resultsEl.scrollHeight;
    persistTranscript();
  }

  // ---------- typing / loading ----------
  function setThinking(on) {
    typingEl.classList.toggle("show", !!on);
    resultsEl.scrollTop = resultsEl.scrollHeight;
  }

  function setLoading(isLoading) {
    isRequestInFlight = isLoading;
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? "Working…" : "SHOW RESULTS";
  }

  // ---------- request / response ----------
  async function triggerSearch() {
    const query = (inputEl.value || "").trim();
    if (!query || isRequestInFlight) return;

    // clear the search box *after* capturing the query
    inputEl.value = "";
    hideSuggestions();

    appendMessage("user", query);
    setLoading(true);
    setThinking(true);

    if (!CFG.endpoint) {
      appendMessage(
        "bot",
        "Configuration error: missing endpoint. Please contact the site administrator."
      );
      setLoading(false);
      setThinking(false);
      return;
    }

    try {
      const res = await fetch(CFG.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Chat-Id": CFG.chatId,
        },
        body: JSON.stringify({
          message: query,
          chatId: CFG.chatId,
          lang: currentLang,
          pageUrl: CFG.pageUrl,
        }),
        credentials: "omit",
      });

      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const raw = ct.includes("application/json")
        ? await res.json()
        : await res.text();
      const payload =
        typeof raw === "string" ? tryParseJSON(raw) ?? raw : raw;

      handleWebhookResponse(payload);
    } catch (err) {
      console.error("[WideChatWidget] fetch error", err);
      appendMessage("bot", "Sorry, I couldn’t reach the server.");
    } finally {
      setThinking(false);
      setLoading(false);
    }
  }

  function handleWebhookResponse(payload) {
    try {
      if (typeof payload === "string") {
        const parsed = tryParseJSON(payload);
        if (parsed) return handleWebhookResponse(parsed);
        appendMessage("bot", payload);
        return;
      }

      const text =
        payload.answer ||
        payload.output ||
        payload.message ||
        payload.text ||
        "OK";

      appendMessage("bot", text, extractLinks(payload, text));

      if (payload.rich && payload.rich.compare) {
        comparesHistory.push(payload.rich.compare);
        addComparison(payload.rich.compare);
      }

      const url = payload.redirect || (payload.rich && payload.rich.redirect);
      if (url && typeof url === "string") {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      console.warn("[WideChatWidget] parse error; showing raw.");
      appendMessage("bot", String(payload));
    }
  }

  function extractLinks(payload, text) {
    const links =
      payload.links ||
      (payload.rich && payload.rich.buttons) ||
      extractLinksFromText(text);
    return Array.isArray(links) ? links : [];
  }

  // ---------- events ----------
  inputEl.addEventListener("focus", () => {
    renderSuggestions();
  });
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      triggerSearch();
    }
  });

  iconBtn.addEventListener("click", (e) => {
    e.preventDefault();
    triggerSearch();
  });

  submitBtn.addEventListener("click", (e) => {
    e.preventDefault();
    triggerSearch();
  });

  document.addEventListener("click", (e) => {
    if (!section.contains(e.target)) {
      hideSuggestions();
    }
  });

  // ---------- utils ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[m]),
    );
  }

  function normalizeText(s) {
    return String(s)
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      .replace(/<\/?[^>]+>/g, "");
  }

  function tryParseJSON(s) {
    const t = String(s).trim();
    if (!t || (t[0] !== "{" && t[0] !== "[")) return null;
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  }

  function extractLinksFromText(text) {
    const out = [];
    if (!text) return out;
    const re = /\bhttps?:\/\/[^\s<>"')]+/gi;
    const seen = new Set();
    let m;
    while ((m = re.exec(text))) {
      const url = m[0];
      if (seen.has(url)) continue;
      seen.add(url);
      let label = url.replace(/^https?:\/\//, "");
      try {
        label = new URL(url).hostname.replace(/^www\./, "");
      } catch {}
      out.push({ label, url });
    }
    return out;
  }
})();
