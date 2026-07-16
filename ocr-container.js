// ocr-container.js
// Runs in the normal extension page context. Connects the sandboxed OCR page to extension storage and tabs APIs.

document.addEventListener("DOMContentLoaded", () => {
  const iframe = document.getElementById("ocr-iframe");
  const logEl = document.getElementById("container-debug-log");
  let screenshotData = null;
  let isIframeReady = false;
  let imgSource = new Image(); // Local image buffer for cropping

  function logDebug(msg) {
    if (logEl) {
      logEl.innerHTML += "<br/>" + msg;
      logEl.scrollTop = logEl.scrollHeight;
    }
    console.log(msg);
  }

  logDebug("[OCR Container] Dom loaded. Fetching screenshot from local storage...");

  // Pre-fetch the screenshot from chrome.storage.local
  chrome.storage.local.get("ocrScreenshot", (result) => {
    screenshotData = result.ocrScreenshot;
    logDebug("[OCR Container] Storage fetch complete. Screenshot data URL length: " + (screenshotData ? screenshotData.length : 0));
    if (screenshotData) {
      imgSource.src = screenshotData;
    } else {
      logDebug("[OCR Container] ERROR: Screenshot is missing from storage!");
      alert("No screenshot data found!\n\nPlease note: Chrome does not allow screenshot capture on system pages (like chrome://extensions) or the Chrome Web Store due to browser security restrictions. Please try this on any regular website (like YouTube, Wikipedia, etc.)!");
    }
    sendDataToIframe();
  });

  // Helper to send data when both screenshot is loaded and iframe is ready
  function sendDataToIframe() {
    logDebug("[OCR Container] Checking send conditions: hasData = " + (!!screenshotData) + ", iframeReady = " + isIframeReady);
    if (screenshotData && isIframeReady) {
      logDebug("[OCR Container] Sending INIT_OCR message to sandboxed iframe with library paths...");
      iframe.contentWindow.postMessage({
        type: "INIT_OCR",
        screenshot: screenshotData,
        workerPath: chrome.runtime.getURL("lib/worker.min.js"),
        langPath: chrome.runtime.getURL("lib/lang-data"),
        corePath: chrome.runtime.getURL("lib/tesseract-core.wasm.js")
      }, "*");
    }
  }

  // Listen for message events from the sandboxed iframe
  window.addEventListener("message", (event) => {
    if (!event.data) return;
    
    logDebug("[OCR Container] Message received from iframe: " + event.data.type);

    // Handle handshake confirmation
    if (event.data.type === "IFRAME_READY") {
      isIframeReady = true;
      sendDataToIframe();
    }

    // Handle cropping request (performed here in parent namespace to avoid sandboxed DOMExceptions)
    if (event.data.type === "EXECUTE_CROP") {
      const { cropX, cropY, cropWidth, cropHeight } = event.data;
      logDebug(`[OCR Container] Cropping image in parent canvas: X=${Math.round(cropX)}, Y=${Math.round(cropY)}, W=${Math.round(cropWidth)}, H=${Math.round(cropHeight)}`);
      
      try {
        const canvas = document.createElement("canvas");
        canvas.width = cropWidth;
        canvas.height = cropHeight;
        const ctx = canvas.getContext("2d");
        
        ctx.drawImage(imgSource, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        const croppedBase64 = canvas.toDataURL("image/png");
        
        logDebug("[OCR Container] Crop success. Posting cropped base64 back to sandbox...");
        iframe.contentWindow.postMessage({
          type: "PROCESS_CROP_RESULT",
          croppedBase64: croppedBase64
        }, "*");
      } catch (err) {
        logDebug("[OCR Container] ERROR during canvas crop: " + err, true);
      }
    }

    // Handle copy action
    if (event.data.type === "COPY_TEXT") {
      const text = event.data.text;
      logDebug("[OCR Container] Writing text to clipboard. Length: " + (text ? text.length : 0));
      navigator.clipboard.writeText(text).then(() => {
        logDebug("[OCR Container] Clipboard write successful.");
        // Notify iframe of successful copy to show button feedback
        iframe.contentWindow.postMessage({ type: "COPY_SUCCESS" }, "*");
      }).catch(err => {
        logDebug("[OCR Container] ERROR: Clipboard write failed: " + err);
      });
    }

    // Handle close action
    if (event.data.type === "CLOSE_TAB") {
      logDebug("[OCR Container] Closing tab and removing screenshot from storage.");
      chrome.storage.local.remove("ocrScreenshot", () => {
        window.close();
      });
    }
  });
});
