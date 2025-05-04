// =============================================================================
// Move On Up – background.js
// -----------------------------------------------------------------------------
//   Smart "move up" navigation with 4 selectable modes and a rich context‑menu.
//   Both the action‑menu (extension icon) and the page context‑menu show
//   IDENTICAL entries – except that, **in the action‑menu only**, the dynamic
//   list of candidate URLs is now grouped under a "Navigate up" sub‑menu:
//       • Move up – standard
//       • Go to root
//       • Move up – remove last param
//       • Move up – keep params/hash
//       — separator —
//       • Navigate up ▸  (submenu, ACTION menu only)
//           • url‑1
//           • url‑2 …  (deepest → root, incl. sub‑domains)
//
//   Each entry triggers the corresponding behaviour ONCE, without changing the
//   user’s default mode (stored in chrome.storage.local → "mode").
//
//   Default mode on fresh install = "standard".
// =============================================================================

/******************************  Constants  ***********************************/

/** Valid navigation modes recognised by the algorithm */
const NAV_MODES = [
  "standard",    // default: clear search/hash → up one path → drop sub‑domains
  "root",        // jump to "/" then drop sub‑domains progressively
  "param",       // remove one query param (then hash) before behaving like standard
  "slash-keep"   // keep search/hash, up one path, then drop sub‑domains
];

/** Map <context‑menu‑item‑id, target‑URL> for the dynamic jump list */
const menuUrlMap = new Map();

/******************************  Helpers  *************************************/

/** Remove redundant trailing slashes for consistent comparisons */
function stripTrailing (path) {
  return path.replace(/\/+$/, "");
}

/** Remove one left‑most sub‑domain. Returns true if something was removed. */
function removeOneSubdomain (urlObj) {
  const parts = urlObj.hostname.split(".");
  if (parts.length > 2) {
      parts.shift();
      urlObj.hostname = parts.join(".");
      return true;
  }
  return false;
}

/*************************  Core navigation logic  ****************************/

/**
* "Standard" next‑higher URL
*   1. Clear search & hash (if present)
*   2. Pop last path segment (while > 1 segment)
*   3. Remove one sub‑domain at a time
* Returns null if already at the top‑most URL.
*/
function computeNextStandard (currentUrl) {
  const u = new URL(currentUrl);

  // 1. Clear query parameters & hash fragment
  if (u.search && u.search.length > 1) {
      u.search = "";
      u.hash   = "";
  } else if (u.hash) {
      u.hash = "";
  }

  // 2. Pop one path segment (if possible)
  const segments = stripTrailing(u.pathname).split("/");
  if (segments.length > 1) {
      segments.pop();
      u.pathname = segments.join("/") || "/";
      return u.toString();
  }

  // 3. Sub‑domain removal
  if (removeOneSubdomain(u)) {
      return u.toString();
  }

  return null;    // No higher location possible
}

/** Build the full chain of candidate URLs from deepest → root (excluding current) */
function buildCandidateList (currentUrl) {
  const list  = [];
  let   next  = computeNextStandard(currentUrl);
  let   guard = 0;          // safety against infinite loops

  while (next && guard++ < 50) {
      list.push(next);
      next = computeNextStandard(next);
  }
  return list;
}

/**
* Execute *one single* upward navigation step according to the selected mode.
* The logic aligns variants (param / slash‑keep) with the standard algorithm
* once their specific behaviour is exhausted.
*/
function applyModeOnce (currentUrl, mode) {
  const u = new URL(currentUrl);

  switch (mode) {
      //------------------------------------------------------------------
      // ROOT MODE – go to "/" immediately, then start deleting sub‑domains
      //------------------------------------------------------------------
      case "root": {
          // Always clear search & hash first
          u.search = "";
          u.hash   = "";

          if (stripTrailing(u.pathname) !== "") {
              // Still in a sub‑path → just reset to "/"
              u.pathname = "/";
              return u.toString();
          }

          // Already at "/" → remove one sub‑domain if possible
          if (removeOneSubdomain(u)) {
              return u.toString();
          }
          return currentUrl; // Nothing left to trim
      }

      //------------------------------------------------------------------
      // PARAM MODE – remove one query parameter, then hash, then behave standard
      //------------------------------------------------------------------
      case "param": {
          if (u.search && u.search.length > 1) {
              const params = new URLSearchParams(u.search);
              const keys   = Array.from(params.keys());
              params.delete(keys[keys.length - 1]);
              u.search = params.toString() ? `?${params}` : "";
              return u.toString();
          }

          if (u.hash) {
              u.hash = "";
              return u.toString();
          }

          // Fall back to standard behaviour
          return computeNextStandard(currentUrl) || currentUrl;
      }

      //------------------------------------------------------------------
      // SLASH‑KEEP MODE – keep search/hash, pop one path, then remove sub‑domain
      //------------------------------------------------------------------
      case "slash-keep": {
          const segments = stripTrailing(u.pathname).split("/");

          if (segments.length > 1) {
              segments.pop();
              u.pathname = segments.join("/") || "/";
              return u.toString();
          }

          // Path already at "/" → attempt sub‑domain removal (retaining search/hash)
          if (removeOneSubdomain(u)) {
              return u.toString();
          }
          return currentUrl;
      }

      //------------------------------------------------------------------
      // STANDARD MODE (default)
      //------------------------------------------------------------------
      case "standard":
      default:
          return computeNextStandard(currentUrl) || currentUrl;
  }
}

