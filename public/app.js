/**
 * Family Grocery List - Client Application Logic
 * Ultra-lightweight vanilla JS with Server-Sent Events (SSE) realtime collaboration.
 * Features:
 *  - Emoji Presence Avatars (🦚, 🪷, 🐘, 🥭, 🫖, 🐯, 🥥, 🪔, 🌻)
 *  - Indian Cultural Household Grocery Chips
 *  - Lists-First Dashboard (Opening app shows lists directly)
 *  - Direct List Delete on list card and in list header
 *  - Footer: Made by Tanishk with love ❤️
 *  - Custom Theme Palette: #F4EEFF, #DCD6F7, #A6B1E1, #424874
 */

(function () {
  'use strict';

  // --- STATE ---
  let currentList = null;
  let items = [];
  let allLists = [];
  let eventSource = null;
  const pendingDeletes = new Map();

  // --- DOM ELEMENTS ---
  const viewDashboard = document.getElementById('view-dashboard');
  const viewList = document.getElementById('view-list');

  // Dashboard View
  const dashboardListsContainer = document.getElementById('dashboard-lists-container');
  const btnHeaderNewList = document.getElementById('btn-header-new-list');
  const formNewListCard = document.getElementById('form-new-list-card');
  const formCreateList = document.getElementById('form-create-list');
  const inputNewListTitle = document.getElementById('input-new-list-title');
  const btnCancelCreate = document.getElementById('btn-cancel-create');

  // List View Header
  const btnBackToLists = document.getElementById('btn-back-to-lists');
  const listTitleEl = document.getElementById('list-title');
  const titleDisplayWrap = document.getElementById('title-display');
  const titleEditWrap = document.getElementById('title-edit-wrap');
  const inputTitleEdit = document.getElementById('input-title-edit');
  const btnEditTitle = document.getElementById('btn-edit-title');
  const btnSaveTitle = document.getElementById('btn-save-title');
  const btnDeleteCurrentList = document.getElementById('btn-delete-current-list');

  // Presence
  const avatarStackEl = document.getElementById('avatar-stack');
  const presenceLabelEl = document.getElementById('presence-label');

  // Share
  const btnShare = document.getElementById('btn-share');
  const shareBtnText = document.getElementById('share-btn-text');

  // Sections & Items
  const emptyStateEl = document.getElementById('empty-state');
  const sectionActive = document.getElementById('section-active');
  const sectionCompleted = document.getElementById('section-completed');
  const activeItemsEl = document.getElementById('active-items');
  const completedItemsEl = document.getElementById('completed-items');
  const activeCountEl = document.getElementById('active-count');
  const completedCountEl = document.getElementById('completed-count');
  const btnClearPurchasedInline = document.getElementById('btn-clear-purchased-inline');

  // Add Bar & Quick Chips
  const formAddItem = document.getElementById('form-add-item');
  const inputItemName = document.getElementById('input-item-name');
  const inputItemQty = document.getElementById('input-item-qty');
  const qtyRow = document.getElementById('qty-row');
  const btnToggleQty = document.getElementById('btn-toggle-qty');
  const btnCloseQty = document.getElementById('btn-close-qty');
  const quickChips = document.querySelectorAll('.quick-chip');

  // Modal
  const modalBackdrop = document.getElementById('modal-backdrop');
  const modalTitle = document.getElementById('modal-title');
  const modalMessage = document.getElementById('modal-message');
  const btnModalCancel = document.getElementById('btn-modal-cancel');
  const btnModalConfirm = document.getElementById('btn-modal-confirm');
  let modalConfirmCallback = null;

  // Toast
  const toastContainer = document.getElementById('toast-container');

  // --- ROUTING ---
  function getListIdFromUrl() {
    const path = window.location.pathname;
    const match = path.match(/^\/list\/([^/]+)/);
    if (match) return match[1];

    if (window.location.hash) {
      return window.location.hash.replace(/^#/, '');
    }
    return null;
  }

  function initApp() {
    const listId = getListIdFromUrl();
    if (listId) {
      showListView(listId);
    } else {
      showDashboardView();
    }
  }

  window.addEventListener('popstate', initApp);

  // --- SUBTLE, QUIET TOAST NOTIFICATIONS ---
  function showToast(message, actionLabel, actionCallback, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast';

    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    toast.appendChild(textSpan);

    if (actionLabel && actionCallback) {
      const btnAction = document.createElement('button');
      btnAction.className = 'btn-toast-action';
      btnAction.textContent = actionLabel;
      btnAction.onclick = () => {
        actionCallback();
        toast.remove();
      };
      toast.appendChild(btnAction);
    }

    toastContainer.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        if (toast.parentElement) toast.remove();
      }, duration);
    }

    return toast;
  }

  // --- FETCH ALL LISTS ---
  async function fetchAllLists() {
    try {
      const res = await fetch('/api/lists');
      if (res.ok) {
        allLists = await res.json();
      }
    } catch (err) {
      console.warn('Could not fetch all lists:', err);
    }
  }

  // --- STATE A: DASHBOARD VIEW (FIRST THING SEEN) ---
  async function showDashboardView() {
    viewDashboard.classList.remove('hidden');
    viewList.classList.add('hidden');
    formNewListCard.classList.add('hidden');

    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    dashboardListsContainer.innerHTML = '<div class="loading-hint">Loading your shopping lists...</div>';
    await fetchAllLists();
    renderDashboardLists();
  }

  function renderDashboardLists() {
    if (!allLists || allLists.length === 0) {
      dashboardListsContainer.innerHTML = `
        <div class="empty-state" id="btn-empty-create">
          <div class="empty-emoji">🧺</div>
          <p class="empty-title">No shopping lists yet</p>
          <p class="empty-sub">Tap "+ New List" above to create your first household ration list.</p>
        </div>
      `;
      const btnEmptyCreate = document.getElementById('btn-empty-create');
      if (btnEmptyCreate) {
        btnEmptyCreate.onclick = () => openCreateListForm();
      }
      return;
    }

    dashboardListsContainer.innerHTML = '';
    allLists.forEach((list) => {
      const card = document.createElement('div');
      card.className = 'list-card';

      const targetId = list.share_token || list.id;

      // Card Main Content (Click opens list)
      const content = document.createElement('div');
      content.className = 'list-card-content';

      const topRow = document.createElement('div');
      topRow.className = 'list-card-top';

      const titleSpan = document.createElement('h3');
      titleSpan.className = 'list-card-title';
      titleSpan.textContent = list.title || 'Family Grocery List';
      topRow.appendChild(titleSpan);

      const badge = document.createElement('span');
      badge.className = 'list-card-badge';
      const count = list.active_count ?? (list.item_count || 0);
      badge.textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
      topRow.appendChild(badge);

      content.appendChild(topRow);

      if (list.preview_items && list.preview_items.length > 0) {
        const preview = document.createElement('div');
        preview.className = 'list-card-previews';
        preview.textContent = list.preview_items.join(' • ');
        content.appendChild(preview);
      }

      content.onclick = () => {
        window.history.pushState(null, '', `/list/${targetId}`);
        showListView(targetId);
      };

      card.appendChild(content);

      // Card Action Buttons (Direct Delete on the list card itself)
      const actions = document.createElement('div');
      actions.className = 'list-card-actions';

      const btnDelete = document.createElement('button');
      btnDelete.className = 'btn-card-delete';
      btnDelete.setAttribute('aria-label', `Delete list ${list.title}`);
      btnDelete.title = 'Delete list';
      btnDelete.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      `;
      btnDelete.onclick = (e) => {
        e.stopPropagation();
        deleteListPrompt(list);
      };

      actions.appendChild(btnDelete);
      card.appendChild(actions);

      dashboardListsContainer.appendChild(card);
    });
  }

  function openCreateListForm() {
    formNewListCard.classList.remove('hidden');
    inputNewListTitle.focus();
  }

  function closeCreateListForm() {
    formNewListCard.classList.add('hidden');
    inputNewListTitle.value = '';
  }

  btnHeaderNewList.addEventListener('click', () => {
    if (formNewListCard.classList.contains('hidden')) {
      openCreateListForm();
    } else {
      closeCreateListForm();
    }
  });

  btnCancelCreate.addEventListener('click', closeCreateListForm);

  formCreateList.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = inputNewListTitle.value.trim();
    if (!title) return;

    // Check for duplicate name locally
    const exists = allLists.some((l) => l.title.trim().toLowerCase() === title.toLowerCase());
    if (exists) {
      showToast(`Opening existing list "${title}"`);
      const existing = allLists.find((l) => l.title.trim().toLowerCase() === title.toLowerCase());
      const targetId = existing.share_token || existing.id;
      window.history.pushState(null, '', `/list/${targetId}`);
      showListView(targetId);
      return;
    }

    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      closeCreateListForm();
      const targetId = data.share_token || data.id;
      window.history.pushState(null, '', `/list/${targetId}`);
      showListView(targetId);
    } catch (err) {
      showToast("Couldn't create list.");
    }
  });

  // --- STATE B: LIST VIEW ---
  async function showListView(identifier) {
    viewDashboard.classList.add('hidden');
    viewList.classList.remove('hidden');

    try {
      const res = await fetch(`/api/lists/${identifier}`);
      if (!res.ok) {
        showToast("List not found.");
        window.history.pushState(null, '', '/');
        showDashboardView();
        return;
      }

      currentList = await res.json();
      items = currentList.items || [];

      renderListHeader();
      renderGroceryItems();
      connectRealtime(currentList.id);
    } catch (err) {
      console.error(err);
      showToast('Network error.');
    }
  }

  function renderListHeader() {
    listTitleEl.textContent = currentList.title || 'Family Grocery List';
    inputTitleEdit.value = currentList.title || 'Family Grocery List';
  }

  btnBackToLists.addEventListener('click', () => {
    window.history.pushState(null, '', '/');
    showDashboardView();
  });

  // --- DIRECT DELETE LIST (ON THE LIST ITSELF) ---
  btnDeleteCurrentList.addEventListener('click', () => {
    if (!currentList) return;
    deleteListPrompt(currentList);
  });

  function deleteListPrompt(listObj) {
    openConfirmModal(
      `Delete "${listObj.title || 'Shopping List'}"?`,
      'This will remove this shopping list and all items.',
      'Delete List',
      async () => {
        allLists = allLists.filter((l) => l.id !== listObj.id && l.share_token !== listObj.share_token);
        renderDashboardLists();
        showToast(`Deleted "${listObj.title || 'List'}"`);

        try {
          await fetch(`/api/lists/${listObj.id}`, {
            method: 'DELETE',
          });
        } catch (err) {
          console.error(err);
        }

        if (currentList && (currentList.id === listObj.id || currentList.share_token === listObj.share_token)) {
          window.history.pushState(null, '', '/');
          showDashboardView();
        }
      }
    );
  }

  // --- MODAL ---
  function openConfirmModal(title, message, confirmLabel, onConfirm) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    btnModalConfirm.textContent = confirmLabel;
    modalConfirmCallback = onConfirm;
    modalBackdrop.classList.remove('hidden');
  }

  function closeConfirmModal() {
    modalBackdrop.classList.add('hidden');
    modalConfirmCallback = null;
  }

  btnModalCancel.addEventListener('click', closeConfirmModal);
  btnModalConfirm.addEventListener('click', () => {
    if (modalConfirmCallback) modalConfirmCallback();
    closeConfirmModal();
  });
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeConfirmModal();
  });

  // --- TITLE EDITING (Enforce Unique Name) ---
  btnEditTitle.addEventListener('click', () => {
    titleDisplayWrap.classList.add('hidden');
    titleEditWrap.classList.remove('hidden');
    inputTitleEdit.focus();
    inputTitleEdit.select();
  });

  listTitleEl.addEventListener('click', () => {
    btnEditTitle.click();
  });

  const saveTitle = async () => {
    const newTitle = inputTitleEdit.value.trim();
    if (!newTitle || !currentList) return;

    if (newTitle.toLowerCase() === (currentList.title || '').toLowerCase()) {
      titleDisplayWrap.classList.remove('hidden');
      titleEditWrap.classList.add('hidden');
      return;
    }

    const conflict = allLists.some(
      (l) => l.id !== currentList.id && l.title.trim().toLowerCase() === newTitle.toLowerCase()
    );
    if (conflict) {
      showToast(`A list named "${newTitle}" already exists.`);
      return;
    }

    currentList.title = newTitle;
    renderListHeader();
    titleDisplayWrap.classList.remove('hidden');
    titleEditWrap.classList.add('hidden');

    try {
      await fetch(`/api/lists/${currentList.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch (err) {
      showToast("Couldn't save title.");
    }
  };

  btnSaveTitle.addEventListener('click', saveTitle);
  inputTitleEdit.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveTitle();
    if (e.key === 'Escape') {
      titleDisplayWrap.classList.remove('hidden');
      titleEditWrap.classList.add('hidden');
    }
  });

  // --- EMOJI PRESENCE AVATARS ---
  const DEFAULT_EMOJIS = ['🦚', '🪷', '🐘', '🥭', '🫖', '🐯', '🥥', '🪔', '🌻', '🦁'];

  function renderPresenceAvatars(users = [], count = 1) {
    avatarStackEl.innerHTML = '';

    if (!users || users.length === 0) {
      const el = document.createElement('div');
      el.className = 'presence-avatar';
      el.textContent = '🦚';
      el.title = 'You are online';
      avatarStackEl.appendChild(el);
      presenceLabelEl.textContent = '1 online';
      return;
    }

    const maxDisplay = 4;
    const displayUsers = users.slice(0, maxDisplay);

    displayUsers.forEach((u, idx) => {
      const av = document.createElement('div');
      av.className = 'presence-avatar';
      av.style.backgroundColor = u.color || '#424874';
      av.textContent = u.emoji || u.initial || DEFAULT_EMOJIS[idx % DEFAULT_EMOJIS.length];
      av.title = idx === 0 ? 'You (online)' : `Family Member (${u.name || 'online'})`;
      avatarStackEl.appendChild(av);
    });

    if (users.length > maxDisplay) {
      const extra = document.createElement('div');
      extra.className = 'presence-avatar extra';
      extra.textContent = `+${users.length - maxDisplay}`;
      extra.title = `${users.length} people online`;
      avatarStackEl.appendChild(extra);
    }

    if (users.length === 1) {
      presenceLabelEl.textContent = '1 online';
    } else {
      presenceLabelEl.textContent = `${users.length} online`;
    }
  }

  // --- REALTIME SERVER-SENT EVENTS ---
  function connectRealtime(listId) {
    if (eventSource) eventSource.close();

    eventSource = new EventSource(`/api/lists/${listId}/events`);

    eventSource.onopen = () => {
      renderPresenceAvatars([], 1);
    };

    eventSource.onerror = () => {
      avatarStackEl.innerHTML = '';
      presenceLabelEl.textContent = 'Offline';
    };

    eventSource.addEventListener('presence', (e) => {
      const data = JSON.parse(e.data);
      renderPresenceAvatars(data.users, data.count);
    });

    eventSource.addEventListener('item_added', (e) => {
      const newItem = JSON.parse(e.data);
      const exists = items.some((i) => i.id === newItem.id);
      if (!exists) {
        items.push(newItem);
        renderGroceryItems();
      }
    });

    eventSource.addEventListener('item_updated', (e) => {
      const updatedItem = JSON.parse(e.data);
      items = items.map((i) => (i.id === updatedItem.id ? updatedItem : i));
      renderGroceryItems();
    });

    eventSource.addEventListener('item_deleted', (e) => {
      const { id } = JSON.parse(e.data);
      items = items.filter((i) => i.id !== id);
      renderGroceryItems();
    });

    eventSource.addEventListener('items_cleared', (e) => {
      const data = JSON.parse(e.data);
      items = data.items || [];
      renderGroceryItems();
    });

    eventSource.addEventListener('list_updated', (e) => {
      const updated = JSON.parse(e.data);
      currentList.title = updated.title;
      renderListHeader();
    });

    eventSource.addEventListener('list_deleted', () => {
      showToast('This list was deleted.');
      window.history.pushState(null, '', '/');
      showDashboardView();
    });
  }

  // --- RENDER ITEMS ---
  function renderGroceryItems() {
    const active = items.filter((i) => !i.completed).sort((a, b) => (a.position || 0) - (b.position || 0));
    const completed = items.filter((i) => i.completed).sort((a, b) => (a.position || 0) - (b.position || 0));

    activeCountEl.textContent = active.length;
    completedCountEl.textContent = completed.length;

    if (items.length === 0) {
      emptyStateEl.classList.remove('hidden');
      sectionActive.classList.add('hidden');
      sectionCompleted.classList.add('hidden');
    } else {
      emptyStateEl.classList.add('hidden');

      if (active.length > 0) {
        sectionActive.classList.remove('hidden');
        activeItemsEl.innerHTML = '';
        active.forEach((item) => activeItemsEl.appendChild(createItemRow(item)));
      } else {
        sectionActive.classList.add('hidden');
      }

      if (completed.length > 0) {
        sectionCompleted.classList.remove('hidden');
        completedItemsEl.innerHTML = '';
        completed.forEach((item) => completedItemsEl.appendChild(createItemRow(item)));
      } else {
        sectionCompleted.classList.add('hidden');
      }
    }
  }

  function createItemRow(item) {
    const row = document.createElement('div');
    row.className = `grocery-row ${item.completed ? 'completed' : ''}`;
    row.id = `item-${item.id}`;

    // Checkbox button
    const checkBtn = document.createElement('button');
    checkBtn.className = 'checkbox-btn';
    checkBtn.setAttribute('aria-label', item.completed ? `Unmark ${item.name}` : `Mark ${item.name}`);
    checkBtn.innerHTML = `
      <div class="custom-checkbox">
        ${item.completed ? '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
      </div>
    `;
    checkBtn.onclick = () => toggleItem(item.id, !item.completed);
    row.appendChild(checkBtn);

    // Item text & quantity
    const content = document.createElement('div');
    content.className = 'item-content';
    content.onclick = () => openInlineEdit(row, item);

    const textWrap = document.createElement('div');
    textWrap.className = 'item-text-wrap';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'item-name';
    nameSpan.textContent = item.name;
    textWrap.appendChild(nameSpan);

    if (item.quantity) {
      const qtySpan = document.createElement('span');
      qtySpan.className = 'item-qty-tag';
      qtySpan.textContent = item.quantity;
      textWrap.appendChild(qtySpan);
    }

    content.appendChild(textWrap);
    row.appendChild(content);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.setAttribute('aria-label', `Edit ${item.name}`);
    editBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
      </svg>
    `;
    editBtn.onclick = (e) => {
      e.stopPropagation();
      openInlineEdit(row, item);
    };
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn btn-delete';
    deleteBtn.setAttribute('aria-label', `Delete ${item.name}`);
    deleteBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    `;
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteItem(item.id);
    };
    actions.appendChild(deleteBtn);

    row.appendChild(actions);
    return row;
  }

  // --- INLINE EDITING ---
  function openInlineEdit(rowEl, item) {
    const editCard = document.createElement('div');
    editCard.className = 'edit-card';
    editCard.innerHTML = `
      <div class="edit-inputs">
        <input type="text" class="edit-name-input" value="${escapeHTML(item.name)}" maxLength="200" placeholder="Item name" />
        <input type="text" class="edit-qty-input" value="${escapeHTML(item.quantity || '')}" maxLength="100" placeholder="Quantity (optional)" />
      </div>
      <div class="edit-buttons">
        <button class="btn-cancel" type="button">Cancel</button>
        <button class="btn-save" type="button">Save</button>
      </div>
    `;

    const nameInput = editCard.querySelector('.edit-name-input');
    const qtyInput = editCard.querySelector('.edit-qty-input');
    const btnCancel = editCard.querySelector('.btn-cancel');
    const btnSave = editCard.querySelector('.btn-save');

    const saveChanges = async () => {
      const newName = nameInput.value.trim();
      const newQty = qtyInput.value.trim() || null;
      if (!newName) return;

      item.name = newName;
      item.quantity = newQty;
      renderGroceryItems();

      try {
        await fetch(`/api/lists/${currentList.id}/items/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName, quantity: newQty }),
        });
      } catch (err) {
        showToast("Couldn't save edit.");
      }
    };

    btnSave.onclick = saveChanges;
    btnCancel.onclick = () => renderGroceryItems();

    nameInput.onkeydown = (e) => {
      if (e.key === 'Enter') saveChanges();
      if (e.key === 'Escape') renderGroceryItems();
    };
    qtyInput.onkeydown = (e) => {
      if (e.key === 'Enter') saveChanges();
      if (e.key === 'Escape') renderGroceryItems();
    };

    rowEl.replaceWith(editCard);
    nameInput.focus();
    nameInput.select();
  }

  // --- ACTIONS ---
  async function toggleItem(itemId, completed) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    item.completed = completed;
    renderGroceryItems();

    try {
      await fetch(`/api/lists/${currentList.id}/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
    } catch (err) {
      item.completed = !completed;
      renderGroceryItems();
      showToast("Couldn't save change.");
    }
  }

  async function deleteItem(itemId) {
    const itemIndex = items.findIndex((i) => i.id === itemId);
    if (itemIndex === -1) return;

    const [deletedItem] = items.splice(itemIndex, 1);
    renderGroceryItems();

    const timer = setTimeout(async () => {
      pendingDeletes.delete(itemId);
      try {
        await fetch(`/api/lists/${currentList.id}/items/${itemId}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.error(err);
      }
    }, 4000);

    const toastEl = showToast(
      `Deleted ${deletedItem.name}`,
      'Undo',
      () => {
        clearTimeout(timer);
        pendingDeletes.delete(itemId);
        items.push(deletedItem);
        renderGroceryItems();
      },
      4000
    );

    pendingDeletes.set(itemId, { item: deletedItem, timer, toastEl });
  }

  btnClearPurchasedInline.addEventListener('click', async () => {
    if (!currentList) return;
    const completed = items.filter((i) => i.completed);
    if (completed.length === 0) {
      showToast('No purchased items to clear.');
      return;
    }

    const previousItems = [...items];
    items = items.filter((i) => !i.completed);
    renderGroceryItems();

    let undone = false;
    const timer = setTimeout(async () => {
      if (undone) return;
      try {
        await fetch(`/api/lists/${currentList.id}/items?mode=completed`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.error(err);
      }
    }, 4000);

    showToast(
      `Cleared ${completed.length} items`,
      'Undo',
      () => {
        undone = true;
        clearTimeout(timer);
        items = previousItems;
        renderGroceryItems();
      },
      4000
    );
  });

  // --- ADD ITEM SUBMISSION ---
  formAddItem.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = inputItemName.value.trim();
    const quantity = inputItemQty.value.trim() || null;
    if (!name || !currentList) return;

    inputItemName.value = '';
    inputItemQty.value = '';
    qtyRow.classList.add('hidden');
    inputItemName.focus();

    const itemId = window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : 'item_' + Math.random().toString(36).slice(2) + Date.now().toString(36);

    const newItem = {
      id: itemId,
      name,
      quantity,
      completed: false,
      position: items.length + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    items.push(newItem);
    renderGroceryItems();

    try {
      const res = await fetch(`/api/lists/${currentList.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, name, quantity }),
      });
      const saved = await res.json();
      const idx = items.findIndex((i) => i.id === itemId);
      if (idx !== -1) {
        items[idx] = saved;
      }
    } catch (err) {
      items = items.filter((i) => i.id !== itemId);
      renderGroceryItems();
      showToast("Couldn't add item.");
    }
  });

  // Quick Indian Suggestions chips click handler
  quickChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const itemName = chip.getAttribute('data-item');
      const itemQty = chip.getAttribute('data-qty');
      inputItemName.value = itemName;
      if (itemQty) {
        inputItemQty.value = itemQty;
        qtyRow.classList.remove('hidden');
      }
      inputItemName.focus();
    });
  });

  // Quantity toggling
  btnToggleQty.addEventListener('click', () => {
    qtyRow.classList.toggle('hidden');
    if (!qtyRow.classList.contains('hidden')) {
      inputItemQty.focus();
    }
  });

  btnCloseQty.addEventListener('click', () => {
    inputItemQty.value = '';
    qtyRow.classList.add('hidden');
    inputItemName.focus();
  });

  emptyStateEl.addEventListener('click', () => {
    inputItemName.focus();
  });

  // --- SHARING ---
  btnShare.addEventListener('click', async () => {
    const url = window.location.href;
    const title = currentList ? currentList.title : 'Family Grocery List';

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: `Shared Family Grocery List: ${title}`,
          url,
        });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }

      shareBtnText.textContent = 'Copied!';
      showToast('Link copied to clipboard.');
      setTimeout(() => {
        shareBtnText.textContent = 'Share';
      }, 2000);
    } catch {
      showToast('Could not copy link.');
    }
  });

  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  initApp();
})();
