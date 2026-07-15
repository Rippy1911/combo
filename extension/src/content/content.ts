/** Content script stub for DOM interaction (Phase C). */
const COMBO_CONTENT_MARKER = "combo-content-v0.1";

function markPage(): void {
  document.documentElement.dataset.comboContent = COMBO_CONTENT_MARKER;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", markPage);
} else {
  markPage();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "combo:content-ping") {
    sendResponse({ ok: true, marker: COMBO_CONTENT_MARKER });
    return true;
  }
  return false;
});
