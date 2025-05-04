// Move On Up – options.js
// Gère la synchronisation UI <-> chrome.storage.local pour toutes les options

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("options-form")
  const modeInputs = form.elements["mode"]
  const toastCheckbox = document.getElementById("toast")
  const contextMenuCheckbox = document.getElementById("contextMenu")

  // Charger les valeurs actuelles
  const { mode = "standard", toast = false, contextMenu = false } = await chrome.storage.local.get([
    "mode",
    "toast",
    "contextMenu"
  ])

  // Appliquer à l'UI
  for (const input of modeInputs) {
    input.checked = input.value === mode
  }
  toastCheckbox.checked = !!toast
  contextMenuCheckbox.checked = !!contextMenu

  // Gestion des changements
  for (const input of modeInputs) {
    input.addEventListener("change", () => {
      if (input.checked) {
        chrome.storage.local.set({ mode: input.value })
      }
    })
  }
  toastCheckbox.addEventListener("change", () => {
    chrome.storage.local.set({ toast: toastCheckbox.checked })
  })
  contextMenuCheckbox.addEventListener("change", () => {
    chrome.storage.local.set({ contextMenu: contextMenuCheckbox.checked })
  })
})
