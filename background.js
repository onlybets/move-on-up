// Move On Up - background.js
// Toute la logique métier de l'extension : navigation intelligente, notifications, context menu, raccourci clavier, gestion des options

// Modes possibles
const MODES = ["standard", "root", "param", "slash-keep"]

// Fonction principale : effectue l'action de "remonter" dans l'URL selon le mode choisi
async function moveUp(overrideMode) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url) return

  // Lire le mode depuis le storage (ou utiliser overrideMode si fourni)
  let mode = overrideMode
  if (!mode) {
    const stored = await chrome.storage.local.get("mode")
    mode = stored.mode || "standard"
  }

  const u = new URL(tab.url)

  switch (mode) {
    case "standard":
      // Supprime tous les params et hash, puis enlève le dernier segment du chemin
      u.search = ""
      u.hash = ""
      {
        const segments = u.pathname.replace(/\/+$/, "").split("/")
        if (segments.length > 1) segments.pop()
        u.pathname = segments.join("/") || "/"
      }
      break
    case "slash-keep":
      // Enlève juste le dernier segment du chemin, garde params et hash
      {
        const segments = u.pathname.replace(/\/+$/, "").split("/")
        if (segments.length > 1) segments.pop()
        u.pathname = segments.join("/") || "/"
      }
      break
    case "root":
      u.pathname = "/"
      u.search = ""
      u.hash = ""
      break
    case "param":
      // Supprime un paramètre d'URL à la fois (de droite à gauche), puis hash, puis dernier segment du chemin
      if (u.search && u.search.length > 1) {
        const params = new URLSearchParams(u.search)
        const keys = Array.from(params.keys())
        if (keys.length > 0) {
          params.delete(keys[keys.length - 1])
          u.search = params.toString() ? `?${params.toString()}` : ""
        } else {
          u.search = ""
        }
      } else if (u.hash) {
        u.hash = ""
      } else {
        const segments = u.pathname.replace(/\/+$/, "").split("/")
        if (segments.length > 1) segments.pop()
        u.pathname = segments.join("/") || "/"
      }
      break
    default:
      break
  }

  const newUrl = u.toString()
  await chrome.tabs.update(tab.id, { url: newUrl })

  // Notification si activée
  const { toast } = await chrome.storage.local.get("toast")
  if (toast) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "assets/icon.png",
      title: "Redirected to",
      message: newUrl
    })
  }
}

/**
 * Met à jour les menus contextuels :
 * - Sur la page : activable/désactivable via options (enabled)
 * - Sur l'icône : toujours visible, non désactivable
 */
async function updateContextMenus(enabled) {
  await chrome.contextMenus.removeAll()

  // Menu contextuel sur la page (activable/désactivable)
  if (enabled) {
    chrome.contextMenus.create({
      id: "move-up-page",
      title: "Move up",
      contexts: ["page"]
    })
    chrome.contextMenus.create({
      id: "go-root-page",
      title: "Go to root",
      contexts: ["page"]
    })
  }

  // Menu contextuel sur l'icône (toujours visible)
  chrome.contextMenus.create({
    id: "move-up-action",
    title: "Move up",
    contexts: ["action"]
  })
  chrome.contextMenus.create({
    id: "go-root-action",
    title: "Go to root",
    contexts: ["action"]
  })
}

/**
 * Initialisation à l'installation :
 * - Désactive notification et menu contextuel page par défaut
 * - Met à jour les menus contextuels
 */
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    toast: false,
    contextMenu: false
  })
  await updateContextMenus(false)
})

/**
 * Synchronisation dynamique du menu contextuel page avec les options
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes["contextMenu"]) {
    updateContextMenus(changes["contextMenu"].newValue)
  }
})

// Action directe sur clic sur l'icône
chrome.action.onClicked.addListener(() => moveUp())

/**
 * Raccourci clavier : activable/désactivable via option "shortcut"
 */
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd === "move-up") {
    const { shortcut = true } = await chrome.storage.local.get("shortcut")
    if (shortcut) moveUp()
  }
})

/**
 * Gestion des clics sur les menus contextuels
 */
chrome.contextMenus.onClicked.addListener((info) => {
  if (
    info.menuItemId === "move-up-page" ||
    info.menuItemId === "move-up-action"
  ) {
    moveUp()
  } else if (
    info.menuItemId === "go-root-page" ||
    info.menuItemId === "go-root-action"
  ) {
    moveUp("root")
  }
})
