function showWebView(url) {
  const u = safeUrl(url);
  if (!u) return;

  webviewCurrentUrl = u;

  // avoid repeating the "opened in preview" line for the same URL
  let last = null;
  try { last = localStorage.getItem(LAST_PREVIEW_URL_KEY); } catch {}
  if (last !== u) {
    addMessage("Opened in preview. You can continue browsing here or go back to chat.", "bot");
    try { localStorage.setItem(LAST_PREVIEW_URL_KEY, u); } catch {}
  }

  $wvUrl.textContent = u;
  $wvUrl.title = u;

  // reset then load
  $wvFrame.src = "about:blank";
  $webview.classList.add("show");

  // Start loading
  setTimeout(() => { $wvFrame.src = u; }, 0);

  // Fallback detection (CSP/frame-ancestors blocks iframe embedding)
  const startedAt = Date.now();
  const CHECK_MS = 900;
  const MAX_MS = 2500;

  const check = () => {
    if (!webviewCurrentUrl || webviewCurrentUrl !== u) return;

    let frameSrc = "";
    try { frameSrc = $wvFrame.getAttribute("src") || ""; } catch {}

    // If it never left about:blank after a bit, likely blocked
    if (Date.now() - startedAt > CHECK_MS) {
      let blankish = false;

      try {
        // Sometimes src remains u but browser blocks render
        blankish = ($wvFrame.contentWindow?.location?.href === "about:blank");
      } catch {
        // Cross-origin -> throws; can't use as definitive
      }

      // Heuristic: still looks blank OR user sees blocked console
      if (blankish) {
        addMessage("This page can’t be previewed here due to site security rules. Use “Open ↗” to view it in a new tab.", "bot");
        return;
      }
    }

    if (Date.now() - startedAt < MAX_MS) {
      setTimeout(check, 400);
    }
  };

  setTimeout(check, 400);
}