/******************************  Move action  ***************************/

/** Perform a one‑shot navigation. If modeOverride is undefined, use stored mode. */
async function performMoveUp (modeOverride) {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id || !activeTab.url) return;

  // Determine which mode to apply
  let mode = modeOverride;
  if (!mode) {
      const { mode: storedMode = "standard" } = await chrome.storage.local.get("mode");
      mode = NAV_MODES.includes(storedMode) ? storedMode : "standard";
  }

  const targetUrl = applyModeOnce(activeTab.url, mode);
  if (!targetUrl || targetUrl === activeTab.url) return; // No change

  await chrome.tabs.update(activeTab.id, { url: targetUrl });

  const { toast = false } = await chrome.storage.local.get("toast");
  if (toast) {
      chrome.notifications.create({
          type   : "basic",
          iconUrl: "assets/icon.png",
          title  : "Redirected to",
          message: targetUrl
      });
  }
}

/*************************  Context‑menu builder  ****************************/

async function rebuildContextMenus (includePageMenu) {
  // Clear existing menus --------------------------------------------------
  await chrome.contextMenus.removeAll();

  // Context types where menus will appear
  const contexts = includePageMenu ? ["action", "page"] : ["action"];

  // ---------------------------------------------------------------------
  // Fixed primary actions (one‑shot, do NOT change stored default mode)
  // ---------------------------------------------------------------------
  chrome.contextMenus.create({
      id      : "once-standard",
      title   : "Move up - standard",
      contexts
  });

  chrome.contextMenus.create({
      id      : "once-root",
      title   : "Go to root",
      contexts
  });

  chrome.contextMenus.create({
      id      : "once-param",
      title   : "Move up - remove last param",
      contexts
  });

  chrome.contextMenus.create({
      id      : "once-slash",
      title   : "Move up - keep params/hash",
      contexts
  });

  // ---------------------------------------------------------------------
  // Separator before dynamic list / submenu
  // ---------------------------------------------------------------------
  chrome.contextMenus.create({
      id      : "sep-dynamic",
      type    : "separator",
      contexts
  });

  // ---------------------------------------------------------------------
  // Dynamic jump list – grouped in ACTION menu, flat in PAGE menu
  // ---------------------------------------------------------------------
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  menuUrlMap.clear();

  if (!activeTab?.url) return;

  // Parent submenu for ACTION menu only
  const parentActionId = "navigate-up";
  chrome.contextMenus.create({
      id      : parentActionId,
      title   : "Navigate up",
      contexts: ["action"]
  });

  const candidates = buildCandidateList(activeTab.url);
  candidates.forEach((url, index) => {
      const parsed = new URL(url);

      // ---------------- ACTION MENU (submenu) ----------------
      const actionItemId = `jump-action-${index}`;
      menuUrlMap.set(actionItemId, url);
      chrome.contextMenus.create({
          id       : actionItemId,
          parentId : parentActionId,
          title    : `${parsed.hostname}${parsed.pathname}`,
          contexts : ["action"]
      });

      // ---------------- PAGE MENU (flat list) ----------------
      if (includePageMenu) {
          const pageItemId = `jump-page-${index}`;
          menuUrlMap.set(pageItemId, url);
          chrome.contextMenus.create({
              id      : pageItemId,
              title   : `${parsed.hostname}${parsed.pathname}`,
              contexts: ["page"]
          });
      }
  });
}

/******************************  Listeners  *****************************/

// First‑time installation → default settings
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
      mode        : "standard",  // default navigation mode
      toast       : false,        // notifications disabled by default
      contextMenu : false,        // page context‑menu disabled by default
      shortcut    : true          // keyboard shortcut enabled
  });

  await rebuildContextMenus(false);
});

// Option toggles stored in chrome.storage.local
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes["contextMenu"]) {
      rebuildContextMenus(changes["contextMenu"].newValue);
  }
});

// Keep dynamic list fresh when active tab changes
chrome.tabs.onActivated.addListener(async () => {
  const { contextMenu = false } = await chrome.storage.local.get("contextMenu");
  rebuildContextMenus(contextMenu);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.url) {
      const { contextMenu = false } = await chrome.storage.local.get("contextMenu");
      rebuildContextMenus(contextMenu);
  }
});

// Icon click → perform move‑up with stored default mode
chrome.action.onClicked.addListener(() => performMoveUp());

// Keyboard shortcut (if enabled)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "move-up") {
      const { shortcut = true } = await chrome.storage.local.get("shortcut");
      if (shortcut) {
          performMoveUp();
      }
  }
});

// Context‑menu click handling ------------------------------------------------
chrome.contextMenus.onClicked.addListener((info) => {
  // One‑shot primary actions
  if (info.menuItemId === "once-standard") {
      performMoveUp("standard");
      return;
  }
  if (info.menuItemId === "once-root") {
      performMoveUp("root");
      return;
  }
  if (info.menuItemId === "once-param") {
      performMoveUp("param");
      return;
  }
  if (info.menuItemId === "once-slash") {
      performMoveUp("slash-keep");
      return;
  }

  // Dynamic jump list entries
  if (menuUrlMap.has(info.menuItemId)) {
      const target = menuUrlMap.get(info.menuItemId);
      chrome.tabs.update(info.tabId, { url: target });
  }
});
