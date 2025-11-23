(() => {
  const currentScript = document.currentScript;

  const CFG = {
    endpoint: currentScript?.dataset.endpoint || "",
    title: currentScript?.dataset.title || "Support Assistant",
    // Canon-ish defaults (overridable via data-primary / data-accent)
    primary: currentScript?.dataset.primary || "#CC0000",   // Canon red
    accent: currentScript?.dataset.accent || "#ffffff",     // bot bubble background
    position: (currentScript?.dataset.position || "bottom-right").toLowerCase(),
    startOpen: (currentScript?.dataset.startOpen || "false").toLowerCase() === "true",
    placeholder: currentScript?.dataset.placeholder || "Ask me anything…",
    chatId: currentScript?.dataset.chatId || null,
    popup: (currentScript?.dataset.popup || "false").toLowerCase() === "true",
    closeOnNavigate: (currentScript?.dataset.closeOnNavigate || "false").toLowerCase() === "true",
    pageUrl: currentScript?.dataset.pageUrl || window.location.href,
  };

  // ---- language state ----
  const LANG_KEY = `chatWidget:lang:${CFG.chatId}`;
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
  const HANDOFF_KEY = `chatWidget:handoffJustNavigated:${CFG.chatId}`;
  const BUTTONS_KEY = `chatWidget:buttons:${CFG.chatId}`;
    let comparesHistory = [];

  // ---- host container ----
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.zIndex = "2147483646";
  host.style.pointerEvents = "none";
  if (CFG.position === "bottom-left") {
    host.style.left = "20px";
    host.style.bottom = "20px";
  } else {
    host.style.right = "20px";
    host.style.bottom = "20px";
  }
  if (CFG.popup) {
    host.style.left = "0";
    host.style.right = "0";
    host.style.top = "0";
    host.style.bottom = "0";
    host.style.pointerEvents = "auto";
  }
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <style>
      :host { all: initial; }
      * {
        box-sizing: border-box;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      }

      ${CFG.popup ? `.bubble{ display:none !important; }` : ``}

      .bubble{
        pointer-events:auto;
        width:56px;height:56px;
        border-radius:50%;
        background:${CFG.primary};
        display:grid;place-items:center;
        color:#fff;font-weight:700;
        cursor:pointer;
        box-shadow:0 8px 28px rgba(0,0,0,.16),0 2px 8px rgba(0,0,0,.12);
        border:2px solid #ffffff;
      }

      .panel{
        pointer-events:auto;
        position:absolute;
        ${CFG.position==="bottom-left"?"left:0;":"right:0;"}
        bottom:70px;
        width:360px; height:520px;
        max-width:calc(100vw - 40px);
        max-height:calc(100vh - 120px);
        background:#ffffff;
        border-radius:16px;
        overflow:hidden;
        display:none;
        box-shadow:0 14px 45px rgba(0,0,0,.18),0 10px 18px rgba(0,0,0,.12);
        will-change: width, height;
        min-width:320px; min-height:360px;
      }

      .panel.open{
        display:flex;
        flex-direction:column;
      }

      ${CFG.popup ? `
      .panel{
        position: fixed; inset: 8px;
        width: auto; height: auto;
        max-width: none; max-height: none;
      }` : ``}

      .panel.resizable{ resize:both; }

      .header{
        background:#041E42; /* Canon dark navy */
        color:#fff;
        padding:10px 14px;
        display:flex;
        align-items:center;
        gap:8px;
      }
      .title{
        font-weight:700;
        font-size:14px;
        letter-spacing:0.02em;
        flex:1;
      }
      .controls{ display:flex; gap:6px; }
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

      .lang-switch{
        display:flex;
        align-items:center;
        gap:4px;
        margin-right:4px;
      }
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
        background:#f5f5f7; /* Canon-ish light grey */
        display:flex;
        flex-direction:column;
        min-height:0;
        height:100%;
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
      .msg.user{
        margin-left:auto;
        background:${CFG.primary};
        color:#ffffff;
      }
      .msg.bot{
        background:${CFG.accent};
        color:#111827;
        border:1px solid #e2e4ea;
      }

      .buttons{
        margin:2px 0 6px 0;
        display:flex;
        flex-wrap:wrap;
        gap:6px;
        padding-left:12px;
      }
      .link-btn{
        display:inline-flex;
        align-items:center;
        gap:8px;
        border:1px solid #f5bcbc;
        background:#fff5f5;
        color:#7b1b1b;
        border-radius:999px;
        padding:6px 12px;
        text-decoration:none;
        max-width:100%;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        font-size:12px;
        transition: background .15s ease, border-color .15s ease, transform .1s ease;
      }
      .link-btn:hover{
        background:#ffe1e1;
        border-color:#f2a9a9;
        transform:translateY(-1px);
      }

      /* Typing indicator: three floating dots, no bubble */
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
      .typing-indicator.show{
        display:inline-flex;
      }
      .typing-indicator span{
        width:8px;
        height:8px;
        border-radius:50%;
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

      /* Apple-style comparison block, Canon themed */
      .compare-block{
        margin:4px 0 10px;
        padding:10px 10px 8px;
        background:#ffffff;
        border-radius:12px;
        border:1px solid #e2e4ea;
        font-size:12px;
      }
      .compare-header{
        display:flex;
        flex-direction:column;
        gap:6px;
        margin-bottom:6px;
      }
      .compare-title{
        font-size:13px;
        font-weight:600;
        color:#111827;
      }
      .compare-products{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:8px;
      }
      .compare-prod{
        text-align:left;
      }
      .compare-prod-name{
        font-weight:600;
        font-size:12px;
        color:#111827;
        margin-bottom:2px;
      }
      .compare-prod-tagline{
        font-size:11px;
        color:#4b5563;
        margin-bottom:4px;
      }
      .compare-prod-pill{
        display:inline-block;
        padding:2px 6px;
        border-radius:999px;
        border:1px solid #e5e7eb;
        font-size:10px;
        color:#6b7280;
        background:#f9fafb;
      }
      .compare-rows{
        border-top:1px solid #e5e7eb;
        margin-top:6px;
        padding-top:6px;
      }
      .compare-row{
        padding:6px 0;
        border-bottom:1px solid #f3f4f6;
      }
      .compare-row:last-child{
        border-bottom:none;
      }
      .compare-label{
        font-size:11px;
        font-weight:500;
        color:#374151;
        margin-bottom:3px;
      }
      .compare-label strong{
  font-weight:600;
  color:#111827; /* slightly darker for emphasis */
}
      .compare-values{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:6px;
        font-size:11px;
        color:#111827;
      }
      .compare-value{
        white-space:pre-wrap;
      }

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
      .send:disabled{
        opacity:.6;
        cursor:not-allowed;
      }

      .resize-handle{
        position:absolute;
        z-index:5;
      }
      .resize-handle.top{
        top:0; left:10px; right:10px;
        height:10px;
        cursor:ns-resize;
      }
      .resize-handle.left{
        left:0; top:10px; bottom:10px;
        width:10px;
        cursor:ew-resize;
      }
      .resize-handle.corner{
        top:0; left:0;
        width:14px;height:14px;
        cursor:nwse-resize;
      }
      .resize-handle:hover{
        background:rgba(0,0,0,.03);
      }
    </style>

    <button class="bubble" aria-label="Open chat" title="Chat">
      <span>💬</span>
    </button>

    <section class="panel resizable" role="dialog" aria-label="Chat" aria-modal="false">
      <div class="resize-handle top" data-resize="top"></div>
      <div class="resize-handle left" data-resize="left"></div>
      <div class="resize-handle corner" data-resize="corner"></div>

      <div class="header">
        <div class="title">${escapeHtml(CFG.title)}</div>
        <div class="controls">
          <div class="lang-switch" data-lang-switch>
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
          <button class="send" data-send>▶</button>
        </div>
      </div>
    </section>
  `;
  shadow.appendChild(wrapper);

  // ---- elements ----
  const $bubble = shadow.querySelector(".bubble");
  const $panel = shadow.querySelector(".panel");
  const $messages = shadow.querySelector("[data-messages]");
  const $buttons = shadow.querySelector("[data-buttons]");
  const $input = shadow.querySelector("[data-input]");
  const $send = shadow.querySelector("[data-send]");
  const $close = shadow.querySelector("[data-close]");
  const $thinking = shadow.querySelector("[data-thinking]");
  const $handles = shadow.querySelectorAll(".resize-handle");
  const $langButtons = shadow.querySelectorAll(".lang-btn");

  function updateLanguageButtons() {
    $langButtons.forEach((btn) => {
      const lang = btn.getAttribute("data-lang");
      btn.classList.toggle("active", lang === currentLang);
    });
  }

  $langButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const lang = btn.getAttribute("data-lang");
      setLanguage(lang);
    });
  });

  updateLanguageButtons();

  // ---- transcript + buttons helpers ----
  function currentTranscriptArray() {
    const arr = [];
    $messages.querySelectorAll(".msg").forEach((el) => {
      arr.push({
        role: el.classList.contains("user") ? "user" : "bot",
        text: el.textContent || "",
      });
    });
    return arr;
  }

  function persistTranscript() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentTranscriptArray()));
    } catch {}
  }

  function renderTranscript(arr) {
    $messages.innerHTML = "";
    for (const m of arr) addMessage(m.text, m.role === "user" ? "user" : "bot");
  }

  function persistButtons(btns) {
    try {
      localStorage.setItem(BUTTONS_KEY, JSON.stringify(btns || []));
    } catch {}
  }

  function getStoredButtons() {
    try {
      const raw = localStorage.getItem(BUTTONS_KEY);
      const arr = raw ? JSON.parse(raw) : null;
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function hydrateButtonsFromStorage() {
    const arr = getStoredButtons();
    if (arr.length) addLinks(arr);
  }

  function hydrate() {
  // For the main (non-popup) widget we always start with a fresh chat.
  // Popup windows will still receive the live transcript via postMessage.
  try {
    if (!CFG.popup) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(BUTTONS_KEY);
      localStorage.removeItem(HANDOFF_KEY);
      comparesHistory = [];
    }
  } catch {}

  // Show a fresh greeting for every new page load
  addMessage("Hi! How can I help?", "bot");
}

  // Cross-window hydrate for popup: includes buttons
  window.addEventListener("message", (e) => {
    const d = e?.data;
    if (!d || d.type !== "chatWidget:hydrate" || d.chatId !== CFG.chatId) return;

    if (Array.isArray(d.messages) && d.messages.length) {
      renderTranscript(d.messages);
    }
    if (Array.isArray(d.buttons)) {
      addLinks(d.buttons);
    }
    if (Array.isArray(d.compares) && d.compares.length) {
      d.compares.forEach((c) => addComparison(c));
      comparesHistory = d.compares.slice(); // keep local copy in popup
    }
    persistTranscript();
    persistButtons(d.buttons || []);
  });

  if (CFG.popup && window.opener && !window.opener.closed) {
    try {
      window.opener.postMessage({ type: "chatWidget:ready", chatId: CFG.chatId }, "*");
    } catch {}
  }

  hydrate();

  // ---- drag-resize ----
  let rs = null;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  function startResize(e, mode) {
    rs = {
      mode,
      sx: e.clientX,
      sy: e.clientY,
      sw: $panel.offsetWidth,
      sh: $panel.offsetHeight,
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
    if (rs.mode === "top" || rs.mode === "corner")
      $panel.style.height = clamp(rs.sh - dy, rs.minH, rs.maxH) + "px";
    if (rs.mode === "left" || rs.mode === "corner")
      $panel.style.width = clamp(rs.sw - dx, rs.minW, rs.maxW) + "px";
  }

  function endResize() {
    if (!rs) return;
    document.body.style.userSelect = rs.prevUserSelect || "";
    window.removeEventListener("pointermove", onResizeMove);
    window.removeEventListener("pointerup", endResize);
    rs = null;
  }

  $handles.forEach((h) =>
    h.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      h.setPointerCapture?.(e.pointerId);
      startResize(e, h.dataset.resize);
    }),
  );

  // ---- open / close ----
  let open = false;
  function openPanel() {
    if (open) return;
    open = true;
    $panel.classList.add("open");
    setTimeout(() => $input?.focus(), 0);
    scrollToBottom();
  }
  function closePanel() {
    open = false;
    $panel.classList.remove("open");
  }
  if (CFG.popup) openPanel();
  $bubble.addEventListener("click", openPanel);
  $close.addEventListener("click", closePanel);

  // ---- popup plumbing ----
  function writePopupContent(w) {
    const srcAbs = new URL(currentScript?.src || "", location.href).href;
    const parentPageUrl = window.location.href;

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(CFG.title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>html,body{height:100%;margin:0;background:#f5f7fb;}</style>
</head>
<body>
  <script
    src="${srcAbs}"
    data-endpoint="${escapeHtml(CFG.endpoint)}"
    data-title="${escapeHtml(CFG.title)}"
    data-primary="${escapeHtml(CFG.primary)}"
    data-accent="${escapeHtml(CFG.accent)}"
    data-position="bottom-right"
    data-start-open="true"
    data-chat-id="${escapeHtml(CFG.chatId)}"
    data-popup="true"
    data-page-url="${escapeHtml(parentPageUrl)}"
    defer
  ></script>
</body>
</html>`;
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch {}
  }

  function openPopupWindow() {
    const WIDTH = 520, HEIGHT = 760;
    const left = Math.max(
      0,
      (window.screenX || window.screenLeft) + window.innerWidth - WIDTH - 20,
    );
    const top = Math.max(
      0,
      (window.screenY || window.screenTop) + window.innerHeight - HEIGHT - 60,
    );
    const features = [
      "popup=yes",
      "resizable=yes",
      "scrollbars=yes",
      "toolbar=0",
      "menubar=0",
      "location=0",
      "status=0",
      `width=${WIDTH}`,
      `height=${HEIGHT}`,
      `left=${left}`,
      `top=${top}`,
    ].join(",");
    const w = window.open("about:blank", "ChatWidgetPopup", features);
    if (!w) return null;

    persistTranscript();
    writePopupContent(w);

    try {
      w.resizeTo(WIDTH, HEIGHT);
      w.moveTo(left, top);
      w.focus();
    } catch {}

    const sendHydrate = () => {
      try {
        w.postMessage(
          {
            type: "chatWidget:hydrate",
            chatId: CFG.chatId,
            messages: currentTranscriptArray(),
            buttons: getStoredButtons(),
            compares: comparesHistory,
          },
          "*",
        );
      } catch {}
    };

    const readyHandler = (e) => {
      const d = e?.data;
      if (!d || d.type !== "chatWidget:ready" || d.chatId !== CFG.chatId) return;
      sendHydrate();
      window.removeEventListener("message", readyHandler);
    };
    window.addEventListener("message", readyHandler);

    setTimeout(sendHydrate, 300);

    return w;
  }

  // ---- input / send ----
  $send.addEventListener("click", sendFromInput);
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

  function sendFromInput() {
    const text = ($input.value || "").trim();
    if (!text) return;
    addMessage(text, "user");
    $input.value = "";
    $input.dispatchEvent(new Event("input"));
    sendMessage(text);
  }

  // --- STREAMING SUPPORT ---
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

  // --- comparison renderer ---
  function addComparison(compare) {
    if (!compare || !Array.isArray(compare.products) || compare.products.length !== 2) {
      return;
    }

    const [p1, p2] = compare.products;
    // extra front-end guard: same family/category only
    if (p1.family && p2.family && p1.family !== p2.family) return;

    const rowsRaw = Array.isArray(compare.rows) ? compare.rows.slice() : [];
    // sort by importance (lower = more important)
    rowsRaw.sort((a, b) => (a.importance ?? 999) - (b.importance ?? 999));

    const container = document.createElement("div");
    container.className = "compare-block";

    const title = compare.title ||
      `${p1.name || "Product 1"} vs ${p2.name || "Product 2"}`;

    const safe = (v) => escapeHtml(v ?? "");

    const rowsHTML = rowsRaw.map(row => {
      const label = safe(row.label || row.key || "");
      const v1 = safe((row.values && row.values[0]) || "");
      const v2 = safe((row.values && row.values[1]) || "");
      if (!label && !v1 && !v2) return "";
      return `
        <div class="compare-row">
 <div class="compare-label"><strong>${label}</strong></div>
          <div class="compare-values">
            <div class="compare-value">${v1}</div>
            <div class="compare-value">${v2}</div>
          </div>
        </div>`;
    }).join("");

    container.innerHTML = `
      <div class="compare-header">
        <div class="compare-title">${safe(title)}</div>
        <div class="compare-products">
          <div class="compare-prod">
            <div class="compare-prod-name">${safe(p1.name || "Product 1")}</div>
            ${p1.tagline ? `<div class="compare-prod-tagline">${safe(p1.tagline)}</div>` : ""}
            ${p1.family ? `<div class="compare-prod-pill">${safe(p1.family)}</div>` : ""}
          </div>
          <div class="compare-prod">
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

  function addLinks(links = []) {
    $buttons.innerHTML = "";

    if (!Array.isArray(links) || !links.length) {
      persistButtons([]);
      return;
    }

    links.forEach((l) => {
      const url = l?.url || "#";
      const a = document.createElement("a");
      a.className = "link-btn";
      a.href = url;
      a.title = url;
      a.textContent = (l?.label || url).replace(/^https?:\/\//, "");

      if (CFG.popup && window.opener && !window.opener.closed) {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          try { window.opener.location.href = url; } catch {}
          if (CFG.closeOnNavigate) {
            try { window.close(); } catch {}
          }
        });
      } else {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          const w = openPopupWindow();
          if (!w) {
            window.location.href = url;
            return;
          }
          try { localStorage.setItem(HANDOFF_KEY, "1"); } catch {}
          window.location.href = url;
        });
      }

      $buttons.appendChild(a);
      scrollToBottom();
    });

    persistButtons(links);
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

      // Last-resort: never show raw JSON string
      const safeText = extractAnswerFromMaybeJSON(payload);
      addMessage(safeText, "bot", { stream: true });
      addLinks([]);
      return;
    }
            let text =
        payload.answer ??
        payload.output ??
        payload.message ??
        payload.text ??
        "OK";

      // If the answer itself is a JSON string, unwrap it
      if (typeof text === "string") {
        text = extractAnswerFromMaybeJSON(text);
      } else {
        text = "OK";
      }

      // main text
      addMessage(text, "bot", { stream: true });

      // buttons / links
      const links =
        payload.links ||
        (payload.rich && payload.rich.buttons) ||
        extractLinksFromText(text);
      addLinks(Array.isArray(links) ? links : []);

      // comparison table (if present)
      if (payload.rich && payload.rich.compare) {
        comparesHistory.push(payload.rich.compare); // <--- store compare
        addComparison(payload.rich.compare);
      }

      // redirects
      const url = payload.redirect || (payload.rich && payload.rich.redirect);
      if (url && typeof url === "string") {
        if (CFG.popup && window.opener && !window.opener.closed) {
          try { window.opener.location.href = url; } catch {}
          if (CFG.closeOnNavigate) {
            try { window.close(); } catch {}
          }
        } else {
          const w = openPopupWindow();
          if (!w) {
            try { window.top.location.href = url; } catch (_) {
              window.location.href = url;
            }
          } else {
            try { localStorage.setItem(HANDOFF_KEY, "1"); } catch {}
            window.location.href = url;
          }
        }
      }
    } catch (e) {
      console.warn("[ChatWidget] parse error; showing raw.");
      addMessage(String(payload), "bot");
      addLinks([]);
    }
  }

  function setThinking(on) {
    $thinking.classList.toggle("show", !!on);
    scrollToBottom();
  }
  function disableInput(on) {
    $input.disabled = !!on;
    $send.disabled = !!on;
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

  // ---- utils ----
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
  function scrollToBottom() {
    requestAnimationFrame(() => {
      $messages.scrollTop = $messages.scrollHeight;
    });
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
})();
