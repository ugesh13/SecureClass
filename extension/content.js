// SecureClass Content Script
// Bridges extension events from background worker into the exam web runtime

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "SECURECLASS_EXT_TELEMETRY") {
    // Forward full telemetry object to SecureClass React application via window.postMessage
    window.postMessage({
      type: "SECURECLASS_TELEMETRY",
      source: "SECURECLASS_CHROME_EXTENSION",
      ...message
    }, "*");
  }
});

// Listen for ping from web application and respond via background
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SECURECLASS_PAGE_PING") {
    chrome.runtime.sendMessage({ type: "SECURECLASS_PING" }, (response) => {
      window.postMessage({
        type: "SECURECLASS_EXT_PONG",
        source: "SECURECLASS_CHROME_EXTENSION",
        response
      }, "*");
    });
  }
});

// Announce presence immediately to SecureClass web application
window.postMessage({
  type: "SECURECLASS_EXT_READY",
  version: "1.2.0",
  source: "SECURECLASS_CHROME_EXTENSION"
}, "*");

console.log("[SecureClass Extension] Proctor bridge attached to page.");
