// popup.js

document.addEventListener("DOMContentLoaded", () => {
  const siteBypassToggle = document.getElementById("site-bypass-toggle");
  const superCopyToggle = document.getElementById("super-copy-toggle");
  const globalBypassToggle = document.getElementById("global-bypass-toggle");
  const superCopyItem = document.getElementById("super-copy-item");
  
  const statusCard = document.getElementById("status-card");
  const statusText = document.getElementById("status-text");
  const domainInfo = document.getElementById("domain-info");

  let currentHostname = "";

  // Get active tab and retrieve settings
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) {
      const urlString = tabs[0].url || "";
      try {
        if (urlString.startsWith("http://") || urlString.startsWith("https://")) {
          const url = new URL(urlString);
          currentHostname = url.hostname;
          domainInfo.textContent = currentHostname;
        } else {
          // Special Chrome tabs or file URLs
          currentHostname = "";
          domainInfo.textContent = "Bypass disabled on this page";
          siteBypassToggle.disabled = true;
          superCopyToggle.disabled = true;
          superCopyItem.classList.add("disabled");
        }
      } catch (e) {
        currentHostname = "";
        domainInfo.textContent = "Unsupported page";
        siteBypassToggle.disabled = true;
        superCopyToggle.disabled = true;
        superCopyItem.classList.add("disabled");
      }
    }

    // Load configurations from storage
    chrome.storage.local.get(["globalEnabled", "siteSettings"], (result) => {
      const globalEnabled = result.globalEnabled || false;
      const siteSettings = result.siteSettings || {};
      
      globalBypassToggle.checked = globalEnabled;

      if (currentHostname) {
        const siteConfig = siteSettings[currentHostname] || { enabled: false, superCopy: false };
        siteBypassToggle.checked = siteConfig.enabled;
        superCopyToggle.checked = siteConfig.superCopy;
        
        // Super Copy can only be activated if Site Bypass is enabled
        if (siteConfig.enabled) {
          superCopyToggle.disabled = false;
          superCopyItem.classList.remove("disabled");
        } else {
          superCopyToggle.disabled = true;
          superCopyItem.classList.add("disabled");
        }
      }

      updateStatusUI(globalEnabled, currentHostname, siteSettings);
    });
  });

  // Handle site-specific toggle changes
  siteBypassToggle.addEventListener("change", () => {
    if (!currentHostname) return;

    const enabled = siteBypassToggle.checked;
    
    // Enable/disable Super Copy control
    if (enabled) {
      superCopyToggle.disabled = false;
      superCopyItem.classList.remove("disabled");
    } else {
      superCopyToggle.checked = false;
      superCopyToggle.disabled = true;
      superCopyItem.classList.add("disabled");
    }

    chrome.storage.local.get("siteSettings", (result) => {
      const siteSettings = result.siteSettings || {};
      if (!siteSettings[currentHostname]) {
        siteSettings[currentHostname] = { enabled: false, superCopy: false };
      }
      siteSettings[currentHostname].enabled = enabled;
      if (!enabled) {
        siteSettings[currentHostname].superCopy = false;
      }

      chrome.storage.local.set({ siteSettings }, () => {
        chrome.storage.local.get("globalEnabled", (res) => {
          updateStatusUI(res.globalEnabled || false, currentHostname, siteSettings);
        });
      });
    });
  });

  // Handle Super Copy toggle changes
  superCopyToggle.addEventListener("change", () => {
    if (!currentHostname) return;

    const superCopy = superCopyToggle.checked;

    chrome.storage.local.get("siteSettings", (result) => {
      const siteSettings = result.siteSettings || {};
      if (!siteSettings[currentHostname]) {
        siteSettings[currentHostname] = { enabled: true, superCopy: false };
      }
      siteSettings[currentHostname].superCopy = superCopy;

      chrome.storage.local.set({ siteSettings }, () => {
        chrome.storage.local.get("globalEnabled", (res) => {
          updateStatusUI(res.globalEnabled || false, currentHostname, siteSettings);
        });
      });
    });
  });

  // Handle global toggle changes
  globalBypassToggle.addEventListener("change", () => {
    const globalEnabled = globalBypassToggle.checked;

    chrome.storage.local.set({ globalEnabled }, () => {
      chrome.storage.local.get("siteSettings", (result) => {
        updateStatusUI(globalEnabled, currentHostname, result.siteSettings || {});
      });
    });
  });

  // Handle OCR button clicks
  const ocrBtn = document.getElementById("ocr-btn");
  if (ocrBtn) {
    ocrBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "START_OCR_CAPTURE" });
      window.close(); // Close the popup immediately to clear the screen for capture
    });
  }

  // Update Status Box styling and wording based on current active settings
  function updateStatusUI(globalEnabled, hostname, siteSettings) {
    const siteConfig = hostname ? (siteSettings[hostname] || { enabled: false, superCopy: false }) : { enabled: false, superCopy: false };
    const isActive = globalEnabled || siteConfig.enabled;

    if (isActive) {
      statusCard.classList.add("active");
      if (globalEnabled) {
        statusText.textContent = "Active globally";
      } else if (siteConfig.superCopy) {
        statusText.textContent = "Super Copy active";
      } else {
        statusText.textContent = "Bypass active";
      }
    } else {
      statusCard.classList.remove("active");
      if (!hostname) {
        statusText.textContent = "Bypass unavailable";
      } else {
        statusText.textContent = "Inactive on this site";
      }
    }
  }
});
