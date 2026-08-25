/**
 * Family Grocery List - Client Application Logic
 * Ultra-lightweight vanilla JS with Server-Sent Events (SSE) realtime collaboration.
 * Features:
 *  - Multi-List Switcher & Drawer
 *  - Google-style user avatar presence bubbles
 *  - Delete All / Clear Completed with 5-second Undo toast
 *  - Custom Theme Palette: #F4EEFF, #DCD6F7, #A6B1E1, #424874
 */

;(function () {
  "use strict"

  // --- STATE ---
  let currentList = null
  let items = []
  let allLists = []
  let eventSource = null
  const pendingDeletes = new Map()

  // --- DOM ELEMENTS ---
  const viewLanding = document.getElementById("view-landing")
  const viewList = document.getElementById("view-list")

  // Landing
  const btnCreateList = document.getElementById("btn-create-list")
  const allListsListEl = document.getElementById("all-lists-list")

  // List View
  const listTitleEl = document.getElementById("list-title")
  const titleDisplayWrap = document.getElementById("title-display")
  const titleEditWrap = document.getElementById("title-edit-wrap")
  const inputTitleEdit = document.getElementById("input-title-edit")
  const btnEditTitle = document.getElementById("btn-edit-title")
  const btnSaveTitle = document.getElementById("btn-save-title")

  // Presence
  const avatarStackEl = document.getElementById("avatar-stack")
  const presenceLabelEl = document.getElementById("presence-label")

  // Drawer (List Switcher)
  const btnOpenDrawer = document.getElementById("btn-open-drawer")
  const btnCloseDrawer = document.getElementById("btn-close-drawer")
  const drawerBackdrop = document.getElementById("drawer-backdrop")
  const drawerListsEl = document.getElementById("drawer-lists")
  const btnDrawerNewList = document.getElementById("btn-drawer-new-list")

  // Actions
  const btnMenuActions = document.getElementById("btn-menu-actions")
  const menuActionsDropdown = document.getElementById("menu-actions-dropdown")
  const btnDeleteCompleted = document.getElementById("btn-delete-completed")
  const btnDeleteAll = document.getElementById("btn-delete-all")
  const btnClearPurchasedInline = document.getElementById(
    "btn-clear-purchased-inline",
  )

  // Modal
  const modalBackdrop = document.getElementById("modal-backdrop")
  const modalTitle = document.getElementById("modal-title")
  const modalMessage = document.getElementById("modal-message")
  const btnModalCancel = document.getElementById("btn-modal-cancel")
  const btnModalConfirm = document.getElementById("btn-modal-confirm")
  let modalConfirmCallback = null

  // Share
  const btnShare = document.getElementById("btn-share")
  const shareBtnText = document.getElementById("share-btn-text")

  // Items
  const emptyStateEl = document.getElementById("empty-state")
  const sectionActive = document.getElementById("section-active")
  const sectionCompleted = document.getElementById("section-completed")
  const activeItemsEl = document.getElementById("active-items")
  const completedItemsEl = document.getElementById("completed-items")
  const activeCountEl = document.getElementById("active-count")
  const completedCountEl = document.getElementById("completed-count")

  // Add Bar
  const formAddItem = document.getElementById("form-add-item")
  const inputItemName = document.getElementById("input-item-name")
  const inputItemQty = document.getElementById("input-item-qty")
  const qtyRow = document.getElementById("qty-row")
  const btnToggleQty = document.getElementById("btn-toggle-qty")
  const btnCloseQty = document.getElementById("btn-close-qty")

  // Toast
  const toastContainer = document.getElementById("toast-container")

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
    const listId = getListIdFromUrl()
    if (listId) {
      showListView(listId)
    } else {
      showLandingView()
    }
  }

  window.addEventListener("popstate", initApp)

  // --- TOAST NOTIFICATIONS ---
  function showToast(message, actionLabel, actionCallback, duration = 4000) {
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

  // --- LANDING PAGE ---
  async function showLandingView() {
    viewLanding.classList.remove("hidden")
    viewList.classList.add("hidden")
    closeDrawer()

    if (eventSource) {
      eventSource.close()
      eventSource = null
    }

    await fetchAllLists()
    renderLandingLists()
  }

  function renderLandingLists() {
    if (!allLists || allLists.length === 0) {
      allListsListEl.innerHTML =
        '<div class="loading-hint">No lists created yet. Click "Create New List" above!</div>'
      return
    }

    allListsListEl.innerHTML = ""
    allLists.forEach((list) => {
      const a = document.createElement("a")
      a.className = "recent-item"
      a.href = `/list/${list.share_token || list.id}`
      a.innerHTML = `
        <span>${escapeHTML(list.title || "Family Grocery List")}</span>
        <div class="recent-item-meta">
          <span class="recent-badge">${list.active_count ?? (list.item_count || 0)} items</span>
          <span style="color:#8E97C6;">&rarr;</span>
        </div>
      `
      a.onclick = (e) => {
        e.preventDefault()
        const targetId = list.share_token || list.id
        window.history.pushState(null, "", `/list/${targetId}`)
        showListView(targetId)
      }
      allListsListEl.appendChild(a)
    })
  }

  btnCreateList.addEventListener("click", async () => {
    btnCreateList.disabled = true
    btnCreateList.innerHTML = "<span>Creating list...</span>"

    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Family Grocery List" }),
      })
      const data = await res.json()
      window.history.pushState(null, "", `/list/${data.share_token || data.id}`)
      showListView(data.share_token || data.id)
    } catch (err) {
      console.error(err)
      showToast("Could not create list. Try again.")
    } finally {
      btnCreateList.disabled = false
      btnCreateList.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span>Create New List</span>
      `
    }
  })

  // --- LIST VIEW ---
  async function showListView(identifier) {
    viewLanding.classList.add("hidden")
    viewList.classList.remove("hidden")
    closeDrawer()

    try {
      const res = await fetch(`/api/lists/${identifier}`)
      if (!res.ok) {
        showToast("This grocery list doesn't exist.")
        window.history.pushState(null, "", "/")
        showLandingView()
        return
      }

      currentList = await res.json()
      items = currentList.items || []

      renderListHeader()
      renderGroceryItems()
      connectRealtime(currentList.id)
    } catch (err) {
      console.error(err)
      showToast("Network error loading list.")
    }
  }

  function renderListHeader() {
    listTitleEl.textContent = currentList.title || "Family Grocery List"
    inputTitleEdit.value = currentList.title || "Family Grocery List"
  }

  // --- LIST SWITCHER DRAWER ---
  async function openDrawer() {
    drawerBackdrop.classList.remove("hidden")
    drawerListsEl.innerHTML = '<div class="loading-hint">Loading lists...</div>'
    await fetchAllLists()
    renderDrawerLists()
  }

  function closeDrawer() {
    drawerBackdrop.classList.add("hidden")
  }

  function renderDrawerLists() {
    if (!allLists || allLists.length === 0) {
      drawerListsEl.innerHTML =
        '<div class="loading-hint">No lists found.</div>'
      return
    }

    drawerListsEl.innerHTML = ""
    allLists.forEach((l) => {
      const itemEl = document.createElement("div")
      const isCurrent =
        currentList &&
        (currentList.id === l.id || currentList.share_token === l.share_token)
      itemEl.className = `drawer-list-item ${isCurrent ? "active" : ""}`

      // Main clickable part (switches list)
      const mainEl = document.createElement("div")
      mainEl.className = "drawer-item-main"
      mainEl.innerHTML = `
        <span class="drawer-item-title">${escapeHTML(l.title || "Family Grocery List")}</span>
        <span class="item-count">${l.active_count ?? (l.item_count || 0)} items</span>
      `
      mainEl.onclick = () => {
        closeDrawer()
        const targetId = l.share_token || l.id
        window.history.pushState(null, "", `/list/${targetId}`)
        showListView(targetId)
      }
      itemEl.appendChild(mainEl)

      // Actions (Edit & Delete)
      const actionsEl = document.createElement("div")
      actionsEl.className = "drawer-item-actions"

      // Edit Button
      const btnEdit = document.createElement("button")
      btnEdit.className = "drawer-action-btn"
      btnEdit.setAttribute("aria-label", `Rename list ${l.title}`)
      btnEdit.title = "Rename list"
      btnEdit.innerHTML = `
        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
        </svg>
      `
      btnEdit.onclick = (e) => {
        e.stopPropagation()
        openDrawerInlineEdit(itemEl, l)
      }
      actionsEl.appendChild(btnEdit)

      // Delete Button
      const btnDelete = document.createElement("button")
      btnDelete.className = "drawer-action-btn btn-delete-list"
      btnDelete.setAttribute("aria-label", `Delete list ${l.title}`)
      btnDelete.title = "Delete list"
      btnDelete.innerHTML = `
        <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      `
      btnDelete.onclick = (e) => {
        e.stopPropagation()
        deleteListAction(l)
      }
      actionsEl.appendChild(btnDelete)

      itemEl.appendChild(actionsEl)
      drawerListsEl.appendChild(itemEl)
    })
  }

  function openDrawerInlineEdit(itemEl, listObj) {
    const editWrap = document.createElement("div")
    editWrap.className = "drawer-edit-wrap"
    editWrap.innerHTML = `
      <input type="text" class="drawer-edit-input" value="${escapeHTML(listObj.title || "Family Grocery List")}" maxLength="100" />
      <button class="drawer-btn-save" type="button">Save</button>
      <button class="btn-cancel" type="button">✕</button>
    `

    const input = editWrap.querySelector(".drawer-edit-input")
    const btnSave = editWrap.querySelector(".drawer-btn-save")
    const btnCancel = editWrap.querySelector(".btn-cancel")

    const saveListName = async () => {
      const newTitle = input.value.trim()
      if (!newTitle) return

      listObj.title = newTitle
      if (
        currentList &&
        (currentList.id === listObj.id ||
          currentList.share_token === listObj.share_token)
      ) {
        currentList.title = newTitle
        renderListHeader()
      }
      renderDrawerLists()

      try {
        await fetch(`/api/lists/${listObj.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        })
      } catch (err) {
        showToast("Couldn't rename list.")
      }
    }

    btnSave.onclick = saveListName
    btnCancel.onclick = () => renderDrawerLists()
    input.onkeydown = (e) => {
      if (e.key === "Enter") saveListName()
      if (e.key === "Escape") renderDrawerLists()
    }

    itemEl.replaceWith(editWrap)
    input.focus()
    input.select()
  }

  async function deleteListAction(listObj) {
    openConfirmModal(
      `Delete "${listObj.title || "Family Grocery List"}"?`,
      "This will permanently delete this shopping list and all of its items.",
      "Delete List",
      async () => {
        allLists = allLists.filter(
          (l) => l.id !== listObj.id && l.share_token !== listObj.share_token,
        )
        renderDrawerLists()
        showToast(`Deleted "${listObj.title || "List"}"`)

        try {
          await fetch(`/api/lists/${listObj.id}`, {
            method: "DELETE",
          })
        } catch (err) {
          console.error(err)
        }

        // If currently viewing the deleted list, switch to another or landing
        if (
          currentList &&
          (currentList.id === listObj.id ||
            currentList.share_token === listObj.share_token)
        ) {
          if (allLists.length > 0) {
            const nextList = allLists[0]
            const nextId = nextList.share_token || nextList.id
            window.history.pushState(null, "", `/list/${nextId}`)
            showListView(nextId)
          } else {
            window.history.pushState(null, "", "/")
            showLandingView()
          }
        }
      },
    )
  }

  btnOpenDrawer.addEventListener("click", openDrawer)
  btnCloseDrawer.addEventListener("click", closeDrawer)
  drawerBackdrop.addEventListener("click", (e) => {
    if (e.target === drawerBackdrop) closeDrawer()
  })

  btnDrawerNewList.addEventListener("click", async () => {
    closeDrawer()
    btnCreateList.click()
  })

  // --- GOOGLE-STYLE PRESENCE AVATARS ---
  function renderPresenceAvatars(users = [], count = 1) {
    avatarStackEl.innerHTML = ""

    if (!users || users.length === 0) {
      const el = document.createElement("div")
      el.className = "presence-avatar"
      el.style.backgroundColor = "#424874"
      el.textContent = "You"
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
      av.style.color = u.textColor || "#FFFFFF"
      av.textContent = u.initial || (idx === 0 ? "Y" : `${idx + 1}`)
      av.title = idx === 0 ? "You" : `Family Member (${u.name || idx + 1})`
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

  // --- REALTIME SERVER-SENT EVENTS ---
  function connectRealtime(listId) {
    if (eventSource) eventSource.close()

    eventSource = new EventSource(`/api/lists/${listId}/events`)

    eventSource.onopen = () => {
      renderPresenceAvatars([], 1)
    }

    eventSource.onerror = () => {
      avatarStackEl.innerHTML = ""
      presenceLabelEl.textContent = "Offline"
    }

    eventSource.addEventListener("presence", (e) => {
      const data = JSON.parse(e.data)
      renderPresenceAvatars(data.users, data.count)
    })

    eventSource.addEventListener("item_added", (e) => {
      const newItem = JSON.parse(e.data)
      const exists = items.some((i) => i.id === newItem.id)
      if (!exists) {
        items.push(newItem)
        renderGroceryItems()
      }
    })

    eventSource.addEventListener("item_updated", (e) => {
      const updatedItem = JSON.parse(e.data)
      items = items.map((i) => (i.id === updatedItem.id ? updatedItem : i))
      renderGroceryItems()
    })

    eventSource.addEventListener("item_deleted", (e) => {
      const { id } = JSON.parse(e.data)
      items = items.filter((i) => i.id !== id)
      renderGroceryItems()
    })

    eventSource.addEventListener("items_cleared", (e) => {
      const data = JSON.parse(e.data)
      items = data.items || []
      renderGroceryItems()
    })

    eventSource.addEventListener("list_updated", (e) => {
      const updated = JSON.parse(e.data)
      currentList.title = updated.title
      renderListHeader()
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
    const itemIndex = items.findIndex((i) => i.id === itemId)
    if (itemIndex === -1) return

    const [deletedItem] = items.splice(itemIndex, 1)
    renderGroceryItems()

    const timer = setTimeout(async () => {
      pendingDeletes.delete(itemId)
      try {
        await fetch(`/api/lists/${currentList.id}/items/${itemId}`, {
          method: "DELETE",
        })
      } catch (err) {
        console.error(err)
      }
    }, 5000)

    const toastEl = showToast(
      `Deleted ${deletedItem.name}`,
      "Undo",
      () => {
        clearTimeout(timer)
        pendingDeletes.delete(itemId)
        items.push(deletedItem)
        renderGroceryItems()
      },
      5000,
    )

    pendingDeletes.set(itemId, { item: deletedItem, timer, toastEl })
  }

  // --- DELETE ALL & CLEAR COMPLETED ---
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

  async function clearCompletedItems() {
    if (!currentList) return
    const completed = items.filter((i) => i.completed)
    if (completed.length === 0) {
      showToast("No purchased items to clear.")
      return
    }

    const previousItems = [...items]
    items = items.filter((i) => !i.completed)
    renderGroceryItems()

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
    }, 5000)

    showToast(
      `Cleared ${completed.length} purchased items`,
      "Undo",
      () => {
        undone = true
        clearTimeout(timer)
        items = previousItems
        renderGroceryItems()
      },
      5000,
    )
  }

  async function deleteAllItems() {
    if (!currentList || items.length === 0) {
      showToast("Grocery list is already empty.")
      return
    }

    openConfirmModal(
      "Delete all items?",
      `This will remove all ${items.length} items from the list. You can still undo for 5 seconds.`,
      "Delete All",
      () => {
        const previousItems = [...items]
        items = []
        renderGroceryItems()

        let undone = false
        const timer = setTimeout(async () => {
          if (undone) return
          try {
            await fetch(`/api/lists/${currentList.id}/items?mode=all`, {
              method: "DELETE",
            })
          } catch (err) {
            console.error(err)
          }
        }, 5000)

        showToast(
          `Deleted all ${previousItems.length} items`,
          "Undo",
          () => {
            undone = true
            clearTimeout(timer)
            items = previousItems
            renderGroceryItems()
          },
          5000,
        )
      },
    )
  }

  // Menu Handlers
  btnMenuActions.addEventListener("click", (e) => {
    e.stopPropagation()
    menuActionsDropdown.classList.toggle("hidden")
  })

  document.addEventListener("click", () => {
    menuActionsDropdown.classList.add("hidden")
  })

  btnDeleteCompleted.addEventListener("click", () => {
    menuActionsDropdown.classList.add("hidden")
    clearCompletedItems()
  })

  btnDeleteAll.addEventListener("click", () => {
    menuActionsDropdown.classList.add("hidden")
    deleteAllItems()
  })

  btnClearPurchasedInline.addEventListener("click", () => {
    clearCompletedItems()
  })

  // --- ADD ITEM SUBMISSION ---
  formAddItem.addEventListener("submit", async (e) => {
    e.preventDefault()
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

  // --- TITLE EDITING ---
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
    const newTitle = inputTitleEdit.value.trim()
    if (!newTitle || !currentList) return

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
      showToast("Link copied! Send it to your family in WhatsApp.")
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
