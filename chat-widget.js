(() => {
  const currentScript = document.currentScript;

  const CFG = {
    endpoint: currentScript?.dataset.endpoint || "",
    title: currentScript?.dataset.title || "Assistant",
    primary: currentScript?.dataset.primary || "#0b5fff",
    accent: currentScript?.dataset.accent || "#eef4ff",
    position: (currentScript?.dataset.position || "bottom-right").toLowerCase(),
    startOpen: (currentScript?.dataset.startOpen || "false").toLowerCase() === "true",
    placeholder: currentScript?.dataset.placeholder || "Type your message…",
    chatId: currentScript?.dataset.chatId || null,
    popup: (currentScript?.dataset.popup || "false").toLowerCase() === "true",
    closeOnNavigate: (currentScript?.dataset.closeOnNavigate || "false").toLowerCase() === "true",
    // NEW: keep track of the original page URL (for both embedded and popup)
    pageUrl: currentScript?.dataset.pageUrl || window.location.href,
  };

  // ---- language state ----
  const LANG_KEY = `chatWidget:lang:${CFG.chatId}`;
  const SUPPORTED_LANGS = ["en", "de", "fr"];

  // read saved language or default to English
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
  const BUTTONS_KEY = `chatWidget:buttons:${CFG.chatId}`; // NEW

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
      * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; }

      ${CFG.popup ? `.bubble{ display:none !important; }` : ``}

      .bubble{
        pointer-events:auto; width:56px;height:56px;border-radius:50%;background:${CFG.primary};
        display:grid;place-items:center;color:#fff;font-weight:700;cursor:pointer;
        box-shadow:0 8px 28px rgba(0,0,0,.16),0 2px 8px rgba(0,0,0,.12);
      }

      .panel{
        pointer-events:auto; position:absolute; ${CFG.position==="bottom-left"?"left:0;":"right:0;"} bottom:70px;
        width:360px; height:520px; max-width:calc(100vw - 40px); max-height:calc(100vh - 120px);
        background:#fff;border-radius:14px;overflow:hidden;display:none;
        box-shadow:0 14px 45px rgba(0,0,0,.18),0 10px 18px rgba(0,0,0,.12);
        will-change: width, height; min-width:320px; min-height:360px;
      }

      .panel.open{
        display:flex;
        flex-direction:column;
      }

      /* Popup: fill window neatly, keep footer visible */
      ${CFG.popup ? `
      .panel{
        position: fixed; inset: 8px;
        width: auto; height: auto;
        max-width: none; max-height: none;
      }` : ``}

      .panel.open{ display:flex; }
      .panel.resizable{ resize:both; }

      .header{ background:#082a5b;color:#fff;padding:10px 12px;display:flex;align-items:center;gap:8px; }
      .title{ font-weight:700; font-size:14px; flex:1; }
      .controls{ display:flex; gap:6px; }
      .hbtn{ background:rgba(255,255,255,.15); color:#fff; border:0; border-radius:8px; padding:6px 8px; cursor:pointer; }

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
        opacity:0.5;
        padding:4px;
        border-radius:6px;
      }
      .lang-btn.active{
        opacity:1;
        background:rgba(255,255,255,0.18);
      }

      .body{ background:#fff; display:flex; flex-direction:column; min-height:0; height:100%; }
      .messages{
        padding:12px 12px 76px;
        overflow:auto;
        flex:1;
        background:#f7f9fc;
      }
      .msg{ max-width:85%; padding:10px 12px; border-radius:12px; margin:8px 0; white-space:pre-wrap; word-break:break-word; line-height:1.35; }
      .msg.user{ margin-left:auto; background:${CFG.primary}; color:#fff; }
      .msg.bot{ background:${CFG.accent}; color:#0e1726; }

      .buttons{ margin:2px 0 6px 0; display:flex; flex-wrap:wrap; gap:6px; padding-left:12px; }
      .link-btn{
        display:inline-flex; align-items:center; gap:8px;
        border:1px solid #f5bcbc; background:#ffe7e7; color:#7b1b1b;
        border-radius:10px; padding:8px 12px; text-decoration:none;
        max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        transition: background .15s ease, border-color .15s ease;
      }
      .link-btn:hover{ background:#ffd9d9; border-color:#f2a9a9; }

      .thinking{ font-size:12px; opacity:.9; padding:6px 10px; border-radius:10px; background:rgba(0,0,0,.04);
                 width:fit-content; display:none; margin:6px 0 0; }
      .thinking.show{ display:inline-block; }

      .footer{ border-top:1px solid rgba(0,0,0,.06); background:#fff; display:flex; align-items:flex-end; gap:8px; padding:10px; }
      .textarea{ flex:1; min-height:40px; max-height:160px; overflow:auto; border:1px solid #dfe3ea;
                 border-radius:10px; padding:10px 12px; outline:none; resize:none; }
      .send{ background:${CFG.primary}; color:#fff; border:none; border-radius:10px; padding:10px 14px; cursor:pointer; font-weight:600; }
      .send:disabled{ opacity:.6; cursor:not-allowed; }

      .ellipsis::after{ content:'…'; animation:dots 1.2s steps(4,end) infinite; }
      @keyframes dots{0%,20%{content:' ';}40%{content:'.';}60%{content:'..';}80%,100%{content:'...';}}

      .resize-handle { position:absolute; z-index:5; }
      .resize-handle.top { top:0; left:10px; right:10px; height:10px; cursor:ns-resize; }
      .resize-handle.left { left:0; top:10px; bottom:10px; width:10px; cursor:ew-resize; }
      .resize-handle.corner { top:0; left:0; width:14px; height:14px; cursor:nwse-resize; }
      .resize-handle:hover { background: rgba(0,0,0,.04); }
    </style>

    <button class="bubble" aria-label="Open chat" title="Chat"><span>💬</span></button>

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
          <button class="hbtn" data-close>✕</button>
        </div>
      </div>

      <div class="body">
        <div class="messages" data-messages></div>
        <div class="buttons" data-buttons></div>
        <div class="thinking" data-thinking>thinking<span class="ellipsis"></span></div>
        <div class="footer">
          <textarea class="textarea" data-input rows="1" placeholder="${escapeHtml(CFG.placeholder)}"></textarea>
          <button class="send" data-send>Send</button>
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

  // initialise visual state
  updateLanguageButtons();

  // ---- transcript helpers ----
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

  function persistButtons(btns) {
  try {
    localStorage.setItem(BUTTONS_KEY, JSON.stringify(btns || []));
  } catch {}
}

function hydrateButtons() {
  try {
    const raw = localStorage.getItem(BUTTONS_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    if (Array.isArray(arr) && arr.length) {
      addLinks(arr); // reuse existing renderer
    }
  } catch {}
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
  function hydrate() {
  // If we just performed a handoff (embedded → popup), start clean in the embedded
  try {
    if (!CFG.popup && localStorage.getItem(HANDOFF_KEY)) {
      localStorage.removeItem(HANDOFF_KEY);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(BUTTONS_KEY); // NEW: clear stored buttons
      addMessage("Hi! How can I help?", "bot");
      persistTranscript();
      return;
    }
  } catch {}

  // Normal restore from localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    if (Array.isArray(arr) && arr.length) {
      renderTranscript(arr);
      hydrateButtons();   // NEW: restore buttons as well
      return;
    }
  } catch {}

  // No transcript → show greeting; still try to hydrate buttons if any
  addMessage("Hi! How can I help?", "bot");
  hydrateButtons();       // NEW
}

  // Cross-window hydrate for popup
  window.addEventListener("message", (e) => {
    const d = e?.data;
    if (!d || d.type !== "chatWidget:hydrate" || d.chatId !== CFG.chatId) return;
    if (Array.isArray(d.messages) && d.messages.length) {
      renderTranscript(d.messages);
      persistTranscript();
    }
  });
  if (CFG.popup && window.opener && !window.opener.closed) {
    try {
      window.opener.postMessage({ type: "chatWidget:ready", chatId: CFG.chatId }, "*");
    } catch {}
  }

  hydrate();

  // ---- drag-resize (anchored) ----
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
    const dx = e.clientX - rs.sx,
      dy = e.clientY - rs.sy;
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
    const parentPageUrl = window.location.href; // original page URL

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
    const WIDTH = 520,
      HEIGHT = 760;
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
    const readyHandler = (e) => {
      const d = e?.data;
      if (!d || d.type !== "chatWidget:ready" || d.chatId !== CFG.chatId) return;
      try {
        w.postMessage(
          { type: "chatWidget:hydrate", chatId: CFG.chatId, messages: currentTranscriptArray() },
          "*",
        );
      } catch {}
      window.removeEventListener("message", readyHandler);
    };
    window.addEventListener("message", readyHandler);
    setTimeout(() => {
      try {
        w.postMessage(
          { type: "chatWidget:hydrate", chatId: CFG.chatId, messages: currentTranscriptArray() },
          "*",
        );
      } catch {}
    }, 300);
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
    const words = fullText.split(/(\s+)/); // keep spaces
    let i = 0;
    const step = () => {
      if (i >= words.length) {
        persistTranscript();
        return;
      }
      el.textContent += words[i++];
      scrollToBottom();
      setTimeout(step, 25); // adjust speed here (ms per chunk)
    };
    step();
  }

  function addLinks(links = []) {
  $buttons.innerHTML = "";

  if (!Array.isArray(links) || !links.length) {
    persistButtons([]); // clear stored buttons
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
      // In POPUP: navigate opener
      a.addEventListener("click", (e) => {
        e.preventDefault();
        try { window.opener.location.href = url; } catch {}
        if (CFG.closeOnNavigate) {
          try { window.close(); } catch {}
        }
      });
    } else {
      // In EMBEDDED: open popup first, then navigate this page.
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

  // NEW: remember last set of buttons so popup can restore them
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
          pageUrl: CFG.pageUrl, // NEW: send original page URL to backend
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

  function handleWebhookResponse(payload) {
    try {
      if (typeof payload === "string") {
        const parsed = tryParseJSON(payload);
        if (parsed) return handleWebhookResponse(parsed);
        addMessage(payload, "bot", { stream: true });
        addLinks([]);
        return;
      }
      const text =
        payload.answer ||
        payload.output ||
        payload.message ||
        payload.text ||
        "OK";

      // STREAM bot answer
      addMessage(text, "bot", { stream: true });

      const links =
        payload.links ||
        (payload.rich && payload.rich.buttons) ||
        extractLinksFromText(text);
      addLinks(Array.isArray(links) ? links : []);

      const url = payload.redirect || (payload.rich && payload.rich.redirect);
      if (url && typeof url === "string") {
        if (CFG.popup && window.opener && !window.opener.closed) {
          try {
            window.opener.location.href = url;
          } catch {}
          if (CFG.closeOnNavigate) {
            try {
              window.close();
            } catch {}
          }
        } else {
          const w = openPopupWindow();
          if (!w) {
            try {
              window.top.location.href = url;
            } catch (_) {
              window.location.href = url;
            }
          } else {
            try {
              localStorage.setItem(HANDOFF_KEY, "1");
            } catch {}
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
