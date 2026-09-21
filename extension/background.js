// SecureClass Proctor Companion - Background Service Worker (Manifest V3)
// Comprehensive real-time monitoring of tabs, external navigations, and desktop application switches

let secureClassTabIds = new Set();
let currentFocusedTabId = null;
let activeDepartureTime = null;
let lastExternalTarget = "External Window";
let lastExternalTitle = "External Application / Tab";
let lastWindowFocused = true;

// Utility to broadcast telemetry to all active SecureClass exam tabs
function broadcastToExamTabs(telemetry) {
  const payload = {
    type: "SECURECLASS_EXT_TELEMETRY",
    ...telemetry,
    timestamp: telemetry.timestamp || new Date().toISOString()
  };

  secureClassTabIds.forEach((examTabId) => {
    chrome.tabs.sendMessage(examTabId, payload).catch(() => {
      // Tab may have refreshed, navigated away, or closed
      secureClassTabIds.delete(examTabId);
    });
  });
}

// 1. Maintain SecureClass tab registry
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && (tab.url.includes("localhost:5173") || tab.url.includes("127.0.0.1:5173") || tab.url.includes("secureclass"))) {
    secureClassTabIds.add(tabId);
  }

  // If active tab navigated to a new external URL or updated title, report exact destination
  if (tab.active && changeInfo.url) {
    const isExam = tab.url.includes("localhost:5173") || tab.url.includes("127.0.0.1:5173") || tab.url.includes("secureclass");
    if (!isExam) {
      lastExternalTarget = changeInfo.url;
      lastExternalTitle = tab.title || changeInfo.url;
      broadcastToExamTabs({
        action: "EXTERNAL_NAVIGATION",
        target_url: changeInfo.url,
        title: tab.title || changeInfo.url,
        status: "AWAY",
        opened_at: new Date().toISOString()
      });
    }
  }
});

// 2. Tab removal listener
chrome.tabs.onRemoved.addListener((tabId) => {
  const wasExamTab = secureClassTabIds.has(tabId);
  secureClassTabIds.delete(tabId);

  if (!wasExamTab && secureClassTabIds.size > 0) {
    broadcastToExamTabs({
      action: "EXTERNAL_TAB_CLOSED",
      tab_id: tabId,
      timestamp: new Date().toISOString()
    });
  }
});

// 3. Tab creation listener (Detect new tab openings e.g. Ctrl+T or link open)
chrome.tabs.onCreated.addListener((tab) => {
  if (secureClassTabIds.size === 0) return;

  const targetUrl = tab.url || tab.pendingUrl || "about:blank (New Tab)";
  const isExam = targetUrl.includes("localhost:5173") || targetUrl.includes("127.0.0.1:5173") || targetUrl.includes("secureclass");

  if (!isExam) {
    broadcastToExamTabs({
      action: "TAB_CREATED",
      target_url: targetUrl,
      title: tab.title || "New Tab Created",
      status: "AWAY",
      opened_at: new Date().toISOString()
    });
  }
});

// 4. Tab switch / activation listener
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    currentFocusedTabId = activeInfo.tabId;
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!tab || !tab.url) return;

    const isSecureClass = tab.url.includes("localhost:5173") || tab.url.includes("127.0.0.1:5173") || tab.url.includes("secureclass");

    if (isSecureClass) {
      secureClassTabIds.add(activeInfo.tabId);

      let durationSeconds = 0;
      let departureIso = null;
      if (activeDepartureTime !== null) {
        const now = Date.now();
        durationSeconds = Math.max(0.2, Math.round(((now - activeDepartureTime) / 1000) * 10) / 10);
        departureIso = new Date(activeDepartureTime).toISOString();
        activeDepartureTime = null;
      }

      broadcastToExamTabs({
        action: "EXAM_TAB_FOCUSED",
        target_url: tab.url,
        title: tab.title || "SecureClass Exam",
        status: "FOCUSED",
        duration_seconds: durationSeconds,
        opened_at: departureIso,
        closed_at: new Date().toISOString(),
        last_target: lastExternalTarget
      });
    } else {
      // Switched to external tab
      if (activeDepartureTime === null) {
        activeDepartureTime = Date.now();
      }
      lastExternalTarget = tab.url;
      lastExternalTitle = tab.title || tab.url;

      broadcastToExamTabs({
        action: "EXTERNAL_TAB_SWITCH",
        target_url: tab.url,
        title: tab.title || "External Tab",
        status: "AWAY",
        opened_at: new Date(activeDepartureTime).toISOString()
      });
    }
  } catch (err) {
    console.error("[SecureClass Extension] Error inspecting active tab:", err);
  }
});

