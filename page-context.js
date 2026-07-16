// page-context.js
// Runs in the MAIN world (page context) to override page-level APIs.
// Reads the bypass state via DOM attributes set by the isolated content script.

(function() {
  // Override Event.prototype.preventDefault to ignore blocking events
  const originalPreventDefault = Event.prototype.preventDefault;
  Event.prototype.preventDefault = function() {
    const active = document.documentElement.getAttribute('data-copy-bypass-active') === 'true';
    const blockedEvents = ['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart'];

    if (active) {
      if (blockedEvents.includes(this.type)) {
        return;
      }
    } else {
      // If bypass is not active, but the page is calling preventDefault on selection/copying events
      if (blockedEvents.includes(this.type)) {
        // Dispatch custom DOM event to alert the content script (isolated world)
        document.dispatchEvent(new CustomEvent('copy-guard-block-detected', {
          detail: { type: this.type, method: 'preventDefault' }
        }));
      }
    }
    return originalPreventDefault.apply(this, arguments);
  };

  // Helper to override Selection methods to block sites from clearing text selections
  const overrideSelection = (method) => {
    const original = Selection.prototype[method];
    Selection.prototype[method] = function() {
      const superActive = document.documentElement.getAttribute('data-copy-bypass-super') === 'true';
      if (superActive) {
        // Trigger block detection if website tries to clear selection when bypass is not yet fully active
        const active = document.documentElement.getAttribute('data-copy-bypass-active') === 'true';
        if (!active) {
          document.dispatchEvent(new CustomEvent('copy-guard-block-detected', {
            detail: { type: 'selection-clear', method: 'Selection.' + method }
          }));
        }
        return;
      }
      return original.apply(this, arguments);
    };
  };

  overrideSelection('removeAllRanges');
  overrideSelection('empty');
  overrideSelection('collapse');
  overrideSelection('collapseToStart');
  overrideSelection('collapseToEnd');
})();

