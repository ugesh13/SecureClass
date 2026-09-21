# SecureClass Companion Proctor Extension (Manifest V3)

This extension provides continuous, tamper-resistant monitoring of student window and tab activity during proctored exams, relaying real-time telemetry to the teacher console.

## Monitored Behaviors
1. **New Tab / Window Creation**: Detects and logs when a student opens a new tab (`Ctrl+T` / menu) or window (`chrome.tabs.onCreated`).
2. **External Web Navigations**: Captures the exact URL, domain, and page title whenever a student visits an external site (e.g. `chatgpt.com`, `chegg.com`, `stackoverflow.com`).
3. **Tab Switching & Closing**: Tracks when students switch away from the exam tab (`chrome.tabs.onActivated`) and when external tabs are closed (`chrome.tabs.onRemoved`).
4. **Desktop Application Detection**: Detects when focus completely leaves the browser (`chrome.windows.onFocusChanged` with `WINDOW_ID_NONE`) to an external desktop application (e.g. Discord, VS Code, Calculator, Terminal).
5. **Exact Excursion Durations & Timestamps**: Calculates the exact seconds spent away from the exam tab and attaches precise `opened_at` and `closed_at` timestamps.
6. **Live Heartbeat Handshake**: Sends periodic heartbeats (`SECURECLASS_EXT_HEARTBEAT`) every 2.5 seconds to confirm proctoring protection is active.

## How to Install (Unpacked Mode)

1. Open **Google Chrome**, **Microsoft Edge**, or **Brave**.
2. Navigate to `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (toggle switch in the top-right corner).
4. Click **Load unpacked**.
5. Select this folder: `secureclass/extension`.
6. The extension is now active. When taking an exam on SecureClass, the header displays `Companion Active` with a live green indicator, and all excursions are reported in real-time to the teacher console.

