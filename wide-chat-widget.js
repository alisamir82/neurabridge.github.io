// wide-chat-widget.js
(() => {
  const currentScript = document.currentScript;

  const CFG = {
    endpoint: currentScript?.dataset.endpoint || "",
    chatId: currentScript?.dataset.chatId || null,
    lang: (currentScript?.dataset.lang || "en").toLowerCase(),
    pageUrl: currentScript?.dataset.pageUrl || window.location.href,
    primary: currentScript?.dataset.primary || "#CC0000", // Canon red by default
    maxWidth: currentScript?.dataset.maxWidth || "1100px",
  };

  // ---------- inject minimal CSS (scoped) ----------
  if (!document.getElementById("canon-wide-chat-widget-styles")) {
    const style = document.createElement("style");
    style.id = "canon-wide-chat-widget-styles";
    style.textContent = `
      .cwc-wide-root {
        box-sizing: border-box;
        width: 100%;
        display: flex;
        justify-content: center;
        padding: 32px 16px;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }

      .cwc-wide-inner {
        width: 100%;
        max-width: ${CFG.maxWidth};
      }

      .cwc-wide-title {
        font-size: 32px;
        font-weight: 700;
        margin: 0 0 16px;
        color: #111827;
      }

      .cwc-wide-subtitle {
        font-size: 14px;
        color: #6b7280;
        margin-bottom: 12px;
      }

      .cwc-wide-search-row {
        display: flex;
        gap: 8px;
        align-items: stretch;
        margin-bottom: 6px;
      }

      .cwc-wide-search-wrap {
        position: relative;
        flex: 1 1 auto;
        display: flex;
        align-items: center;
        background: #ffffff;
        border-radius: 999px;
        border: 1px solid #d1d5db;
        box-shadow: 0 1px 2px rgba(15,23,42,0.08);
        padding: 0 16px;
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
        padding: 0 20px;
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
      }

      .cwc-wide-search-submit:disabled {
        opacity: 0.7;
        cursor: default;
      }

      .cwc-wide-suggestions {
        position: relative;
        width: 100%;
      }

      .cwc-wide-suggestions-panel {
        margin-top: 4px;
        border-radius: 12px;
        background: #f3f4f6;
        border: 1px solid #e5e7eb;
        padding: 8px 0;
        max-height: 220px;
        overflow-y: auto;
        box-shadow: 0 8px 16px rgba(15,23,42,0.08);
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
        margin-top: 12px;
        border-radius: 16px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        padding: 16px 16px 12px;
        min-height: 220px;
        max-height: 360px;
        overflow-y: auto;
        box-shadow: 0 8px 20px rgba(15,23,42,0.08);
        font-size: 14px;
        color: #111827;
      }

      .cwc-wide-message {
        margin-bottom: 12px;
        line-height: 1.5;
      }

      .cwc-wide-message-user {
        text-align: right;
      }

      .cwc-wide-badge {
        display: inline-block;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #9ca3af;
        margin-bottom: 4px;
      }

      .cwc-wide-bubble {
        display: inline-block;
        padding: 8px 12px;
        border-radius: 16px;
        max-width: 70%;
      }

      .cwc-wide-bubble-user {
        background: #111827;
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
      }

      @media (max-width: 640px) {
        .cwc-wide-title {
          font-size: 24px;
        }
        .cwc-wide-search-row {
          flex-direction: column;
          align-items: stretch;
        }
        .cwc-wide-search-submit {
          width: 100%;
          height: 40px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ---------- build DOM ----------
  const root = document.createElement("section");
  root.className = "cwc-wide-root";

  root.innerHTML = `
    <div class="cwc-wide-inner">
      <h1 class="cwc-wide-title">Ask Canon AI to help</h1>
      <div class="cwc-wide-subtitle">Search Canon Product Catalogue</div>

      <div class="cwc-wide-search-row">
        <div class="cwc-wide-search-wrap">
          <input
            type="text"
            class="cwc-wide-search-input"
            placeholder="Search Canon Product Catalogue"
            aria-label="Search Canon Product Catalogue"
          />
          <button class="cwc-wide-search-icon" aria-label="Search">
            &#128269;
          </button>
        </div>
        <button class="cwc-wide-search-submit">Show results</button>
      </div>

      <div class="cwc-wide-suggestions"></div>

      <div class="cwc-wide-results" aria-live="polite"></div>
    </div>
  `;

  document.body.appendChild(root);

  // ---------- behaviour ----------
  const inputEl = root.querySelector(".cwc-wide-search-input");
  const iconBtn = root.querySelector(".cwc-wide-search-icon");
  const submitBtn = root.querySelector(".cwc-wide-search-submit");
  const suggestionsRoot = root.querySelector(".cwc-wide-suggestions");
  const resultsEl = root.querySelector(".cwc-wide-results");

  const suggestions = [
    "Recommend a beginner-friendly camera",
    "I’m looking for a home printer",
    "Which ink is compatible with my inkjet printer?",
    "Compare the EOS R5 and EOS R6",
    "Help me choose a lens for travel photography",
    "Show me Canon printers for a small office"
  ];

  let suggestionsPanel = null;
  let isRequestInFlight = false;

  function renderSuggestions() {
    if (suggestionsPanel) {
      suggestionsPanel.remove();
    }
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

  function appendMessage(role, text, links) {
    const msg = document.createElement("div");
    msg.className =
      "cwc-wide-message" +
      (role === "user" ? " cwc-wide-message-user" : "");

    const badge = document.createElement("div");
    badge.className = "cwc-wide-badge";
    badge.textContent = role === "user" ? "You" : "Canon AI";

    const bubble = document.createElement("div");
    bubble.className =
      "cwc-wide-bubble " +
      (role === "user"
        ? "cwc-wide-bubble-user"
        : "cwc-wide-bubble-bot");
    bubble.textContent = text;

    msg.appendChild(badge);
    msg.appendChild(bubble);

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
        a.textContent = l.label;
        linksWrap.appendChild(a);
      });
      msg.appendChild(linksWrap);
    }

    resultsEl.appendChild(msg);
    resultsEl.scrollTop = resultsEl.scrollHeight;
  }

  function setLoading(isLoading) {
    isRequestInFlight = isLoading;
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? "Working…" : "Show results";
  }

  async function triggerSearch() {
    const query = (inputEl.value || "").trim();
    if (!query || isRequestInFlight) return;

    hideSuggestions();
    appendMessage("user", query);
    setLoading(true);

    // optimistic “thinking” line
    const thinkingId = `thinking-${Date.now()}`;
    appendMessage(
      "bot",
      "Hmm, let me check that for you. One moment please…"
    );
    const thinkingEl = resultsEl.lastElementChild;
    thinkingEl.dataset.thinkingId = thinkingId;

    if (!CFG.endpoint) {
      // No backend configured – just stop at the “thinking” message.
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(CFG.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          lang: CFG.lang,
          chatId: CFG.chatId,
          pageUrl: CFG.pageUrl,
          source: "wide-widget",
        }),
      });

      const data = await res.json();

      // Remove the temporary thinking message
      if (thinkingEl && thinkingEl.parentElement === resultsEl) {
        resultsEl.removeChild(thinkingEl);
      }

      const answer = data.answer || "Sorry, I couldn’t find an answer for that.";
      const links = Array.isArray(data.links) ? data.links : [];
      appendMessage("bot", answer, links);
    } catch (err) {
      console.error("wide-chat-widget error", err);
      if (thinkingEl && thinkingEl.parentElement === resultsEl) {
        resultsEl.removeChild(thinkingEl);
      }
      appendMessage(
        "bot",
        "Sorry, something went wrong while contacting Canon AI. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // ---------- event wiring ----------
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
    if (!root.contains(e.target)) {
      hideSuggestions();
    }
  });
})();
