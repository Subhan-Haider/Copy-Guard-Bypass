// Content script for Copy Guard Bypass

let isActive = false;
let isSuperActive = false;
const styleId = "copy-guard-bypass-styles";
let toastShown = false;

// Injected CSS to force user-select and pointer-events
const cssRules = `
  * {
    -webkit-user-select: text !important;
    -moz-user-select: text !important;
    -ms-user-select: text !important;
    user-select: text !important;
  }
`;

// Helper to inject/remove CSS styles
function updateStyles() {
  let styleEl = document.getElementById(styleId);
  if (isActive) {
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      styleEl.textContent = cssRules;
      (document.head || document.documentElement).appendChild(styleEl);
    }
  } else {
    if (styleEl) {
      styleEl.remove();
    }
  }
}

// Update DOM attributes that the page-context script reads
function updateDOMAttributes() {
  document.documentElement.setAttribute("data-copy-bypass-active", isActive ? "true" : "false");
  document.documentElement.setAttribute("data-copy-bypass-super", isSuperActive ? "true" : "false");
}

// Check settings and apply bypass state
function checkSettings() {
  const hostname = window.location.hostname;
  chrome.storage.local.get(["globalEnabled", "siteSettings"], (result) => {
    const globalEnabled = result.globalEnabled || false;
    const siteSettings = result.siteSettings || {};
    const siteConfig = siteSettings[hostname] || { enabled: false, superCopy: false };

    isActive = globalEnabled || siteConfig.enabled;
    isSuperActive = isActive && siteConfig.superCopy;

    updateStyles();
    updateDOMAttributes();
  });
}

// Initialize settings check
checkSettings();

// Watch for changes in storage (popup toggles / context menu toggles)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && (changes.globalEnabled || changes.siteSettings)) {
    const hostname = window.location.hostname;
    chrome.storage.local.get(["globalEnabled", "siteSettings"], (result) => {
      const globalEnabled = result.globalEnabled || false;
      const siteSettings = result.siteSettings || {};
      const siteConfig = siteSettings[hostname] || { enabled: false, superCopy: false };
      
      const newActive = globalEnabled || siteConfig.enabled;
      const newSuper = newActive && siteConfig.superCopy;
      
      if (newActive !== isActive) {
        isActive = newActive;
        isSuperActive = newSuper;
        updateStyles();
        updateDOMAttributes();
        
        if (isActive) {
          showToast("Copy Guard Bypass", "Bypass enabled on this site", true);
        } else {
          showToast("Copy Guard Bypass", "Bypass disabled on this site", false);
        }
      } else if (newSuper !== isSuperActive) {
        isSuperActive = newSuper;
        updateDOMAttributes();
        showToast(
          "Copy Guard Bypass",
          isSuperActive ? "Super Copy Mode activated" : "Super Copy Mode deactivated",
          true
        );
      }
    });
  }
});

// Event capture listeners to stop propagation of bypass events before site handlers run
const captureEvents = ["copy", "cut", "contextmenu", "selectstart", "dragstart"];

captureEvents.forEach((eventType) => {
  window.addEventListener(
    eventType,
    (e) => {
      if (isActive) {
        e.stopPropagation();
      }
    },
    true // Capture phase
  );
});

// Intercept keyboard copy commands (Ctrl+C, Cmd+C, etc.)
window.addEventListener(
  "keydown",
  (e) => {
    if (!isActive) return;

    const isCmdOrCtrl = e.ctrlKey || e.metaKey;
    if (isCmdOrCtrl) {
      const key = e.key.toLowerCase();
      if (key === "c" || key === "x" || key === "a") {
        e.stopPropagation();
      }
    }
  },
  true // Capture phase
);

// --- AUTOMATIC DETECTION & TOAST NOTIFICATION ---

