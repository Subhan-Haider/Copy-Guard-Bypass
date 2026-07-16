// Background service worker for Copy Guard Bypass

chrome.runtime.onInstalled.addListener(() => {
  // Initialize storage defaults
  chrome.storage.local.get(["globalEnabled", "siteSettings"], (result) => {
    if (result.globalEnabled === undefined) {
      chrome.storage.local.set({ globalEnabled: false });
    }
    if (result.siteSettings === undefined) {
      chrome.storage.local.set({ siteSettings: {} });
    }
  });

  // Create context menu for page right-clicks
  chrome.contextMenus.create({
    id: "toggle-bypass",
    title: "Toggle Copy Guard on this site",
    contexts: ["page"]
  });

  // Create context menu for highlighted text right-clicks
  chrome.contextMenus.create({
    id: "copy-clean",
    title: "Copy clean text",
    contexts: ["selection"]
  });
});

// Helper to toggle bypass status for a specific tab domain
function toggleBypassForTab(tab) {
  if (!tab || !tab.url) return;
  try {
    const url = new URL(tab.url);
    if (!url.protocol.startsWith("http")) return; // Only apply on web pages
    const hostname = url.hostname;

    chrome.storage.local.get("siteSettings", (result) => {
      const siteSettings = result.siteSettings || {};
      const config = siteSettings[hostname] || { enabled: false, superCopy: false };
      
      // Toggle enablement
      config.enabled = !config.enabled;
      if (!config.enabled) {
        config.superCopy = false; // Turn off super copy if disabling
      }
      siteSettings[hostname] = config;

      chrome.storage.local.set({ siteSettings }, () => {
        console.log(`[Copy Guard] Toggled bypass for ${hostname} to: ${config.enabled}`);
      });
    });
  } catch (e) {
    console.error("Failed to parse tab URL for toggling bypass:", e);
  }
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "toggle-bypass") {
    toggleBypassForTab(tab);
  } else if (info.menuItemId === "copy-clean") {
    // Send message to content script to perform copy operations on text
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "COPY_CLEAN_TEXT",
        text: info.selectionText
      });
    }
  }
});

// Listener for messages if we need to coordinate tab information
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_TAB_URL") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        sendResponse({ url: tabs[0].url });
      } else {
        sendResponse({ url: "" });
      }
    });
    return true; // Keep message channel open for async response
  }
  
  if (message.type === "START_OCR_CAPTURE") {
    // Wait for the popup to fade/close fully so it doesn't appear in the screenshot
    setTimeout(() => {
      chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error("[Copy Guard] Capture failed:", chrome.runtime.lastError);
          return;
        }
        // Save screenshot data URL to storage and open OCR crop page
        chrome.storage.local.set({ ocrScreenshot: dataUrl }, () => {
          chrome.tabs.create({ url: chrome.runtime.getURL("ocr-container.html") });
        });
      });
    }, 300);
    return false;
  }
});

