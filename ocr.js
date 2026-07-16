// ocr.js
// Handles screenshot loading, crop box selection, and offline OCR execution.

document.addEventListener("DOMContentLoaded", () => {
  const workspace = document.getElementById("workspace");
  const screenshotImg = document.getElementById("screenshot-img");
  const cropOverlay = document.getElementById("crop-overlay");
  const ocrTextarea = document.getElementById("ocr-textarea");
  const instructionText = document.getElementById("instruction-text");
  
  const loaderContainer = document.getElementById("loader-container");
  const textAreaContainer = document.getElementById("text-area-container");
  
  const closeBtn = document.getElementById("close-btn");
  const copyBtn = document.getElementById("copy-btn");

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let ocrScreenshotUrl = "";
  let workerPath = "";
  let langPath = "";
  let corePath = "";
  const logEl = document.getElementById("sandbox-debug-log");

  function logDebug(msg, isError = false) {
    if (logEl) {
      logEl.innerHTML += "<br/>" + (isError ? "<span style='color:#f87171'>" + msg + "</span>" : msg);
      logEl.scrollTop = logEl.scrollHeight;
    }
    if (isError) console.error(msg);
    else console.log(msg);
  }

  // 1. Listen for initialization from parent container
  window.addEventListener("message", (event) => {
    if (!event.data) return;
    
    logDebug("[OCR Sandbox] Message received from parent: " + event.data.type);

    if (event.data.type === "INIT_OCR") {
      ocrScreenshotUrl = event.data.screenshot;
      workerPath = event.data.workerPath;
      langPath = event.data.langPath;
      corePath = event.data.corePath;
      logDebug("[OCR Sandbox] Setting screenshot image src. URL Length: " + (ocrScreenshotUrl ? ocrScreenshotUrl.length : 0));
      
      screenshotImg.onload = () => {
        logDebug("[OCR Sandbox] Screenshot image loaded successfully! Dimensions: " + screenshotImg.naturalWidth + "x" + screenshotImg.naturalHeight);
      };
      
      screenshotImg.onerror = (err) => {
        logDebug("[OCR Sandbox] ERROR: Screenshot image failed to load. Resource blocked or invalid format.", true);
      };

      screenshotImg.src = ocrScreenshotUrl;
    }

    if (event.data.type === "PROCESS_CROP_RESULT") {
      logDebug("[OCR Sandbox] Received cropped image from parent. Executing Tesseract OCR...");
      runLocalOCR(event.data.croppedBase64);
    }

    if (event.data.type === "COPY_SUCCESS") {
      logDebug("[OCR Sandbox] Copy confirmed by parent. Displaying button success...");
      // Show visual copy feedback on button
      const originalText = copyBtn.textContent;
      copyBtn.textContent = "Copied! ✓";
      copyBtn.style.background = "#10b981"; // success color green
      
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.style.background = ""; // restore gradient
      }, 2000);
    }
  });

  // 2. Drag to Crop Event Listeners
  workspace.addEventListener("mousedown", (e) => {
    // Only drag-select if clicking left mouse button
    if (e.button !== 0) return;
    
    // Check if clicking inside side panel (which is outside workspace anyway, but safety first)
    if (e.target.closest(".side-panel")) return;

    isDragging = true;
    
    // Get scroll coordinates of workspace
    const rect = workspace.getBoundingClientRect();
    startX = e.clientX - rect.left + workspace.scrollLeft;
    startY = e.clientY - rect.top + workspace.scrollTop;

    cropOverlay.style.left = `${startX}px`;
    cropOverlay.style.top = `${startY}px`;
    cropOverlay.style.width = "0px";
    cropOverlay.style.height = "0px";
    cropOverlay.style.display = "block";
    
    e.preventDefault();
  });

  workspace.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const rect = workspace.getBoundingClientRect();
    const currentX = e.clientX - rect.left + workspace.scrollLeft;
    const currentY = e.clientY - rect.top + workspace.scrollTop;

    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(startX - currentX);
    const height = Math.abs(startY - currentY);

    cropOverlay.style.left = `${x}px`;
    cropOverlay.style.top = `${y}px`;
    cropOverlay.style.width = `${width}px`;
    cropOverlay.style.height = `${height}px`;
  });

  workspace.addEventListener("mouseup", (e) => {
    if (!isDragging) return;
    isDragging = false;

    // Get final crop bounds
    const overlayLeft = parseFloat(cropOverlay.style.left);
    const overlayTop = parseFloat(cropOverlay.style.top);
    const overlayWidth = parseFloat(cropOverlay.style.width);
    const overlayHeight = parseFloat(cropOverlay.style.height);

    // Hide crop overlay box shadow
    cropOverlay.style.display = "none";

    // Reject extremely tiny selections (accidental clicks)
    if (overlayWidth < 10 || overlayHeight < 10) {
      return;
    }

    processCroppedArea(overlayLeft, overlayTop, overlayWidth, overlayHeight);
  });

  // 3. Crop selection onto hidden canvas (Delegated to parent container to avoid sandbox canvas taint DOMExceptions)
  function processCroppedArea(x, y, width, height) {
    const imgRect = screenshotImg.getBoundingClientRect();
    const workspaceRect = workspace.getBoundingClientRect();

    // Find image offset inside workspace padding/scrolling
    const imgLeft = imgRect.left - workspaceRect.left + workspace.scrollLeft;
    const imgTop = imgRect.top - workspaceRect.top + workspace.scrollTop;

    // Calculate crop boundary relative to the display image boundary
    const relativeX = x - imgLeft;
    const relativeY = y - imgTop;

    // Reject if selection is completely outside the screenshot bounds
    if (relativeX + width < 0 || relativeY + height < 0 || relativeX > imgRect.width || relativeY > imgRect.height) {
      alert("Please draw the crop box inside the boundaries of the webpage screenshot!");
      return;
    }

    // Scale display boundaries to natural image resolution
    const scaleX = screenshotImg.naturalWidth / imgRect.width;
    const scaleY = screenshotImg.naturalHeight / imgRect.height;

    const cropX = Math.max(0, relativeX) * scaleX;
    const cropY = Math.max(0, relativeY) * scaleY;
    const cropWidth = Math.min(width, imgRect.width - Math.max(0, relativeX)) * scaleX;
    const cropHeight = Math.min(height, imgRect.height - Math.max(0, relativeY)) * scaleY;

    logDebug("[OCR Sandbox] Selection made. Requesting canvas crop from parent container...");

    // Request parent to crop the image securely
    window.parent.postMessage({
      type: "EXECUTE_CROP",
      cropX: cropX,
      cropY: cropY,
      cropWidth: cropWidth,
      cropHeight: cropHeight
    }, "*");
  }

  // 4. Initialize local Tesseract and execute OCR offline
  async function runLocalOCR(imageBase64) {
    // Show Loading Panel state
    textAreaContainer.style.opacity = "0.3";
    loaderContainer.style.display = "flex";
    instructionText.textContent = "Processing selected pixels...";
    
    try {
      const { createWorker } = Tesseract;
      
      // Initialize offline-capable worker pointing to local Chrome extension directory paths
      const worker = await createWorker({
        workerPath: workerPath,
        langPath: langPath,
        corePath: corePath,
        workerBlobURL: true, // Required for sandboxed contexts to spawn same-origin workers under origin 'null'
        gzip: false,
        logger: (m) => {
          if (m.status === "recognizing text") {
            document.getElementById("loader-text").textContent = `Reading text: ${Math.round(m.progress * 100)}%`;
          }
        }
      });

      await worker.loadLanguage("eng");
      await worker.initialize("eng");
      
      const { data: { text } } = await worker.recognize(imageBase64);
      await worker.terminate();

      // Display text
      ocrTextarea.value = text && text.trim() ? text.trim() : "No text was detected in the cropped area. Try drawing a tighter box around high-contrast text.";
      instructionText.textContent = "Extraction complete! Drag a new box to scan another area.";
      
    } catch (error) {
      console.error("[Copy Guard OCR Error]:", error);
      ocrTextarea.value = `OCR Extraction Failed.\n\nError: ${error.message || error}\n\nMake sure you are selecting a region with clear text layout.`;
      instructionText.textContent = "Error occurred during text scanning.";
    } finally {
      // Restore panels
      loaderContainer.style.display = "none";
      textAreaContainer.style.opacity = "1";
    }
  }

  // 5. Button Actions (Communicates via postMessage to parent container)
  copyBtn.addEventListener("click", () => {
    const text = ocrTextarea.value;
    if (!text || text.startsWith("Selected text will appear here") || text.startsWith("OCR Extraction Failed")) {
      return;
    }
    window.parent.postMessage({ type: "COPY_TEXT", text: text }, "*");
  });

  closeBtn.addEventListener("click", () => {
    logDebug("[OCR Sandbox] Close button clicked. Dispatching CLOSE_TAB...");
    window.parent.postMessage({ type: "CLOSE_TAB" }, "*");
  });

  // 6. Notify parent container that iframe is ready to receive data
  logDebug("[OCR Sandbox] Dispatching IFRAME_READY handshake...");
  window.parent.postMessage({ type: "IFRAME_READY" }, "*");
});