// 5. External Web Navigation Listener (Top-level frames)
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return; // Only top-level frame navigations
  if (!details.url) return;

  const isExam = details.url.includes("localhost:5173") || details.url.includes("127.0.0.1:5173") || details.url.includes("secureclass");
  if (!isExam && secureClassTabIds.size > 0) {
    if (activeDepartureTime === null) {
      activeDepartureTime = Date.now();
    }
    lastExternalTarget = details.url;

    broadcastToExamTabs({
      action: "EXTERNAL_NAVIGATION",
      target_url: details.url,
      transitionType: details.transitionType,
      status: "AWAY",
      opened_at: new Date(activeDepartureTime).toISOString()
    });
  }
});

// 6. Detect Non-Browser Desktop Applications (Alt+Tab or clicking outside Chrome)
// When Chrome loses OS-level window focus, windowId becomes chrome.windows.WINDOW_ID_NONE
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (secureClassTabIds.size === 0) return;

  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Focus completely left Chrome to an external desktop application!
    lastWindowFocused = false;
    if (activeDepartureTime === null) {
      activeDepartureTime = Date.now();
    }
    lastExternalTarget = "External Desktop Application (Outside Browser)";
    lastExternalTitle = "Desktop Application (OS Window Switch)";

    broadcastToExamTabs({
      action: "NON_BROWSER_APP_SWITCH",
      target_url: lastExternalTarget,
      title: lastExternalTitle,
      status: "AWAY",
      opened_at: new Date(activeDepartureTime).toISOString()
    });
  } else {
    // Chrome regained focus
    lastWindowFocused = true;
    try {
      const activeTabs = await chrome.tabs.query({ active: true, windowId });
      if (activeTabs.length > 0) {
        const tab = activeTabs[0];
        const isSecureClass = tab.url && (tab.url.includes("localhost:5173") || tab.url.includes("127.0.0.1:5173") || tab.url.includes("secureclass"));
        if (isSecureClass) {
          let durationSeconds = 0;
          let departureIso = null;
          if (activeDepartureTime !== null) {
            const now = Date.now();
            durationSeconds = Math.max(0.2, Math.round(((now - activeDepartureTime) / 1000) * 10) / 10);
            departureIso = new Date(activeDepartureTime).toISOString();
            activeDepartureTime = null;
          }

          broadcastToExamTabs({
            action: "EXAM_TAB_FOCUSED",
            target_url: tab.url,
            title: tab.title || "SecureClass Exam",
            status: "FOCUSED",
            duration_seconds: durationSeconds,
            opened_at: departureIso,
            closed_at: new Date().toISOString(),
            last_target: lastExternalTarget
          });
        }
      }
    } catch (err) {
      console.error("[SecureClass Extension] Error checking window focus regain:", err);
    }
  }
});

// 7. Periodic Heartbeat Handshake (Verify active extension connection)
setInterval(() => {
  if (secureClassTabIds.size > 0) {
    broadcastToExamTabs({
      action: "HEARTBEAT",
      version: "1.2.0",
      active_monitored_tabs: secureClassTabIds.size,
      window_focused: lastWindowFocused
    });
  }
}, 2500);

// 8. Direct message channel from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.type === "SECURECLASS_PING") {
    if (sender.tab && sender.tab.id) {
      secureClassTabIds.add(sender.tab.id);
    }
    sendResponse({
      type: "SECURECLASS_PONG",
      status: "active",
      version: "1.2.0",
      timestamp: new Date().toISOString()
    });
    return true;
  }
});

console.log("[SecureClass Extension] Advanced proctor background service worker initialized.");
