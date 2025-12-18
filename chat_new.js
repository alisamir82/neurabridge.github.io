/* 
  Rufus-style floating chat widget
  - Draggable + resizable
  - In-widget webview preview
  - Intent-first suggestions
  - Preview confirmation messages
  - Snap-to-edge positioning
*/

(() => {
  const SNAP_PX = 24;

  /* ---------------- CONFIG ---------------- */
  const currentScript = document.currentScript;
  const CFG = {
    endpoint: currentScript?.dataset.endpoint || "",
    title: currentScript?.dataset.title || "Support Assistant",
    primary: currentScript?.dataset.primary || "#0b5fff",
    accent: currentScript?.dataset.accent || "#e8f0ff",
    placeholder: currentScript?.dataset.placeholder || "Ask me anything…",
    position: (currentScript?.dataset.position || "bottom-right").toLowerCase(),
    draggable: (currentScript?.dataset.draggable || "true") !== "false",
    linkBehavior: "in-widget",
  };

  /* ---------------- UTIL ---------------- */
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const safeUrl = (u) => {
    try {
      const url = new URL(u, location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  };

  /* ---------------- HOST ---------------- */
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.pointerEvents = "none";
  host.style.zIndex = "2147483646";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  /* ---------------- TEMPLATE ---------------- */
  shadow.innerHTML = `
<style>
  *{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto}
  .bubble{pointer-events:auto;position:fixed;width:56px;height:56px;border-radius:50%;
    background:${CFG.primary};color:#fff;display:grid;place-items:center;cursor:pointer;
    box-shadow:0 10px 28px rgba(0,0,0,.25)}
  .bubble.br{right:20px;bottom:20px}

  .panel{pointer-events:auto;position:fixed;width:360px;height:520px;
    background:#fff;border-radius:16px;display:none;flex-direction:column;
    box-shadow:0 20px 50px rgba(0,0,0,.25);overflow:hidden}
  .panel.open{display:flex}

  .header{background:#041E42;color:#fff;padding:10px 14px;
    display:flex;align-items:center;cursor:grab}
  .header.dragging{cursor:grabbing}
  .title{flex:1;font-weight:700}
  .close{background:none;border:0;color:#fff;font-size:18px;cursor:pointer}

  .body{flex:1;position:relative;background:#f5f6f8;display:flex;flex-direction:column}
  .messages{flex:1;overflow:auto;padding:12px}
  .msg{max-width:85%;padding:10px 12px;border-radius:14px;margin:6px 0;font-size:13px}
  .msg.bot{background:${CFG.accent};border:1px solid #e5e7eb}
  .msg.user{background:${CFG.primary};color:#fff;margin-left:auto}

  .buttons{display:flex;flex-wrap:wrap;gap:6px;padding:6px 12px}
  .btn{border-radius:999px;padding:6px 12px;border:1px solid #c7d2fe;
    background:#eef2ff;cursor:pointer;font-size:12px}

  .footer{padding:10px;background:#fff;border-top:1px solid #eee;display:flex;gap:8px}
  textarea{flex:1;border-radius:999px;padding:10px;border:1px solid #ccc;resize:none}
  button.send{border-radius:999px;background:${CFG.primary};color:#fff;border:0;padding:0 14px}

  /* Webview */
  .webview{position:absolute;inset:0;background:#fff;display:none;flex-direction:column}
  .webview.show{display:flex}
  .wv-top{display:flex;align-items:center;gap:6px;padding:6px;border-bottom:1px solid #eee}
  .wv-btn{padding:4px 8px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer}
  .wv-url{flex:1;font-size:11px;opacity:.7;overflow:hidden;text-overflow:ellipsis}
  iframe{flex:1;border:0}
</style>

<button class="bubble br">💬</button>

<section class="panel">
  <div class="header">
    <div class="title">${CFG.title}</div>
    <button class="close">✕</button>
  </div>

  <div class="body">
    <div class="messages"></div>
    <div class="buttons"></div>

    <div class="footer">
      <textarea rows="1" placeholder="${CFG.placeholder}"></textarea>
      <button class="send">▶</button>
    </div>

    <div class="webview">
      <div class="wv-top">
        <button class="wv-btn back">← Back</button>
        <div class="wv-url"></div>
        <button class="wv-btn open">Open ↗</button>
        <button class="wv-btn close">✕</button>
      </div>
      <iframe></iframe>
    </div>
  </div>
</section>
`;

  /* ---------------- ELEMENTS ---------------- */
  const $bubble = shadow.querySelector(".bubble");
  const $panel = shadow.querySelector(".panel");
  const $header = shadow.querySelector(".header");
  const $close = shadow.querySelector(".close");
  const $messages = shadow.querySelector(".messages");
  const $buttons = shadow.querySelector(".buttons");
  const $input = shadow.querySelector("textarea");
  const $send = shadow.querySelector(".send");

  const $webview = shadow.querySelector(".webview");
  const $iframe = shadow.querySelector("iframe");
  const $wvUrl = shadow.querySelector(".wv-url");

  /* ---------------- DRAG + SNAP ---------------- */
  let drag = null;
  $header.onpointerdown = (e) => {
    drag = { x: e.clientX, y: e.clientY, r: $panel.getBoundingClientRect() };
    $header.classList.add("dragging");
    $header.setPointerCapture(e.pointerId);
  };
  $header.onpointermove = (e) => {
    if (!drag) return;
    let left = drag.r.left + (e.clientX - drag.x);
    let top = drag.r.top + (e.clientY - drag.y);

    if (left < SNAP_PX) left = 8;
    if (top < SNAP_PX) top = 8;
    if (window.innerWidth - (left + drag.r.width) < SNAP_PX)
      left = window.innerWidth - drag.r.width - 8;
    if (window.innerHeight - (top + drag.r.height) < SNAP_PX)
      top = window.innerHeight - drag.r.height - 8;

    $panel.style.left = left + "px";
    $panel.style.top = top + "px";
  };
  $header.onpointerup = () => {
    drag = null;
    $header.classList.remove("dragging");
  };

  /* ---------------- CHAT ---------------- */
  function addMsg(text, role="bot") {
    const d = document.createElement("div");
    d.className = "msg " + role;
    d.textContent = text;
    $messages.appendChild(d);
    $messages.scrollTop = $messages.scrollHeight;
  }

  function showPreview(url) {
    const u = safeUrl(url);
    if (!u) return;
    $iframe.src = u;
    $wvUrl.textContent = u;
    $webview.classList.add("show");
    addMsg("I’ve opened this in preview. You can continue browsing here or go back to chat.");
  }

  function hidePreview() {
    $webview.classList.remove("show");
    $iframe.src = "about:blank";
  }

  /* ---------------- LINKS AS INTENTS ---------------- */
  function addLinks(links) {
    $buttons.innerHTML = "";
    links.forEach(l => {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = l.label;
      b.onclick = () => {
        $input.value = l.label;
        showPreview(l.url);
      };
      $buttons.appendChild(b);
    });
  }

  /* ---------------- OPEN / CLOSE ---------------- */
  $bubble.onclick = () => {
    $panel.classList.add("open");
    $panel.style.right = "20px";
    $panel.style.bottom = "90px";
  };
  $close.onclick = () => {
    hidePreview();
    $panel.classList.remove("open");
  };

  shadow.querySelector(".wv-btn.back").onclick = hidePreview;
  shadow.querySelector(".wv-btn.close").onclick = hidePreview;
  shadow.querySelector(".wv-btn.open").onclick = () => {
    window.open($iframe.src, "_blank");
  };

  /* ---------------- DEMO INIT ---------------- */
  addMsg("Hi! How can I help?");
  addLinks([
    { label: "Show price history", url: "https://example.com" },
    { label: "Is it shock resistant?", url: "https://example.com" },
  ]);
})();