// Show a modern glassmorphic toast notification when the unblocker is automatically enabled or status changes
function showToast(title = "Copy Guard Bypass", description = "Bypass automatically activated", isSuccess = true) {
  // Remove existing toast if present to handle subsequent calls cleanly
  const existingToast = document.getElementById("copy-guard-bypass-toast");
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement("div");
  toast.id = "copy-guard-bypass-toast";
  
  // Style the toast matching the light theme theme design
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    padding: "12px 18px",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    backdropFilter: "blur(10px)",
    webkitBackdropFilter: "blur(10px)",
    border: isSuccess ? "1px solid rgba(16, 185, 129, 0.25)" : "1px solid rgba(100, 116, 139, 0.25)",
    borderRadius: "14px",
    color: "#0f172a",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: "13px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(0, 0, 0, 0.02)",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    zIndex: "2147483647", // Over everything else on the page
    transform: "translateY(100px) scale(0.9)",
    opacity: "0",
    transition: "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
  });

  const iconColor = isSuccess ? "#10b981" : "#64748b";
  const iconShadow = isSuccess ? "rgba(16, 185, 129, 0.3)" : "rgba(100, 116, 139, 0.3)";
  const iconSvg = isSuccess 
    ? `<svg style="width: 13px; height: 13px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
         <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
       </svg>`
    : `<svg style="width: 13px; height: 13px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
         <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
       </svg>`;

  // Dynamic layout
  toast.innerHTML = `
    <div style="width: 22px; height: 22px; background-color: ${iconColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0; box-shadow: 0 2px 6px ${iconShadow};">
      ${iconSvg}
    </div>
    <div style="display: flex; flex-direction: column; gap: 1px;">
      <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${title}</span>
      <span style="font-size: 11px; font-weight: 500; color: #475569;">${description}</span>
    </div>
  `;

  document.body.appendChild(toast);

  // Trigger animation in
  setTimeout(() => {
    toast.style.transform = "translateY(0) scale(1)";
    toast.style.opacity = "1";
  }, 100);

  // Animate out and remove
  setTimeout(() => {
    toast.style.transform = "translateY(20px) scale(0.95)";
    toast.style.opacity = "0";
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 3500);
}

// Automatically enable the unblocker for this website and save to settings
function autoEnableBypass(reason) {
  if (isActive) return;
  isActive = true;
  
  const hostname = window.location.hostname;
  
  chrome.storage.local.get("siteSettings", (result) => {
    const siteSettings = result.siteSettings || {};
    // Automatically enable site-specific copy unblocking (standard mode first)
    siteSettings[hostname] = { enabled: true, superCopy: false };
    
    chrome.storage.local.set({ siteSettings }, () => {
      // Instantly apply bypass in content and page scopes without refresh
      updateStyles();
      updateDOMAttributes();
      showToast("Copy Guard Bypass", "Bypass automatically activated", true);
      console.log(`[Copy Guard] Automatically activated bypass on ${hostname} (reason: detected ${reason})`);
    });
  });
}

// Listen for blocking events intercepted by the page context script
document.addEventListener("copy-guard-block-detected", (e) => {
  autoEnableBypass(`blocking code intercept: ${e.detail.method} (${e.detail.type})`);
});

// Scan page for user-select style blocks
function detectCSSBlocking() {
  if (isActive) return;

  // 1. Scan inline style declarations
  try {
    const inlineNoSelect = document.querySelector('*[style*="user-select: none"], *[style*="user-select:none"]');
    if (inlineNoSelect) {
      autoEnableBypass("CSS inline style");
      return;
    }
  } catch (e) {}

  // 2. Scan document stylesheets (ignoring CORS cross-origin sheets)
  try {
    for (let i = 0; i < document.styleSheets.length; i++) {
      const sheet = document.styleSheets[i];
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;
        for (let j = 0; j < rules.length; j++) {
          const rule = rules[j];
          if (rule.cssText && (rule.cssText.includes("user-select: none") || rule.cssText.includes("user-select:none"))) {
            autoEnableBypass("CSS stylesheet rules");
            return;
          }
        }
      } catch (err) {
        // Suppress cross-origin stylesheet access warnings
      }
    }
  } catch (e) {}
}

// Run the CSS blocks scan after page load completes
if (document.readyState === "complete") {
  detectCSSBlocking();
} else {
  window.addEventListener("load", detectCSSBlocking);
}

// Listen for clean copy commands sent by background.js context menu click
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "COPY_CLEAN_TEXT") {
    const rawText = message.text || "";
    const cleanText = rawText.trim();

    navigator.clipboard.writeText(cleanText).then(() => {
      showToast("Copy Guard Bypass", "Clean text copied to clipboard!", true);
    }).catch(() => {
      // Fallback in case clipboard focus issue blocks navigator.clipboard
      try {
        const el = document.createElement("textarea");
        el.value = cleanText;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        el.remove();
        showToast("Copy Guard Bypass", "Clean text copied to clipboard!", true);
      } catch (err) {
        showToast("Copy Guard Bypass", "Failed to copy text", false);
      }
    });
  }
});


