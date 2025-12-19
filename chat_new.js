(() => {
  const currentScript = document.currentScript;

  const CFG = {
    endpoint: currentScript?.dataset.endpoint || "",
    title: currentScript?.dataset.title || "Support Assistant",
    primary: currentScript?.dataset.primary || "#0b5fff",
    accent: currentScript?.dataset.accent || "#e8f0ff",
    position: (currentScript?.dataset.position || "bottom-right").toLowerCase(),
    startOpen: (currentScript?.dataset.startOpen || "false").toLowerCase() === "true",
    placeholder: currentScript?.dataset.placeholder || "Ask me anything…",
    chatId: currentScript?.dataset.chatId || null,
    draggable: (currentScript?.dataset.draggable || "true").toLowerCase() !== "false",
    pageUrl: currentScript?.dataset.pageUrl || window.location.href,
    showLinkButtons: (currentScript?.dataset.showLinkButtons || "true").toLowerCase() !== "false",
    autoExtractUrls: (currentScript?.dataset.autoExtractUrls || "true").toLowerCase() !== "false",
  };

  // ---- IDs & keys ----
  if (!CFG.chatId) {
    const fromUrl = new URLSearchParams(location.search).get("chatId");
    const makeId = () =>
      crypto.randomUUID?.() ||
      (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
    CFG.chatId = fromUrl || localStorage.getItem("chatWidgetChatId") || makeId();
    localStorage.setItem("chatWidgetChatId", CFG.chatId);
  }

  const STORAGE_KEY = `chatWidget:transcript:${CFG.chatId}`;
  const OPEN_KEY = `chatWidget:open:${CFG.chatId}`;
  const POS_KEY = `chatWidget:pos:${CFG.chatId}:v2`;
  const SIZE_KEY = `chatWidget:size:${CFG.chatId}:v2`;
  const LANG_KEY = `chatWidget:lang:${CFG.chatId}`;
  const LAST_PREVIEW_URL_KEY = `chatWidget:lastPreviewUrl:${CFG.chatId}`;
  let comparesHistory = [];

  // ---- language ----
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

  // ---- host ----
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = "2147483646";
  host.style.pointerEvents = "none";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

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

  function tryParseJSON(s) {
    const t = String(s).trim();
    if (!t || (t[0] !== "{" && t[0] !== "[")) return null;
    try { return JSON.parse(t); } catch { return null; }
  }

  function normalizeText(s) {
    return String(s)
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      .replace(/<\/?[^>]+>/g, "");
  }

  function safeUrl(u) {
    try {
      const url = new URL(u, window.location.href);
      if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
      return null;
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
      const u = safeUrl(url);
      if (!u || seen.has(u)) continue;
      seen.add(u);
      let label = u.replace(/^https?:\/\//, "");
      try { label = new URL(u).hostname.replace(/^www\./, ""); } catch {}
      out.push({ label, url: u });
    }
    return out;
  }

  // ---- UI ----
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }

      .bubble{
        pointer-events:auto;
        position: fixed;
        width:56px;height:56px;
        border-radius:50%;
        background:${CFG.primary};
        display:grid;place-items:center;
        color:#fff;font-weight:700;
        cursor:pointer;
        box-shadow:0 8px 28px rgba(0,0,0,.16),0 2px 8px rgba(0,0,0,.12);
        border:2px solid #ffffff;
        z-index: 2147483646;
      }
      .bubble.br { right:20px; bottom:20px; }
      .bubble.bl { left:20px; bottom:20px; }

      .panel{
        pointer-events:auto;
        position: fixed;
        width:360px; height:520px;
        max-width:calc(100vw - 40px);
        max-height:calc(100vh - 120px);
        background:#ffffff;
        border-radius:16px;
        overflow:hidden;
        display:none;
        box-shadow:0 14px 45px rgba(0,0,0,.18),0 10px 18px rgba(0,0,0,.12);
        will-change: left, top, width, height;
        min-width:320px; min-height:360px;
        z-index: 2147483646;
      }
      .panel.open{ display:flex; flex-direction:column; }

      /* Resize handles */
      .resize-handle{ position:absolute; z-index:5; }
      .resize-handle.top{ top:0; left:10px; right:10px; height:10px; cursor:ns-resize; }
      .resize-handle.left{ left:0; top:10px; bottom:10px; width:10px; cursor:ew-resize; }
      .resize-handle.corner{ top:0; left:0; width:14px; height:14px; cursor:nwse-resize; }
      .resize-handle:hover{ background:rgba(0,0,0,.03); }

      .header{
        background:#041E42;
        color:#fff;
        padding:10px 14px;
        display:flex;
        align-items:center;
        gap:8px;
        ${CFG.draggable ? `cursor: grab; user-select:none; touch-action:none;` : ``}
      }
      .header.dragging{ cursor: grabbing; }
      .title{ font-weight:700; font-size:14px; letter-spacing:0.02em; flex:1; }
      .controls{ display:flex; gap:6px; align-items:center; }
      .hbtn{
        background:rgba(255,255,255,.12);
        color:#fff;
        border:0;
        border-radius:999px;
        padding:4px 8px;
        cursor:pointer;
        display:flex;
        align-items:center;
        justify-content:center;
      }

      .lang-switch{ display:flex; align-items:center; gap:4px; margin-right:4px; }
      .lang-btn{
        border:none;
        background:transparent;
        cursor:pointer;
        font-size:14px;
        line-height:1;
        opacity:0.6;
        padding:4px;
        border-radius:6px;
      }
      .lang-btn.active{
        opacity:1;
        background:rgba(255,255,255,0.18);
      }

      .body{
        background:#f5f5f7;
        display:flex;
        flex-direction:column;
        min-height:0;
        height:100%;
        position: relative;
      }

      .messages{
        padding:12px 12px 76px;
        overflow:auto;
        flex:1;
      }

      .msg{
        max-width:85%;
        padding:10px 12px;
        border-radius:14px;
        margin:6px 0;
        white-space:pre-wrap;
        word-break:break-word;
        line-height:1.4;
        font-size:13px;
      }
      .msg.user{ margin-left:auto; background:${CFG.primary}; color:#ffffff; }
      .msg.bot{ background:${CFG.accent}; color:#111827; border:1px solid #e2e4ea; }

      /* Link buttons area */
      .buttons{
        display:none;
        padding: 0 12px 8px;
        gap: 8px;
        flex-wrap: wrap;
      }
      .buttons.show{ display:flex; }
      .link-btn{
        display:inline-flex;
        align-items:center;
        border:1px solid rgba(17,24,39,.12);
        background:#ffffff;
        color:#111827;
        border-radius:999px;
        padding:8px 12px;
        cursor:pointer;
        font-size:12px;
        max-width:100%;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      .link-btn:hover{ background: rgba(0,0,0,.03); }

      .typing-indicator{
        display:none;
        margin:4px 0 6px 16px;
        padding:0;
        border:none;
        background:transparent;
        width:auto;
        align-items:center;
        gap:4px;
      }
      .typing-indicator.show{ display:inline-flex; }
      .typing-indicator span{
        width:8px;height:8px;border-radius:50%;
        background:${CFG.primary};
        opacity:0.3;
        display:inline-block;
        animation: typing-bounce 1.1s infinite ease-in-out;
      }
      .typing-indicator span:nth-child(2){ animation-delay:0.15s; }
      .typing-indicator span:nth-child(3){ animation-delay:0.3s; }
      @keyframes typing-bounce{
        0%,80%,100%{ transform:translateY(0); opacity:.4; }
        40%{ transform:translateY(-3px); opacity:1; }
      }

      /* Comparison block */
      .compare-block{
        margin: 8px 0 10px;
        padding: 10px 10px 8px;
        background:#ffffff;
        border-radius:12px;
        border:1px solid #e2e4ea;
        font-size:12px;
      }
      .compare-header{ display:flex; flex-direction:column; gap:6px; margin-bottom:6px; }
      .compare-title{ font-size:13px; font-weight:600; color:#111827; }
      .compare-products{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .compare-prod-name{ font-weight:600; font-size:12px; color:#111827; margin-bottom:2px; }
      .compare-prod-tagline{ font-size:11px; color:#4b5563; margin-bottom:4px; }
      .compare-prod-pill{
        display:inline-block;
        padding:2px 6px;
        border-radius:999px;
        border:1px solid #e5e7eb;
        font-size:10px;
        color:#6b7280;
        background:#f9fafb;
      }
      .compare-rows{ border-top:1px solid #e5e7eb; margin-top:6px; padding-top:6px; }
      .compare-row{ padding:6px 0; border-bottom:1px solid #f3f4f6; }
      .compare-row:last-child{ border-bottom:none; }
      .compare-label{ font-size:11px; font-weight:600; color:#111827; margin-bottom:3px; }
      .compare-values{ display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:11px; color:#111827; }
      .compare-value{ white-space:pre-wrap; }

      .footer{
        border-top:1px solid rgba(0,0,0,.06);
        background:#ffffff;
        display:flex;
        align-items:flex-end;
        gap:8px;
        padding:10px;
      }
      .textarea{
        flex:1;
        min-height:40px;
        max-height:160px;
        overflow:auto;
        border:1px solid #d2d7e0;
        border-radius:999px;
        padding:10px 14px;
        outline:none;
        resize:none;
        font-size:13px;
        background:#f9fafb;
      }
      .textarea:focus{
        border-color:${CFG.primary};
        background:#ffffff;
        box-shadow:0 0 0 1px ${CFG.primary}1a;
      }
      .send{
        background:${CFG.primary};
        color:#fff;
        border:none;
        border-radius:999px;
        padding:9px 13px;
        cursor:pointer;
        font-weight:600;
        font-size:13px;
        display:flex;
        align-items:center;
        justify-content:center;
      }
      .send:disabled{ opacity:.6; cursor:not-allowed; }

      /* Webview overlay */
      .webview{
        position:absolute;
        inset:0;
        background:#ffffff;
        display:none;
        flex-direction:column;
        z-index: 50;
      }
      .webview.show{ display:flex; }
      .webview-topbar{
        height:44px;
        display:flex;
        align-items:center;
        gap:8px;
        padding: 8px;
        border-bottom: 1px solid rgba(0,0,0,.08);
        background:#ffffff;
      }
      .wv-btn{
        border:1px solid rgba(0,0,0,.10);
        background:#ffffff;
        border-radius: 10px;
        padding: 6px 10px;
        cursor:pointer;
        font-weight:700;
        font-size:12px;
        color:#111827;
      }
      .wv-btn:hover{ background: rgba(0,0,0,.03); }
      .wv-url{
        flex:1;
        font-size:12px;
        color: rgba(17,24,39,.60);
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        padding: 0 6px;
      }
      .wv-frame{
        flex:1;
        border:0;
        width:100%;
        height:100%;
        background:#fff;
      }
      .wv-note{
        padding: 8px 10px;
        font-size: 11px;
        color: rgba(17,24,39,.65);
        border-top: 1px solid rgba(0,0,0,.06);
        background: #fafafa;
      }
    </style>

    <button class="bubble ${CFG.position === "bottom-left" ? "bl" : "br"}" aria-label="Open chat" title="Chat">
      <span>💬</span>
    </button>

    <section class="panel" role="dialog" aria-label="Chat" aria-modal="false">
      <div class="resize-handle top" data-resize="top"></div>
      <div class="resize-handle left" data-resize="left"></div>
      <div class="resize-handle corner" data-resize="corner"></div>

      <div class="header" data-drag-handle>
        <div class="title">${escapeHtml(CFG.title)}</div>
        <div class="controls">
          <div class="lang-switch">
            <button class="lang-btn" data-lang="en" title="English">🇬🇧</button>
            <button class="lang-btn" data-lang="de" title="German">🇩🇪</button>
            <button class="lang-btn" data-lang="fr" title="French">🇫🇷</button>
          </div>
          <button class="hbtn" data-close aria-label="Close chat">✕</button>
        </div>
      </div>

      <div class="body">
        <div class="messages" data-messages></div>
        <div class="buttons" data-buttons></div>

        <div class="typing-indicator" data-thinking>
          <span></span><span></span><span></span>
        </div>

        <div class="footer">
          <textarea class="textarea" data-input rows="1" placeholder="${escapeHtml(CFG.placeholder)}"></textarea>
          <button class="send" data-send aria-label="Send">▶</button>
        </div>

        <div class="webview" data-webview>
          <div class="webview-topbar">
            <button class="wv-btn" type="button" data-wv-back>← Back to chat</button>
            <div class="wv-url" data-wv-url title=""></div>
            <button class="wv-btn" type="button" data-wv-newtab>Open ↗</button>
            <button class="wv-btn" type="button" data-wv-close>✕</button>
          </div>
          <iframe class="wv-frame" data-wv-frame referrerpolicy="no-referrer"></iframe>
          <div class="wv-note">
            Some sites block embedding in iframes. If you see a blank/error page, use “Open ↗”.
          </div>
        </div>
      </div>
    </section>
  `;
  shadow.appendChild(wrapper);

  const $bubble = shadow.querySelector(".bubble");
  const $panel = shadow.querySelector(".panel");
  const $messages = shadow.querySelector("[data-messages]");
  const $buttons = shadow.querySelector("[data-buttons]");
  const $input = shadow.querySelector("[data-input]");
  const $send = shadow.querySelector("[data-send]");
  const $close = shadow.querySelector("[data-close]");
  const $thinking = shadow.querySelector("[data-thinking]");
  const $langButtons = shadow.querySelectorAll(".lang-btn");
  const $dragHandle = shadow.querySelector("[data-drag-handle]");
  const $handles = shadow.querySelectorAll(".resize-handle");

  const $webview = shadow.querySelector("[data-webview]");
  const $wvFrame = shadow.querySelector("[data-wv-frame]");
  const $wvUrl = shadow.querySelector("[data-wv-url]");
  const $wvBack = shadow.querySelector("[data-wv-back]");
  const $wvNewTab = shadow.querySelector("[data-wv-newtab]");
  const $wvClose = shadow.querySelector("[data-wv-close]");

  // ---- language buttons ----
  function updateLanguageButtons() {
    $langButtons.forEach((btn) => {
      const lang = btn.getAttribute("data-lang");
      btn.classList.toggle("active", lang === currentLang);
    });
  }
  $langButtons.forEach((btn) => {
    btn.addEventListener("click", () => setLanguage(btn.getAttribute("data-lang")));
  });
  updateLanguageButtons();

  function scrollToBottom() {
    requestAnimationFrame(() => {
      $messages.scrollTop = $messages.scrollHeight;
    });
  }

  function persistTranscript() {
    try {
      const arr = [];
      $messages.querySelectorAll(".msg").forEach((el) => {
        arr.push({
          role: el.classList.contains("user") ? "user" : "bot",
          text: el.textContent || "",
        });
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch {}
  }

  // ---- messages ----
  function addMessage(text, role = "bot", opts = {}) {
    const div = document.createElement("div");
    div.className = `msg ${role}`;
    const clean = normalizeText(text);

    if (role === "bot" && opts.stream) {
      div.textContent = "";
      $messages.appendChild(div);
      scrollToBottom();
      streamText(div, clean);
    } else {
      div.textContent = clean;
      $messages.appendChild(div);
      persistTranscript();
      scrollToBottom();
    }
  }

  function streamText(el, fullText) {
    const words = fullText.split(/(\s+)/);
    let i = 0;
    const step = () => {
      if (i >= words.length) {
        persistTranscript();
        return;
      }
      el.textContent += words[i++];
      scrollToBottom();
      setTimeout(step, 25);
    };
    step();
  }

  // ---- comparison renderer ----
  function addComparison(compare) {
    if (!compare || !Array.isArray(compare.products) || compare.products.length !== 2) return;

    const [p1, p2] = compare.products;
    const rowsRaw = Array.isArray(compare.rows) ? compare.rows.slice() : [];
    rowsRaw.sort((a, b) => (a.importance ?? 999) - (b.importance ?? 999));

    const safe = (v) => escapeHtml(v ?? "");
    const title =
      compare.title || `${p1.name || "Product 1"} vs ${p2.name || "Product 2"}`;

    const rowsHTML = rowsRaw.map((row) => {
      const label = safe(row.label || row.key || "");
      const v1 = safe((row.values && row.values[0]) || "");
      const v2 = safe((row.values && row.values[1]) || "");
      if (!label && !v1 && !v2) return "";
      return `
        <div class="compare-row">
          <div class="compare-label">${label}</div>
          <div class="compare-values">
            <div class="compare-value">${v1}</div>
            <div class="compare-value">${v2}</div>
          </div>
        </div>`;
    }).join("");

    const container = document.createElement("div");
    container.className = "compare-block";
    container.innerHTML = `
      <div class="compare-header">
        <div class="compare-title">${safe(title)}</div>
        <div class="compare-products">
          <div>
            <div class="compare-prod-name">${safe(p1.name || "Product 1")}</div>
            ${p1.tagline ? `<div class="compare-prod-tagline">${safe(p1.tagline)}</div>` : ""}
            ${p1.family ? `<div class="compare-prod-pill">${safe(p1.family)}</div>` : ""}
          </div>
          <div>
            <div class="compare-prod-name">${safe(p2.name || "Product 2")}</div>
            ${p2.tagline ? `<div class="compare-prod-tagline">${safe(p2.tagline)}</div>` : ""}
            ${p2.family ? `<div class="compare-prod-pill">${safe(p2.family)}</div>` : ""}
          </div>
        </div>
      </div>
      <div class="compare-rows">
        ${rowsHTML}
      </div>
    `;

    $messages.appendChild(container);
    scrollToBottom();
  }

  // ---- webview ----
  let webviewCurrentUrl = null;

  function showWebView(url) {
    const u = safeUrl(url);
    if (!u) return;

    webviewCurrentUrl = u;

    let last = null;
    try { last = localStorage.getItem(LAST_PREVIEW_URL_KEY); } catch {}
    if (last !== u) {
      addMessage("Opened in preview. You can continue browsing here or go back to chat.", "bot");
      try { localStorage.setItem(LAST_PREVIEW_URL_KEY, u); } catch {}
    }

    $wvUrl.textContent = u;
    $wvUrl.title = u;
    $wvFrame.src = "about:blank";
    setTimeout(() => { $wvFrame.src = u; }, 0);
    $webview.classList.add("show");
  }

  function hideWebView() {
    webviewCurrentUrl = null;
    $webview.classList.remove("show");
    try { $wvFrame.src = "about:blank"; } catch {}
  }

  $wvBack.addEventListener("click", hideWebView);
  $wvClose.addEventListener("click", hideWebView);
  $wvNewTab.addEventListener("click", () => {
    if (!webviewCurrentUrl) return;
    try { window.open(webviewCurrentUrl, "_blank", "noopener,noreferrer"); }
    catch { window.location.href = webviewCurrentUrl; }
  });

  // ---- buttons rendering ----
  function clearButtons() {
    $buttons.innerHTML = "";
    $buttons.classList.remove("show");
  }

  function addLinks(links = []) {
    if (!CFG.showLinkButtons) return clearButtons();

    const clean = (Array.isArray(links) ? links : [])
      .map((l) => ({ label: (l?.label || "").trim(), url: safeUrl(l?.url || "") }))
      .filter((l) => l.url);

    if (!clean.length) return clearButtons();

    $buttons.innerHTML = "";
    $buttons.classList.add("show");

    clean.forEach((l) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "link-btn";
      btn.textContent = l.label || new URL(l.url).hostname.replace(/^www\./, "");
      btn.title = l.url;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openPanel();
        showWebView(l.url);
      });
      $buttons.appendChild(btn);
    });

    scrollToBottom();
  }

  // ---- open/close + pos/size persistence ----
  function getPanelRect() { return $panel.getBoundingClientRect(); }

  function defaultSize() {
    $panel.style.width = "360px";
    $panel.style.height = "520px";
  }

  function restoreSize() {
    try {
      const raw = localStorage.getItem(SIZE_KEY);
      if (!raw) return defaultSize();
      const s = JSON.parse(raw);
      if (!s || !Number.isFinite(s.w) || !Number.isFinite(s.h)) return defaultSize();

      const maxW = Math.min(window.innerWidth - 40, 900);
      const maxH = Math.min(window.innerHeight - 120, 900);

      const w = clamp(s.w, 320, maxW);
      const h = clamp(s.h, 360, maxH);

      $panel.style.width = w + "px";
      $panel.style.height = h + "px";
    } catch {
      defaultSize();
    }
  }

  function saveSize() {
    const r = getPanelRect();
    try { localStorage.setItem(SIZE_KEY, JSON.stringify({ w: r.width, h: r.height })); } catch {}
  }

  function defaultPosition() {
    const gap = 20;
    const bubbleGap = 70;
    const r = getPanelRect();
    const w = r.width || 360;
    const h = r.height || 520;

    let left, top;
    if (CFG.position === "bottom-left") {
      left = gap;
      top = window.innerHeight - bubbleGap - h;
    } else {
      left = window.innerWidth - gap - w;
      top = window.innerHeight - bubbleGap - h;
    }
    left = clamp(left, 8, window.innerWidth - w - 8);
    top = clamp(top, 8, window.innerHeight - h - 8);

    $panel.style.left = left + "px";
    $panel.style.top = top + "px";
  }

  function savePosition() {
    const r = getPanelRect();
    try { localStorage.setItem(POS_KEY, JSON.stringify({ left: r.left, top: r.top })); } catch {}
  }

  function restorePosition() {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (!raw) return defaultPosition();
      const pos = JSON.parse(raw);
      if (!pos || !Number.isFinite(pos.left) || !Number.isFinite(pos.top)) return defaultPosition();

      const r = getPanelRect();
      const w = r.width || 360;
      const h = r.height || 520;

      $panel.style.left = clamp(pos.left, 8, window.innerWidth - w - 8) + "px";
      $panel.style.top = clamp(pos.top, 8, window.innerHeight - h - 8) + "px";
    } catch {
      defaultPosition();
    }
  }

  let open = false;

  function openPanel() {
    if (open) return;
    open = true;
    $panel.classList.add("open");
    try { localStorage.setItem(OPEN_KEY, "1"); } catch {}
    restoreSize();
    restorePosition();
    setTimeout(() => $input?.focus(), 0);
    scrollToBottom();
  }

  function closePanel() {
    open = false;
    $panel.classList.remove("open");
    try { localStorage.setItem(OPEN_KEY, "0"); } catch {}
    hideWebView();
  }

  $bubble.addEventListener("click", openPanel);
  $close.addEventListener("click", closePanel);

  try {
    const wasOpen = localStorage.getItem(OPEN_KEY) === "1";
    if (CFG.startOpen || wasOpen) openPanel();
  } catch {
    if (CFG.startOpen) openPanel();
  }

  window.addEventListener("resize", () => {
    if (!open) return;
    restoreSize();
    restorePosition();
    saveSize();
    savePosition();
  });

  // ---- draggable ----
  let dragging = false;
  let dragStartX = 0, dragStartY = 0;
  let dragStartLeft = 0, dragStartTop = 0;

  function isInteractiveInHeader(target) {
    return !!target.closest("button, textarea, input, a, [role='button']");
  }

  if (CFG.draggable && $dragHandle) {
    $dragHandle.addEventListener("pointerdown", (e) => {
      if (!open) return;
      if (isInteractiveInHeader(e.target)) return;

      dragging = true;
      $dragHandle.classList.add("dragging");

      const r = getPanelRect();
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartLeft = r.left;
      dragStartTop = r.top;

      try { $dragHandle.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    });

    $dragHandle.addEventListener("pointermove", (e) => {
      if (!dragging) return;

      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;

      const r = getPanelRect();
      const w = r.width;
      const h = r.height;

      const maxLeft = window.innerWidth - w - 8;
      const maxTop = window.innerHeight - h - 8;

      $panel.style.left = clamp(dragStartLeft + dx, 8, maxLeft) + "px";
      $panel.style.top = clamp(dragStartTop + dy, 8, maxTop) + "px";
    });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      $dragHandle.classList.remove("dragging");
      try { $dragHandle.releasePointerCapture(e.pointerId); } catch {}
      savePosition();
    }

    $dragHandle.addEventListener("pointerup", endDrag);
    $dragHandle.addEventListener("pointercancel", endDrag);
  }

  // ---- resizable (handles) ----
  let rs = null;

  function startResize(e, mode) {
    const r = getPanelRect();
    rs = {
      mode,
      sx: e.clientX,
      sy: e.clientY,
      sw: r.width,
      sh: r.height,
      minW: 320,
      maxW: Math.min(window.innerWidth - 40, 900),
      minH: 360,
      maxH: Math.min(window.innerHeight - 120, 900),
      prevUserSelect: document.body.style.userSelect,
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", endResize);
  }

  function onResizeMove(e) {
    if (!rs) return;
    const dx = e.clientX - rs.sx;
    const dy = e.clientY - rs.sy;

    if (rs.mode === "top" || rs.mode === "corner") {
      $panel.style.height = clamp(rs.sh - dy, rs.minH, rs.maxH) + "px";
    }
    if (rs.mode === "left" || rs.mode === "corner") {
      $panel.style.width = clamp(rs.sw - dx, rs.minW, rs.maxW) + "px";
    }
  }

  function endResize() {
    if (!rs) return;
    document.body.style.userSelect = rs.prevUserSelect || "";
    window.removeEventListener("pointermove", onResizeMove);
    window.removeEventListener("pointerup", endResize);
    rs = null;
    saveSize();
    restorePosition();
    savePosition();
  }

  $handles.forEach((h) =>
    h.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      h.setPointerCapture?.(e.pointerId);
      startResize(e, h.dataset.resize);
    }),
  );

  // ---- send wiring ----
  $send.addEventListener("click", (e) => {
    e.preventDefault();
    sendFromInput();
  });

  $input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendFromInput();
    }
  });

  $input.addEventListener("input", () => {
    $input.style.height = "auto";
    $input.style.height = Math.min($input.scrollHeight, 160) + "px";
  });

  function setThinking(on) {
    $thinking.classList.toggle("show", !!on);
    scrollToBottom();
  }

  function disableInput(on) {
    $input.disabled = !!on;
    $send.disabled = !!on;
  }

  function sendFromInput() {
    const text = ($input.value || "").trim();
    if (!text) return;
    addMessage(text, "user");
    $input.value = "";
    $input.dispatchEvent(new Event("input"));
    sendMessage(text);
  }

  async function sendMessage(text) {
    if (!CFG.endpoint) {
      addMessage("Configuration error: missing endpoint.", "bot");
      return;
    }

    setThinking(true);
    disableInput(true);

    try {
      const res = await fetch(CFG.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Chat-Id": CFG.chatId,
        },
        body: JSON.stringify({
          message: text,
          chatId: CFG.chatId,
          lang: currentLang,
          pageUrl: CFG.pageUrl,
        }),
        credentials: "omit",
      });

      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const raw = ct.includes("application/json") ? await res.json() : await res.text();
      const payload = typeof raw === "string" ? tryParseJSON(raw) ?? raw : raw;

      handleWebhookResponse(payload);
    } catch (err) {
      console.error("[ChatWidget] fetch error", err);
      addMessage("Sorry, I couldn’t reach the server.", "bot");
    } finally {
      setThinking(false);
      disableInput(false);
      setTimeout(() => $input?.focus(), 0);
    }
  }

  function extractAnswerFromMaybeJSON(s) {
    if (typeof s !== "string") return s;
    const parsed = tryParseJSON(s);
    if (parsed && typeof parsed === "object" && typeof parsed.answer === "string") {
      return parsed.answer;
    }
    return s;
  }

  function handleWebhookResponse(payload) {
    try {
      if (typeof payload === "string") {
        const parsed = tryParseJSON(payload);
        if (parsed) return handleWebhookResponse(parsed);

        const safeText = extractAnswerFromMaybeJSON(payload);
        addMessage(safeText, "bot", { stream: true });
        if (CFG.autoExtractUrls) addLinks(extractLinksFromText(safeText));
        return;
      }

      let text =
        payload.answer ??
        payload.output ??
        payload.message ??
        payload.text ??
        "OK";

      if (typeof text === "string") text = extractAnswerFromMaybeJSON(text);
      else text = "OK";

      addMessage(text, "bot", { stream: true });

      // buttons
      const links = payload.links || (payload.rich && payload.rich.buttons) || [];
      if (Array.isArray(links) && links.length) addLinks(links);
      else if (CFG.autoExtractUrls) addLinks(extractLinksFromText(text));
      else clearButtons();

      // compare table (RESTORED)
      if (payload.rich && payload.rich.compare) {
        comparesHistory.push(payload.rich.compare);
        addComparison(payload.rich.compare);
      }

      // redirect -> preview
      const url = payload.redirect || (payload.rich && payload.rich.redirect);
      if (url && typeof url === "string") {
        const u = safeUrl(url);
        if (u) {
          openPanel();
          showWebView(u);
        }
      }
    } catch (e) {
      console.warn("[ChatWidget] parse error; showing raw.");
      addMessage(String(payload), "bot");
      clearButtons();
    }
  }

  // ---- ESC ----
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if ($webview.classList.contains("show")) return hideWebView();
    if (open) closePanel();
  });

  // ---- greet ----
  addMessage("Hi! How can I help?", "bot");
})();
