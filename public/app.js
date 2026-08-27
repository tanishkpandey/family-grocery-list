/**
 * Family Grocery List - Client Application Logic
 * Ultra-lightweight vanilla JS with Server-Sent Events (SSE) realtime collaboration.
 * Features:
 *  - Offline Detection & Warning Banner with Auto-Recovery
 *  - Reliable Enter Key submission for both Item Name and Quantity on Mobile & Desktop
 *  - Configurable Quick Add Items with Local Storage Persistence & Modal Editor
 *  - Consistent Typography with Plus Jakarta Sans & Outfit
 *  - Smooth Page Transitions
 *  - Auto-Delete Empty List & Auto-Redirect to Home when all items are deleted
 *  - Emoji Presence Avatars (🦚, 🪷, 🐘, 🥭, 🫖, 🐯, 🥥, 🪔, 🌻)
 *  - Indian Cultural Household Grocery Elements
 *  - Lists-First Dashboard with unique names and direct deletion
 *  - Footer: Made by Tanishk with love ❤️
 *  - Custom Theme Palette: #F4EEFF, #DCD6F7, #A6B1E1, #424874
 */

;(function () {
  "use strict"

  // --- DEFAULT QUICK ADD CHIPS ---
  const DEFAULT_QUICK_CHIPS = [
    { label: "🥛 Doodh", item: "Milk (दूध)", qty: "2 pkts" },
    { label: "☕ Chai", item: "Chai Patti", qty: "500g" },
    { label: "🌾 Atta", item: "Atta / Chawal", qty: "5 kg" },
    { label: "🥣 Dahi", item: "Dahi (Curd)", qty: "1 pkt" },
    { label: "🧈 Paneer", item: "Paneer", qty: "250g" },
    { label: "🧅 Aloo-Pyaaz", item: "Pyaaz / Aloo", qty: "2 kg" },
    { label: "🌿 Dhaniya", item: "Dhaniya / Mirchi", qty: "1 bunch" },
  ]

  let quickChips = []

  function loadQuickChips() {
    try {
      const saved = localStorage.getItem("family_quick_chips")
      if (saved) {
        quickChips = JSON.parse(saved)
        if (Array.isArray(quickChips) && quickChips.length > 0) return
      }
    } catch (e) {
      console.warn("Could not load saved chips:", e)
    }
    quickChips = [...DEFAULT_QUICK_CHIPS]
  }

  function saveQuickChips() {
    try {
      localStorage.setItem("family_quick_chips", JSON.stringify(quickChips))
    } catch (e) {
      console.warn("Could not save chips:", e)
    }
  }

  loadQuickChips()

  // --- STATE ---
  let currentList = null
  let items = []
  let allLists = []
  let socket = null
  let clientId =
    localStorage.getItem("family_client_id") ||
    "c_" + Math.random().toString(36).slice(2, 9)
  localStorage.setItem("family_client_id", clientId)
  let activeFetchId = 0
  const pendingDeletes = new Map()
  let hadItems = false
  let isOffline = !navigator.onLine

  // --- DOM ELEMENTS ---
  const offlineBanner = document.getElementById("offline-banner")
  const offlineBannerText = document.getElementById("offline-banner-text")

  const viewDashboard = document.getElementById("view-dashboard")
  const viewList = document.getElementById("view-list")

  // Dashboard View
  const dashboardListsContainer = document.getElementById(
    "dashboard-lists-container",
  )
  const btnHeaderNewList = document.getElementById("btn-header-new-list")
  const formNewListCard = document.getElementById("form-new-list-card")
  const formCreateList = document.getElementById("form-create-list")
  const inputNewListTitle = document.getElementById("input-new-list-title")
  const btnCancelCreate = document.getElementById("btn-cancel-create")

  // List View Header
  const btnBackToLists = document.getElementById("btn-back-to-lists")
  const listTitleEl = document.getElementById("list-title")
  const titleDisplayWrap = document.getElementById("title-display")
  const titleEditWrap = document.getElementById("title-edit-wrap")
  const inputTitleEdit = document.getElementById("input-title-edit")
  const btnEditTitle = document.getElementById("btn-edit-title")
  const btnSaveTitle = document.getElementById("btn-save-title")
  const btnDeleteCurrentList = document.getElementById(
    "btn-delete-current-list",
  )

  // Presence
  const avatarStackEl = document.getElementById("avatar-stack")
  const presenceLabelEl = document.getElementById("presence-label")

  // Share
  const btnShare = document.getElementById("btn-share")
  const shareBtnText = document.getElementById("share-btn-text")

  // Sections & Items
  const emptyStateEl = document.getElementById("empty-state")
  const sectionActive = document.getElementById("section-active")
  const sectionCompleted = document.getElementById("section-completed")
  const activeItemsEl = document.getElementById("active-items")
  const completedItemsEl = document.getElementById("completed-items")
  const activeCountEl = document.getElementById("active-count")
  const completedCountEl = document.getElementById("completed-count")
  const btnClearPurchasedInline = document.getElementById(
    "btn-clear-purchased-inline",
  )

  // Add Bar & Quick Chips
  const formAddItem = document.getElementById("form-add-item")
  const inputItemName = document.getElementById("input-item-name")
  const inputItemQty = document.getElementById("input-item-qty")
  const qtyRow = document.getElementById("qty-row")
  const btnToggleQty = document.getElementById("btn-toggle-qty")
  const btnCloseQty = document.getElementById("btn-close-qty")
  const quickChipsListEl = document.getElementById("quick-chips-list")
  const btnConfigChips = document.getElementById("btn-config-chips")

  // Quick Chips Config Modal
  const modalChipsConfig = document.getElementById("modal-chips-config")
  const btnCloseChipsConfig = document.getElementById("btn-close-chips-config")
  const btnDoneChipsConfig = document.getElementById("btn-done-chips-config")
  const configChipsManageList = document.getElementById(
    "config-chips-manage-list",
  )
  const formAddCustomChip = document.getElementById("form-add-custom-chip")
  const inputChipLabel = document.getElementById("input-chip-label")
  const inputChipQty = document.getElementById("input-chip-qty")
  const btnResetChips = document.getElementById("btn-reset-chips")

  // Modal
  const modalBackdrop = document.getElementById("modal-backdrop")
  const modalTitle = document.getElementById("modal-title")
  const modalMessage = document.getElementById("modal-message")
  const btnModalCancel = document.getElementById("btn-modal-cancel")
  const btnModalConfirm = document.getElementById("btn-modal-confirm")
  let modalConfirmCallback = null

  // Toast
  const toastContainer = document.getElementById("toast-container")

  // --- OFFLINE / ONLINE DETECTION ---
  let onlineRecoverTimer = null

  function setOfflineState(offline) {
    isOffline = offline

    if (offline) {
      if (onlineRecoverTimer) clearTimeout(onlineRecoverTimer)
      offlineBanner.classList.remove("hidden", "online-recovered")
      offlineBannerText.textContent =
        "You are offline (इंटरनेट बंद है). Live sync is unavailable — please reconnect to use the app."
      if (presenceLabelEl) presenceLabelEl.textContent = "Offline"
    } else {
      offlineBanner.classList.remove("hidden")
      offlineBanner.classList.add("online-recovered")
      offlineBannerText.textContent =
        "✅ Back online! Syncing your shopping lists..."

      if (currentList) {
        if (socket) {
          socket.emit("join_list", { listId: currentList.id, clientId })
        }
        fetchListDetails(currentList.id)
      } else {
        fetchAllLists().then(() => renderDashboardLists())
      }

      onlineRecoverTimer = setTimeout(() => {
        offlineBanner.classList.add("hidden")
        offlineBanner.classList.remove("online-recovered")
      }, 2500)
    }
  }

  window.addEventListener("offline", () => setOfflineState(true))
  window.addEventListener("online", () => setOfflineState(false))

  if (!navigator.onLine) {
    setOfflineState(true)
  }

  // --- ROUTING ---
  function getListIdFromUrl() {
    const path = window.location.pathname
    const match = path.match(/^\/list\/([^/]+)/)
    if (match) return match[1]

    if (window.location.hash) {
      return window.location.hash.replace(/^#/, "")
    }
    return null
  }

  function initApp() {
    initSocket()
    renderQuickChipsBar()
    const listId = getListIdFromUrl()
    if (listId) {
      showListView(listId)
    } else {
      showDashboardView()
    }
  }

  window.addEventListener("popstate", initApp)

  // --- SUBTLE, QUIET TOAST NOTIFICATIONS ---
  function showToast(message, actionLabel, actionCallback, duration = 3000) {
    const toast = document.createElement("div")
    toast.className = "toast"

    const textSpan = document.createElement("span")
    textSpan.textContent = message
    toast.appendChild(textSpan)

    if (actionLabel && actionCallback) {
      const btnAction = document.createElement("button")
      btnAction.className = "btn-toast-action"
      btnAction.textContent = actionLabel
      btnAction.onclick = () => {
        actionCallback()
        toast.remove()
      }
      toast.appendChild(btnAction)
    }

    toastContainer.appendChild(toast)

    if (duration > 0) {
      setTimeout(() => {
        if (toast.parentElement) toast.remove()
      }, duration)
    }

    return toast
  }

  // --- QUICK ADD CHIPS RENDERING & MANAGEMENT ---
  function renderQuickChipsBar() {
    if (!quickChipsListEl) return
    quickChipsListEl.innerHTML = ""

    quickChips.forEach((chip) => {
      const btn = document.createElement("button")
      btn.type = "button"
      btn.className = "quick-chip"
      btn.textContent = chip.label || chip.item
      btn.title = chip.qty
        ? `Add ${chip.item} (${chip.qty})`
        : `Add ${chip.item}`

      btn.onclick = () => {
        inputItemName.value = chip.item || chip.label
        if (chip.qty) {
          inputItemQty.value = chip.qty
          qtyRow.classList.remove("hidden")
        }
        inputItemName.focus()
      }

      quickChipsListEl.appendChild(btn)
    })
  }

  function openChipsConfigModal() {
    renderConfigChipsManageList()
    modalChipsConfig.classList.remove("hidden")
  }

  function closeChipsConfigModal() {
    modalChipsConfig.classList.add("hidden")
    renderQuickChipsBar()
  }

  function renderConfigChipsManageList() {
    configChipsManageList.innerHTML = ""

    quickChips.forEach((chip, index) => {
      const itemEl = document.createElement("div")
      itemEl.className = "config-chip-item"

      const labelSpan = document.createElement("span")
      labelSpan.textContent = chip.label || chip.item
      itemEl.appendChild(labelSpan)

      if (chip.qty) {
        const qtySpan = document.createElement("span")
        qtySpan.className = "config-chip-qty"
        qtySpan.textContent = chip.qty
        itemEl.appendChild(qtySpan)
      }

      const removeBtn = document.createElement("button")
      removeBtn.type = "button"
      removeBtn.className = "btn-remove-chip"
      removeBtn.setAttribute("aria-label", `Remove ${chip.label}`)
      removeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `
      removeBtn.onclick = () => {
        quickChips.splice(index, 1)
        saveQuickChips()
        renderConfigChipsManageList()
        renderQuickChipsBar()
      }

      itemEl.appendChild(removeBtn)
      configChipsManageList.appendChild(itemEl)
    })
  }

  if (btnConfigChips) {
    btnConfigChips.onclick = openChipsConfigModal
  }
  if (btnCloseChipsConfig) {
    btnCloseChipsConfig.onclick = closeChipsConfigModal
  }
  if (btnDoneChipsConfig) {
    btnDoneChipsConfig.onclick = closeChipsConfigModal
  }
  if (modalChipsConfig) {
    modalChipsConfig.onclick = (e) => {
      if (e.target === modalChipsConfig) closeChipsConfigModal()
    }
  }

  if (formAddCustomChip) {
    formAddCustomChip.onsubmit = (e) => {
      e.preventDefault()
      const label = inputChipLabel.value.trim()
      const qty = inputChipQty.value.trim()
      if (!label) return

      quickChips.push({
        label: label,
        item: label,
        qty: qty || null,
      })

      saveQuickChips()
      inputChipLabel.value = ""
      inputChipQty.value = ""
      renderConfigChipsManageList()
      renderQuickChipsBar()
      showToast(`Added shortcut "${label}"`)
    }
  }

  if (btnResetChips) {
    btnResetChips.onclick = () => {
      quickChips = [...DEFAULT_QUICK_CHIPS]
      saveQuickChips()
      renderConfigChipsManageList()
      renderQuickChipsBar()
      showToast("Reset quick chips to defaults")
    }
  }

  // --- FETCH ALL LISTS ---
  async function fetchAllLists() {
    try {
      const res = await fetch("/api/lists")
      if (res.ok) {
        allLists = await res.json()
      }
    } catch (err) {
      console.warn("Could not fetch all lists:", err)
    }
  }

  // --- STATE A: DASHBOARD VIEW ---
  async function showDashboardView() {
    activeFetchId++
    viewDashboard.classList.remove("hidden")
    viewDashboard.classList.add("view-entering")
    viewList.classList.add("hidden")
    viewList.classList.remove("view-entering")
    formNewListCard.classList.add("hidden")

    if (socket && currentList) {
      socket.emit("leave_list", { listId: currentList.id })
    }

    currentList = null
    items = []
    hadItems = false

    dashboardListsContainer.innerHTML =
      '<div class="loading-hint">Loading your shopping lists...</div>'
    await fetchAllLists()
    renderDashboardLists()
  }

  function renderDashboardLists() {
    if (!allLists || allLists.length === 0) {
      dashboardListsContainer.innerHTML = `
        <div class="empty-state" id="btn-empty-create">
          <div class="empty-emoji">🧺</div>
          <p class="empty-title">No shopping lists yet</p>
          <p class="empty-sub">Tap "+ New List" above to create your first household ration list.</p>
        </div>
      `
      const btnEmptyCreate = document.getElementById("btn-empty-create")
      if (btnEmptyCreate) {
        btnEmptyCreate.onclick = () => openCreateListForm()
      }
      return
    }

    dashboardListsContainer.innerHTML = ""
    allLists.forEach((list) => {
      const card = document.createElement("div")
      card.className = "list-card"

      const targetId = list.share_token || list.id

      // Card Main Content
      const content = document.createElement("div")
      content.className = "list-card-content"

      const topRow = document.createElement("div")
      topRow.className = "list-card-top"

      const titleSpan = document.createElement("h3")
      titleSpan.className = "list-card-title"
      titleSpan.textContent = list.title || "Family Grocery List"
      topRow.appendChild(titleSpan)

      const badge = document.createElement("span")
      badge.className = "list-card-badge"
      const count = list.active_count ?? (list.item_count || 0)
      badge.textContent = `${count} ${count === 1 ? "item" : "items"}`
      topRow.appendChild(badge)

      content.appendChild(topRow)

      if (list.preview_items && list.preview_items.length > 0) {
        const preview = document.createElement("div")
        preview.className = "list-card-previews"
        preview.textContent = list.preview_items.join(" • ")
        content.appendChild(preview)
      }

      content.onclick = () => {
        window.history.pushState(null, "", `/list/${targetId}`)
        showListView(targetId)
      }

      card.appendChild(content)

      // Card Action Buttons (Direct Delete on the list card)
      const actions = document.createElement("div")
      actions.className = "list-card-actions"

      const btnDelete = document.createElement("button")
      btnDelete.className = "btn-card-delete"
      btnDelete.setAttribute("aria-label", `Delete list ${list.title}`)
      btnDelete.title = "Delete list"
      btnDelete.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      `
      btnDelete.onclick = (e) => {
        e.stopPropagation()
        deleteListPrompt(list)
      }

      actions.appendChild(btnDelete)
      card.appendChild(actions)

      dashboardListsContainer.appendChild(card)
    })
  }

  function openCreateListForm() {
    formNewListCard.classList.remove("hidden")
    inputNewListTitle.focus()
  }

  function closeCreateListForm() {
    formNewListCard.classList.add("hidden")
    inputNewListTitle.value = ""
  }

  btnHeaderNewList.addEventListener("click", () => {
    if (formNewListCard.classList.contains("hidden")) {
      openCreateListForm()
    } else {
      closeCreateListForm()
    }
  })

  btnCancelCreate.addEventListener("click", closeCreateListForm)

  formCreateList.addEventListener("submit", async (e) => {
    e.preventDefault()
    if (!navigator.onLine) {
      showToast("You are offline. Reconnect to create lists.")
      return
    }

    const title = inputNewListTitle.value.trim()
    if (!title) return

    const exists = allLists.some(
      (l) => l.title.trim().toLowerCase() === title.toLowerCase(),
    )
    if (exists) {
      showToast(`Opening existing list "${title}"`)
      const existing = allLists.find(
        (l) => l.title.trim().toLowerCase() === title.toLowerCase(),
      )
      const targetId = existing.share_token || existing.id
      window.history.pushState(null, "", `/list/${targetId}`)
      showListView(targetId)
      return
    }

    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      })
      const data = await res.json()
      closeCreateListForm()
      const targetId = data.share_token || data.id
      window.history.pushState(null, "", `/list/${targetId}`)
      showListView(targetId)
    } catch (err) {
      showToast("Couldn't create list.")
    }
  })

  // --- STATE B: LIST VIEW ---
  async function showListView(identifier) {
    activeFetchId++
    const fetchId = activeFetchId

    if (socket && currentList) {
      socket.emit("leave_list", { listId: currentList.id })
    }

    currentList = null
    items = []
    hadItems = false

    viewDashboard.classList.add("hidden")
    viewDashboard.classList.remove("view-entering")
    viewList.classList.remove("hidden")
    viewList.classList.add("view-entering")

    await fetchListDetails(identifier, fetchId)
    if (fetchId !== activeFetchId) return

    if (currentList && socket) {
      socket.emit("join_list", { listId: currentList.id, clientId })
      renderPresenceAvatars([], 1)
    }
  }

  async function fetchListDetails(identifier, fetchId) {
    try {
      const res = await fetch(`/api/lists/${identifier}`)
      if (fetchId !== activeFetchId) return

      if (!res.ok) {
        showToast("List not found.")
        window.history.pushState(null, "", "/")
        showDashboardView()
        return
      }

      currentList = await res.json()
      if (fetchId !== activeFetchId) return

      items = currentList.items || []
      hadItems = items.length > 0

      renderListHeader()
      renderGroceryItems()
    } catch (err) {
      if (fetchId !== activeFetchId) return
      console.error(err)
      if (!navigator.onLine) {
        setOfflineState(true)
      }
    }
  }

  function renderListHeader() {
    listTitleEl.textContent = currentList.title || "Family Grocery List"
    inputTitleEdit.value = currentList.title || "Family Grocery List"
  }

  btnBackToLists.addEventListener("click", () => {
    window.history.pushState(null, "", "/")
    showDashboardView()
  })

  // --- DIRECT DELETE LIST (ON THE LIST ITSELF) ---
  btnDeleteCurrentList.addEventListener("click", () => {
    if (!currentList) return
    deleteListPrompt(currentList)
  })

  function deleteListPrompt(listObj) {
    openConfirmModal(
      `Delete "${listObj.title || "Shopping List"}"?`,
      "This will remove this shopping list and all items.",
      "Delete List",
      async () => {
        if (!navigator.onLine) {
          showToast("You are offline. Reconnect to delete list.")
          return
        }

        allLists = allLists.filter(
          (l) => l.id !== listObj.id && l.share_token !== listObj.share_token,
        )
        renderDashboardLists()
        showToast(`Deleted "${listObj.title || "List"}"`)

        try {
          await fetch(`/api/lists/${listObj.id}`, {
            method: "DELETE",
          })
        } catch (err) {
          console.error(err)
        }

        if (
          currentList &&
          (currentList.id === listObj.id ||
            currentList.share_token === listObj.share_token)
        ) {
          window.history.pushState(null, "", "/")
          showDashboardView()
        }
      },
    )
  }

  // --- CHECK & AUTO-DELETE EMPTY LIST AND REDIRECT HOME ---
  async function checkEmptyListAutoDelete() {
    if (!currentList) return

    if (items.length === 0 && hadItems && pendingDeletes.size === 0) {
      const listToDelete = currentList
      showToast(`Empty list "${listToDelete.title}" deleted.`)

      try {
        await fetch(`/api/lists/${listToDelete.id}`, {
          method: "DELETE",
        })
      } catch (err) {
        console.warn("Auto delete error:", err)
      }

      setTimeout(() => {
        window.history.pushState(null, "", "/")
        showDashboardView()
      }, 500)
    }
  }

  // --- MODAL ---
  function openConfirmModal(title, message, confirmLabel, onConfirm) {
    modalTitle.textContent = title
    modalMessage.textContent = message
    btnModalConfirm.textContent = confirmLabel
    modalConfirmCallback = onConfirm
    modalBackdrop.classList.remove("hidden")
  }

  function closeConfirmModal() {
    modalBackdrop.classList.add("hidden")
    modalConfirmCallback = null
  }

  btnModalCancel.addEventListener("click", closeConfirmModal)
  btnModalConfirm.addEventListener("click", () => {
    if (modalConfirmCallback) modalConfirmCallback()
    closeConfirmModal()
  })
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeConfirmModal()
  })

  // --- TITLE EDITING (Enforce Unique Name) ---
  btnEditTitle.addEventListener("click", () => {
    titleDisplayWrap.classList.add("hidden")
    titleEditWrap.classList.remove("hidden")
    inputTitleEdit.focus()
    inputTitleEdit.select()
  })

  listTitleEl.addEventListener("click", () => {
    btnEditTitle.click()
  })

  const saveTitle = async () => {
    if (!navigator.onLine) {
      showToast("You are offline. Reconnect to rename list.")
      return
    }

    const newTitle = inputTitleEdit.value.trim()
    if (!newTitle || !currentList) return

    if (newTitle.toLowerCase() === (currentList.title || "").toLowerCase()) {
      titleDisplayWrap.classList.remove("hidden")
      titleEditWrap.classList.add("hidden")
      return
    }

    const conflict = allLists.some(
      (l) =>
        l.id !== currentList.id &&
        l.title.trim().toLowerCase() === newTitle.toLowerCase(),
    )
    if (conflict) {
      showToast(`A list named "${newTitle}" already exists.`)
      return
    }

    currentList.title = newTitle
    renderListHeader()
    titleDisplayWrap.classList.remove("hidden")
    titleEditWrap.classList.add("hidden")

    try {
      await fetch(`/api/lists/${currentList.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      })
    } catch (err) {
      showToast("Couldn't save title.")
    }
  }

  btnSaveTitle.addEventListener("click", saveTitle)
  inputTitleEdit.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveTitle()
    if (e.key === "Escape") {
      titleDisplayWrap.classList.remove("hidden")
      titleEditWrap.classList.add("hidden")
    }
  })

  // --- EMOJI PRESENCE AVATARS ---
  const DEFAULT_EMOJIS = [
    "🦚",
    "🪷",
    "🐘",
    "🥭",
    "🫖",
    "🐯",
    "🥥",
    "🪔",
    "🌻",
    "🦁",
  ]

  function renderPresenceAvatars(users = [], count = 1) {
    avatarStackEl.innerHTML = ""

    if (!users || users.length === 0) {
      const el = document.createElement("div")
      el.className = "presence-avatar"
      el.textContent = "🦚"
      el.title = "You are online"
      avatarStackEl.appendChild(el)
      presenceLabelEl.textContent = "1 online"
      return
    }

    const maxDisplay = 4
    const displayUsers = users.slice(0, maxDisplay)

    displayUsers.forEach((u, idx) => {
      const av = document.createElement("div")
      av.className = "presence-avatar"
      av.style.backgroundColor = u.color || "#424874"
      av.textContent =
        u.emoji || u.initial || DEFAULT_EMOJIS[idx % DEFAULT_EMOJIS.length]
      av.title =
        idx === 0 ? "You (online)" : `Family Member (${u.name || "online"})`
      avatarStackEl.appendChild(av)
    })

    if (users.length > maxDisplay) {
      const extra = document.createElement("div")
      extra.className = "presence-avatar extra"
      extra.textContent = `+${users.length - maxDisplay}`
      extra.title = `${users.length} people online`
      avatarStackEl.appendChild(extra)
    }

    if (users.length === 1) {
      presenceLabelEl.textContent = "1 online"
    } else {
      presenceLabelEl.textContent = `${users.length} online`
    }
  }

  // --- REALTIME SOCKET.IO CLIENT ---
  function initSocket() {
    if (typeof io === "undefined") {
      console.warn("Socket.io client library not loaded.")
      return
    }

    socket = io({
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    })

    socket.on("connect", () => {
      if (currentList) {
        socket.emit("join_list", { listId: currentList.id, clientId })
      }
    })

    socket.on("disconnect", () => {
      if (presenceLabelEl) presenceLabelEl.textContent = "Offline"
    })

    socket.on("presence", (data) => {
      if (!currentList) return
      renderPresenceAvatars(data.users, data.count)
    })

    socket.on("item_added", (newItem) => {
      if (
        !currentList ||
        (newItem.list_id && newItem.list_id !== currentList.id)
      )
        return
      const exists = items.some((i) => i.id === newItem.id)
      if (!exists) {
        items.push(newItem)
        hadItems = true
        renderGroceryItems()
      }
    })

    socket.on("item_updated", (updatedItem) => {
      if (
        !currentList ||
        (updatedItem.list_id && updatedItem.list_id !== currentList.id)
      )
        return
      items = items.map((i) => (i.id === updatedItem.id ? updatedItem : i))
      renderGroceryItems()
    })

    socket.on("item_deleted", (data) => {
      if (!currentList || (data.listId && data.listId !== currentList.id))
        return
      items = items.filter((i) => i.id !== data.id)
      renderGroceryItems()
      if (items.length === 0 && hadItems) {
        checkEmptyListAutoDelete()
      }
    })

    socket.on("items_cleared", (data) => {
      if (!currentList || (data.listId && data.listId !== currentList.id))
        return
      items = data.items || []
      renderGroceryItems()
      if (items.length === 0 && hadItems) {
        checkEmptyListAutoDelete()
      }
    })

    socket.on("list_updated", (updated) => {
      if (!currentList || (updated.id && updated.id !== currentList.id)) return
      currentList.title = updated.title
      renderListHeader()
    })

    socket.on("list_deleted", (data) => {
      if (!currentList || (data.id && data.id !== currentList.id)) return
      showToast("This list was deleted.")
      window.history.pushState(null, "", "/")
      showDashboardView()
    })
  }

  // --- RENDER ITEMS ---
  function renderGroceryItems() {
    const active = items
      .filter((i) => !i.completed)
      .sort((a, b) => (a.position || 0) - (b.position || 0))
    const completed = items
      .filter((i) => i.completed)
      .sort((a, b) => (a.position || 0) - (b.position || 0))

    activeCountEl.textContent = active.length
    completedCountEl.textContent = completed.length

    if (items.length === 0) {
      emptyStateEl.classList.remove("hidden")
      sectionActive.classList.add("hidden")
      sectionCompleted.classList.add("hidden")
    } else {
      emptyStateEl.classList.add("hidden")

      if (active.length > 0) {
        sectionActive.classList.remove("hidden")
        activeItemsEl.innerHTML = ""
        active.forEach((item) => activeItemsEl.appendChild(createItemRow(item)))
      } else {
        sectionActive.classList.add("hidden")
      }

      if (completed.length > 0) {
        sectionCompleted.classList.remove("hidden")
        completedItemsEl.innerHTML = ""
        completed.forEach((item) =>
          completedItemsEl.appendChild(createItemRow(item)),
        )
      } else {
        sectionCompleted.classList.add("hidden")
      }
    }
  }

  function createItemRow(item) {
    const row = document.createElement("div")
    row.className = `grocery-row ${item.completed ? "completed" : ""}`
    row.id = `item-${item.id}`

    // Checkbox button
    const checkBtn = document.createElement("button")
    checkBtn.className = "checkbox-btn"
    checkBtn.setAttribute(
      "aria-label",
      item.completed ? `Unmark ${item.name}` : `Mark ${item.name}`,
    )
    checkBtn.innerHTML = `
      <div class="custom-checkbox">
        ${item.completed ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ""}
      </div>
    `
    checkBtn.onclick = () => toggleItem(item.id, !item.completed)
    row.appendChild(checkBtn)

    // Item text & quantity
    const content = document.createElement("div")
    content.className = "item-content"
    content.onclick = () => openInlineEdit(row, item)

    const textWrap = document.createElement("div")
    textWrap.className = "item-text-wrap"

    const nameSpan = document.createElement("span")
    nameSpan.className = "item-name"
    nameSpan.textContent = item.name
    textWrap.appendChild(nameSpan)

    if (item.quantity) {
      const qtySpan = document.createElement("span")
      qtySpan.className = "item-qty-tag"
      qtySpan.textContent = item.quantity
      textWrap.appendChild(qtySpan)
    }

    content.appendChild(textWrap)
    row.appendChild(content)

    // Actions
    const actions = document.createElement("div")
    actions.className = "item-actions"

    const editBtn = document.createElement("button")
    editBtn.className = "icon-btn"
    editBtn.setAttribute("aria-label", `Edit ${item.name}`)
    editBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
      </svg>
    `
    editBtn.onclick = (e) => {
      e.stopPropagation()
      openInlineEdit(row, item)
    }
    actions.appendChild(editBtn)

    const deleteBtn = document.createElement("button")
    deleteBtn.className = "icon-btn btn-delete"
    deleteBtn.setAttribute("aria-label", `Delete ${item.name}`)
    deleteBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    `
    deleteBtn.onclick = (e) => {
      e.stopPropagation()
      deleteItem(item.id)
    }
    actions.appendChild(deleteBtn)

    row.appendChild(actions)
    return row
  }

  // --- INLINE EDITING ---
  function openInlineEdit(rowEl, item) {
    const editCard = document.createElement("div")
    editCard.className = "edit-card"
    editCard.innerHTML = `
      <div class="edit-inputs">
        <input type="text" class="edit-name-input" value="${escapeHTML(item.name)}" maxLength="200" placeholder="Item name" />
        <input type="text" class="edit-qty-input" value="${escapeHTML(item.quantity || "")}" maxLength="100" placeholder="Quantity (optional)" />
      </div>
      <div class="edit-buttons">
        <button class="btn-cancel" type="button">Cancel</button>
        <button class="btn-save" type="button">Save</button>
      </div>
    `

    const nameInput = editCard.querySelector(".edit-name-input")
    const qtyInput = editCard.querySelector(".edit-qty-input")
    const btnCancel = editCard.querySelector(".btn-cancel")
    const btnSave = editCard.querySelector(".btn-save")

    const saveChanges = async () => {
      if (!navigator.onLine) {
        showToast("You are offline. Reconnect to edit items.")
        return
      }

      const newName = nameInput.value.trim()
      const newQty = qtyInput.value.trim() || null
      if (!newName) return

      item.name = newName
      item.quantity = newQty
      renderGroceryItems()

      try {
        await fetch(`/api/lists/${currentList.id}/items/${item.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName, quantity: newQty }),
        })
      } catch (err) {
        showToast("Couldn't save edit.")
      }
    }

    btnSave.onclick = saveChanges
    btnCancel.onclick = () => renderGroceryItems()

    nameInput.onkeydown = (e) => {
      if (e.key === "Enter") saveChanges()
      if (e.key === "Escape") renderGroceryItems()
    }
    qtyInput.onkeydown = (e) => {
      if (e.key === "Enter") saveChanges()
      if (e.key === "Escape") renderGroceryItems()
    }

    rowEl.replaceWith(editCard)
    nameInput.focus()
    nameInput.select()
  }

  // --- ACTIONS ---
  async function toggleItem(itemId, completed) {
    if (!navigator.onLine) {
      showToast("You are offline. Reconnect to update items.")
      return
    }

    const item = items.find((i) => i.id === itemId)
    if (!item) return

    item.completed = completed
    renderGroceryItems()

    try {
      await fetch(`/api/lists/${currentList.id}/items/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      })
    } catch (err) {
      item.completed = !completed
      renderGroceryItems()
      showToast("Couldn't save change.")
    }
  }

  async function deleteItem(itemId) {
    if (!navigator.onLine) {
      showToast("You are offline. Reconnect to delete items.")
      return
    }

    const itemIndex = items.findIndex((i) => i.id === itemId)
    if (itemIndex === -1) return

    const [deletedItem] = items.splice(itemIndex, 1)
    renderGroceryItems()

    const isNowEmpty = items.length === 0

    const timer = setTimeout(async () => {
      pendingDeletes.delete(itemId)
      try {
        await fetch(`/api/lists/${currentList.id}/items/${itemId}`, {
          method: "DELETE",
        })
      } catch (err) {
        console.error(err)
      }

      if (isNowEmpty) {
        checkEmptyListAutoDelete()
      }
    }, 3000)

    const toastEl = showToast(
      `Deleted ${deletedItem.name}`,
      "Undo",
      () => {
        clearTimeout(timer)
        pendingDeletes.delete(itemId)
        items.push(deletedItem)
        hadItems = true
        renderGroceryItems()
      },
      3000,
    )

    pendingDeletes.set(itemId, { item: deletedItem, timer, toastEl })
  }

  btnClearPurchasedInline.addEventListener("click", async () => {
    if (!navigator.onLine) {
      showToast("You are offline. Reconnect to clear items.")
      return
    }

    if (!currentList) return
    const completed = items.filter((i) => i.completed)
    if (completed.length === 0) {
      showToast("No purchased items to clear.")
      return
    }

    const previousItems = [...items]
    items = items.filter((i) => !i.completed)
    renderGroceryItems()

    const isNowEmpty = items.length === 0
    let undone = false

    const timer = setTimeout(async () => {
      if (undone) return
      try {
        await fetch(`/api/lists/${currentList.id}/items?mode=completed`, {
          method: "DELETE",
        })
      } catch (err) {
        console.error(err)
      }

      if (isNowEmpty) {
        checkEmptyListAutoDelete()
      }
    }, 3000)

    showToast(
      `Cleared ${completed.length} items`,
      "Undo",
      () => {
        undone = true
        clearTimeout(timer)
        items = previousItems
        hadItems = true
        renderGroceryItems()
      },
      3000,
    )
  })

  // --- ADD ITEM SUBMISSION (Instant Enter Key Handling) ---
  const handleAddItemSubmit = async (e) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault()
    }

    if (!navigator.onLine) {
      showToast("You are offline. Please reconnect to add items.")
      return
    }

    const name = inputItemName.value.trim()
    const quantity = inputItemQty.value.trim() || null
    if (!name || !currentList) return

    inputItemName.value = ""
    inputItemQty.value = ""
    qtyRow.classList.add("hidden")
    inputItemName.focus()

    const itemId =
      window.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : "item_" +
          Math.random().toString(36).slice(2) +
          Date.now().toString(36)

    const newItem = {
      id: itemId,
      name,
      quantity,
      completed: false,
      position: items.length + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    items.push(newItem)
    hadItems = true
    renderGroceryItems()

    try {
      const res = await fetch(`/api/lists/${currentList.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId, name, quantity }),
      })
      const saved = await res.json()
      const idx = items.findIndex((i) => i.id === itemId)
      if (idx !== -1) {
        items[idx] = saved
      }
    } catch (err) {
      items = items.filter((i) => i.id !== itemId)
      renderGroceryItems()
      showToast("Couldn't add item.")
    }
  }

  formAddItem.addEventListener("submit", handleAddItemSubmit)

  // Reliable Enter key handling on both inputs across mobile keyboards and physical keyboards
  inputItemName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAddItemSubmit(e)
    }
  })

  inputItemQty.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAddItemSubmit(e)
    }
  })

  // Quantity toggling
  btnToggleQty.addEventListener("click", () => {
    qtyRow.classList.toggle("hidden")
    if (!qtyRow.classList.contains("hidden")) {
      inputItemQty.focus()
    }
  })

  btnCloseQty.addEventListener("click", () => {
    inputItemQty.value = ""
    qtyRow.classList.add("hidden")
    inputItemName.focus()
  })

  emptyStateEl.addEventListener("click", () => {
    inputItemName.focus()
  })

  // --- SHARING ---
  btnShare.addEventListener("click", async () => {
    const url = window.location.href
    const title = currentList ? currentList.title : "Family Grocery List"

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: `Shared Family Grocery List: ${title}`,
          url,
        })
        return
      } catch (err) {
        if (err.name === "AbortError") return
      }
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const ta = document.createElement("textarea")
        ta.value = url
        document.body.appendChild(ta)
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
      }

      shareBtnText.textContent = "Copied!"
      showToast("Link copied to clipboard.")
      setTimeout(() => {
        shareBtnText.textContent = "Share"
      }, 2000)
    } catch {
      showToast("Could not copy link.")
    }
  })

  function escapeHTML(str) {
    if (!str) return ""
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
  }

  initApp()
})()
