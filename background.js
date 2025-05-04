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

// Gestion dynamique du menu contextuel
async function updateContextMenus(enabled) {
  await chrome.contextMenus.removeAll()
  if (enabled) {
    chrome.contextMenus.create({
      id: "move-up",
      title: "Move up one level",
      contexts: ["all"]
    })
    chrome.contextMenus.create({
      id: "go-root",
      title: "Go to root",
      contexts: ["all"]
    })
  }
}

// Initialisation à l'installation
chrome.runtime.onInstalled.addListener(async () => {
  const { contextMenu } = await chrome.storage.local.get("contextMenu")
  await updateContextMenus(contextMenu !== false)
})

// Synchronisation dynamique du menu contextuel avec les options
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes["contextMenu"]) {
    updateContextMenus(changes["contextMenu"].newValue)
  }
})

// Action directe sur clic sur l'icône
chrome.action.onClicked.addListener(() => moveUp())

// Raccourci clavier
chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === "move-up") moveUp()
})

// Menu contextuel
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "move-up") moveUp()
  else if (info.menuItemId === "go-root") moveUp("root")
})
