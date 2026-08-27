/**
 * Family Grocery List - Express.js + Socket.IO Server
 * Features:
 *  - Express.js robust REST API with CORS and JSON parsing
 *  - Socket.IO realtime room-based collaboration and live presence
 *  - Supabase Cloud Database integration via REST API (with local JSON store fallback)
 *  - Indian cultural household elements & presence emojis (🦚, 🪷, 🐘, 🥭, 🫖, 🐯, 🥥, 🪔, 🌻)
 *  - Lists-First Dashboard with unique name validation
 *  - Custom Theme Palette: #F4EEFF, #DCD6F7, #A6B1E1, #424874
 *  - PWA & SPA static routing
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

// Support loading .env.local if present
const envLocal = path.join(__dirname, '.env.local');
if (fs.existsSync(envLocal)) {
  try {
    const content = fs.readFileSync(envLocal, 'utf8');
    content.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    });
  } catch (err) {
    console.error('Error loading .env.local:', err.message);
  }
}

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const isCloudConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL.startsWith('http'));

// --- SUPABASE ADAPTER ---
class SupabaseAdapter {
  constructor(baseUrl, apiKey) {
    this.baseUrl = (baseUrl || '').replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  get headers() {
    return {
      apikey: this.apiKey,
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };
  }

  async getAllLists() {
    if (!isCloudConfigured) {
      return Object.values(store.lists)
        .map((l) => ({
          id: l.id,
          title: l.title,
          share_token: l.share_token,
          created_at: l.created_at,
          updated_at: l.updated_at,
          item_count: (l.items || []).length,
          active_count: (l.items || []).filter((i) => !i.completed).length,
          preview_items: (l.items || []).slice(0, 3).map((i) => i.name),
        }))
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    }
    try {
      const res = await fetch(`${this.baseUrl}/rest/v1/grocery_lists?select=*,grocery_items(id,name,completed)&order=updated_at.desc`, {
        method: 'GET',
        headers: this.headers,
      });
      if (res.ok) {
        const data = await res.json();
        return data
          .map((l) => ({
            id: l.id,
            title: l.title,
            share_token: l.share_token,
            created_at: l.created_at,
            updated_at: l.updated_at,
            item_count: (l.grocery_items || []).length,
            active_count: (l.grocery_items || []).filter((i) => !i.completed).length,
            preview_items: (l.grocery_items || []).slice(0, 3).map((i) => i.name),
          }))
          .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      }
    } catch (e) {
      console.warn('[Supabase] getAllLists error:', e.message);
    }
    return Object.values(store.lists)
      .map((l) => ({
        id: l.id,
        title: l.title,
        share_token: l.share_token,
        created_at: l.created_at,
        updated_at: l.updated_at,
        item_count: (l.items || []).length,
        active_count: (l.items || []).filter((i) => !i.completed).length,
        preview_items: (l.items || []).slice(0, 3).map((i) => i.name),
      }))
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }

  async createList(id, title, shareToken) {
    if (!isCloudConfigured) return null;
    try {
      const res = await fetch(`${this.baseUrl}/rest/v1/grocery_lists`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ id, title, share_token: shareToken }),
      });
      if (!res.ok) {
        console.warn('[Supabase] createList warning:', res.status, await res.text());
        return null;
      }
      const data = await res.json();
      return Array.isArray(data) ? data[0] : data;
    } catch (err) {
      console.warn('[Supabase] createList error:', err.message);
      return null;
    }
  }

  async getList(identifier) {
    if (!isCloudConfigured) return null;
    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
      const filter = isUUID ? `or=(id.eq.${identifier},share_token.eq.${identifier})` : `share_token.eq.${identifier}`;
      const res = await fetch(`${this.baseUrl}/rest/v1/grocery_lists?${filter}`, {
        method: 'GET',
        headers: this.headers,
      });
      if (!res.ok) {
        return null;
      }
      const lists = await res.json();
      if (!lists || lists.length === 0) return null;
      const list = lists[0];

      const itemsRes = await fetch(`${this.baseUrl}/rest/v1/grocery_items?list_id=eq.${list.id}&order=position.asc`, {
        method: 'GET',
        headers: this.headers,
      });
      const items = itemsRes.ok ? await itemsRes.json() : [];
      list.items = items;
      return list;
    } catch (err) {
      console.warn('[Supabase] getList error:', err.message);
      return null;
    }
  }

  async updateListTitle(listId, title) {
    if (!isCloudConfigured) return null;
    try {
      const res = await fetch(`${this.baseUrl}/rest/v1/grocery_lists?id=eq.${listId}`, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify({ title, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data) ? data[0] : data;
    } catch (err) {
      console.warn('[Supabase] updateListTitle error:', err.message);
      return null;
    }
  }

  async deleteList(listId) {
    if (!isCloudConfigured) return null;
    try {
      await fetch(`${this.baseUrl}/rest/v1/grocery_lists?id=eq.${listId}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  async addItem(item) {
    if (!isCloudConfigured) return null;
    try {
      const res = await fetch(`${this.baseUrl}/rest/v1/grocery_items`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(item),
      });
      if (!res.ok) {
        console.warn('[Supabase] addItem warning:', res.status, await res.text());
        return null;
      }
      const data = await res.json();
      return Array.isArray(data) ? data[0] : data;
    } catch (err) {
      console.warn('[Supabase] addItem error:', err.message);
      return null;
    }
  }

  async updateItem(listId, itemId, updates) {
    if (!isCloudConfigured) return null;
    try {
      const res = await fetch(`${this.baseUrl}/rest/v1/grocery_items?id=eq.${itemId}&list_id=eq.${listId}`, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data) ? data[0] : data;
    } catch (err) {
      console.warn('[Supabase] updateItem error:', err.message);
      return null;
    }
  }

  async deleteItem(listId, itemId) {
    if (!isCloudConfigured) return null;
    try {
      await fetch(`${this.baseUrl}/rest/v1/grocery_items?id=eq.${itemId}&list_id=eq.${listId}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  async clearItems(listId, mode = 'all') {
    if (!isCloudConfigured) return null;
    try {
      let query = `list_id=eq.${listId}`;
      if (mode === 'completed') {
        query += `&completed=eq.true`;
      }
      await fetch(`${this.baseUrl}/rest/v1/grocery_items?${query}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      return true;
    } catch (err) {
      return false;
    }
  }
}

const supabase = new SupabaseAdapter(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- LOCAL STORE FALLBACK ---
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let store = { lists: {} };

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      store = JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading store from disk:', err.message);
  }
}

function saveStore() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving store to disk:', err.message);
  }
}

loadStore();

function generateRandomToken(len = 9) {
  const chars = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(len);
  let res = '';
  for (let i = 0; i < len; i++) {
    res += chars[bytes[i] % chars.length];
  }
  return res;
}

async function findListByIdOrToken(identifier) {
  if (!identifier) return null;

  if (isCloudConfigured) {
    const cloudList = await supabase.getList(identifier);
    if (cloudList) {
      store.lists[cloudList.id] = cloudList;
      saveStore();
      return cloudList;
    }
  }

  if (store.lists[identifier]) return store.lists[identifier];
  for (const key in store.lists) {
    if (store.lists[key].share_token === identifier || store.lists[key].id === identifier) {
      return store.lists[key];
    }
  }

  return null;
}

// --- PRESENCE CONFIGURATION ---
const AVATAR_PALETTE = [
  { name: 'Navy', bg: '#424874', text: '#FFFFFF' },
  { name: 'Periwinkle', bg: '#A6B1E1', text: '#424874' },
  { name: 'Lavender', bg: '#70759E', text: '#FFFFFF' },
  { name: 'Indigo', bg: '#545B8C', text: '#FFFFFF' },
  { name: 'Lilac', bg: '#8E97C6', text: '#FFFFFF' },
  { name: 'Slate', bg: '#2C3053', text: '#FFFFFF' },
];

const PRESENCE_EMOJIS = [
  { emoji: '🦚', label: 'Mor (Peacock)' },
  { emoji: '🪷', label: 'Kamal (Lotus)' },
  { emoji: '🐘', label: 'Haathi (Elephant)' },
  { emoji: '🥭', label: 'Aam (Mango)' },
  { emoji: '🫖', label: 'Chai' },
  { emoji: '🐯', label: 'Bagh (Tiger)' },
  { emoji: '🥥', label: 'Nariyal (Coconut)' },
  { emoji: '🪔', label: 'Diya' },
  { emoji: '🌻', label: 'Surajmukhi' },
  { emoji: '🦁', label: 'Sher (Lion)' },
];

// Room tracking: listId -> Map(socketId -> { clientId, name })
const roomMembers = new Map();

function getPresenceUsers(listId) {
  const members = roomMembers.get(listId);
  if (!members || members.size === 0) return [];
  const users = [];
  let idx = 0;
  for (const [, member] of members) {
    const palette = AVATAR_PALETTE[idx % AVATAR_PALETTE.length];
    const emojiInfo = PRESENCE_EMOJIS[idx % PRESENCE_EMOJIS.length];
    users.push({
      clientId: member.clientId || `c-${idx}`,
      name: member.name || (idx === 0 ? 'You' : emojiInfo.label),
      emoji: emojiInfo.emoji,
      initial: emojiInfo.emoji,
      color: palette.bg,
      textColor: palette.text,
    });
    idx++;
  }
  return users;
}

function broadcastPresence(io, listId) {
  const users = getPresenceUsers(listId);
  io.to(`list_${listId}`).emit('presence', {
    count: users.length,
    users: users,
  });
}

// --- EXPRESS APP & HTTP SERVER SETUP ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// --- SOCKET.IO REALTIME COLLABORATION ---
io.on('connection', (socket) => {
  let activeListId = null;

  socket.on('join_list', ({ listId, name, clientId }) => {
    if (!listId) return;

    if (activeListId && activeListId !== listId) {
      socket.leave(`list_${activeListId}`);
      if (roomMembers.has(activeListId)) {
        roomMembers.get(activeListId).delete(socket.id);
        if (roomMembers.get(activeListId).size === 0) {
          roomMembers.delete(activeListId);
        } else {
          broadcastPresence(io, activeListId);
        }
      }
    }

    activeListId = listId;
    socket.join(`list_${listId}`);

    if (!roomMembers.has(listId)) {
      roomMembers.set(listId, new Map());
    }
    roomMembers.get(listId).set(socket.id, {
      clientId: clientId || socket.id,
      name: name || '',
    });

    broadcastPresence(io, listId);
  });

  socket.on('leave_list', ({ listId }) => {
    const targetId = listId || activeListId;
    if (targetId) {
      socket.leave(`list_${targetId}`);
      if (roomMembers.has(targetId)) {
        roomMembers.get(targetId).delete(socket.id);
        if (roomMembers.get(targetId).size === 0) {
          roomMembers.delete(targetId);
        } else {
          broadcastPresence(io, targetId);
        }
      }
    }
    if (activeListId === targetId) {
      activeListId = null;
    }
  });

  socket.on('disconnect', () => {
    if (activeListId && roomMembers.has(activeListId)) {
      roomMembers.get(activeListId).delete(socket.id);
      if (roomMembers.get(activeListId).size === 0) {
        roomMembers.delete(activeListId);
      } else {
        broadcastPresence(io, activeListId);
      }
    }
  });
});

// --- REST API ROUTES ---

// 1. Get all lists
app.get('/api/lists', async (req, res) => {
  const allLists = await supabase.getAllLists();
  res.json(allLists);
});

// 2. Create new list (Enforce unique name)
app.post('/api/lists', async (req, res) => {
  const title = (req.body.title || 'Family Grocery List').trim().slice(0, 100);

  const existing = Object.values(store.lists).find(
    (l) => l.title.trim().toLowerCase() === title.trim().toLowerCase()
  );
  if (existing) {
    return res.json(existing);
  }

  const id = crypto.randomUUID ? crypto.randomUUID() : generateRandomToken(16);
  const shareToken = generateRandomToken(9);
  const now = new Date().toISOString();

  const newList = {
    id,
    title: title || 'Family Grocery List',
    share_token: shareToken,
    created_at: now,
    updated_at: now,
    items: [],
  };

  store.lists[id] = newList;
  saveStore();

  if (isCloudConfigured) {
    supabase.createList(id, newList.title, shareToken).catch(console.warn);
  }

  res.status(201).json(newList);
});

// 3. Get specific list
app.get('/api/lists/:id', async (req, res) => {
  const list = await findListByIdOrToken(req.params.id);
  if (!list) {
    return res.status(404).json({ error: 'List not found' });
  }
  res.json(list);
});

// 4. Update list title
app.put('/api/lists/:id', async (req, res) => {
  const list = await findListByIdOrToken(req.params.id);
  if (!list) {
    return res.status(404).json({ error: 'List not found' });
  }

  const newTitle = (req.body.title || '').trim().slice(0, 100);
  if (newTitle) {
    const conflict = Object.values(store.lists).find(
      (l) => l.id !== list.id && l.title.trim().toLowerCase() === newTitle.toLowerCase()
    );
    if (conflict) {
      return res.status(400).json({ error: `A list named "${newTitle}" already exists.` });
    }

    list.title = newTitle;
    list.updated_at = new Date().toISOString();
    saveStore();

    io.to(`list_${list.id}`).emit('list_updated', list);

    if (isCloudConfigured) {
      supabase.updateListTitle(list.id, newTitle).catch(console.warn);
    }
  }

  res.json(list);
});

// 5. Delete entire list
app.delete('/api/lists/:id', async (req, res) => {
  const list = await findListByIdOrToken(req.params.id);
  if (!list) {
    return res.status(404).json({ error: 'List not found' });
  }

  const deletedId = list.id;
  delete store.lists[deletedId];
  saveStore();

  io.to(`list_${deletedId}`).emit('list_deleted', { id: deletedId });

  if (isCloudConfigured) {
    supabase.deleteList(deletedId).catch(console.warn);
  }

  res.json({ success: true, id: deletedId });
});

// 6. Add grocery item
app.post('/api/lists/:id/items', async (req, res) => {
  const list = await findListByIdOrToken(req.params.id);
  if (!list) {
    return res.status(404).json({ error: 'List not found' });
  }

  const name = (req.body.name || '').trim().slice(0, 200);
  if (!name) {
    return res.status(400).json({ error: 'Item name is required' });
  }

  const quantity = req.body.quantity ? req.body.quantity.trim().slice(0, 100) : null;
  const now = new Date().toISOString();
  const maxPos = list.items.reduce((max, i) => Math.max(max, i.position || 0), 0);
  const itemId = req.body.id || (crypto.randomUUID ? crypto.randomUUID() : generateRandomToken(16));

  const existingIndex = list.items.findIndex((i) => i.id === itemId);
  if (existingIndex !== -1) {
    return res.json(list.items[existingIndex]);
  }

  const newItem = {
    id: itemId,
    list_id: list.id,
    name,
    quantity,
    completed: false,
    position: maxPos + 1,
    created_at: now,
    updated_at: now,
  };

  list.items.push(newItem);
  list.updated_at = now;
  saveStore();

  io.to(`list_${list.id}`).emit('item_added', newItem);

  if (isCloudConfigured) {
    supabase.addItem(newItem).catch(console.warn);
  }

  res.status(201).json(newItem);
});

// 7. Clear all items or completed items
app.delete('/api/lists/:id/items', async (req, res) => {
  const list = await findListByIdOrToken(req.params.id);
  if (!list) {
    return res.status(404).json({ error: 'List not found' });
  }

  const mode = req.query.mode || (req.query.completed === 'true' ? 'completed' : 'all');
  let removedItems = [];

  if (mode === 'completed') {
    removedItems = list.items.filter((i) => i.completed);
    list.items = list.items.filter((i) => !i.completed);
  } else {
    removedItems = [...list.items];
    list.items = [];
  }

  list.updated_at = new Date().toISOString();
  saveStore();

  io.to(`list_${list.id}`).emit('items_cleared', {
    listId: list.id,
    mode,
    items: list.items,
  });

  if (isCloudConfigured) {
    supabase.clearItems(list.id, mode).catch(console.warn);
  }

  res.json({ success: true, mode, count: removedItems.length, removedItems });
});

// 8. Update specific item
app.put('/api/lists/:id/items/:itemId', async (req, res) => {
  const list = await findListByIdOrToken(req.params.id);
  if (!list) {
    return res.status(404).json({ error: 'List not found' });
  }

  const itemId = req.params.itemId;
  const item = list.items.find((i) => i.id === itemId);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const updates = {};
  if (req.body.name !== undefined) {
    item.name = req.body.name.trim().slice(0, 200);
    updates.name = item.name;
  }
  if (req.body.quantity !== undefined) {
    item.quantity = req.body.quantity ? req.body.quantity.trim().slice(0, 100) : null;
    updates.quantity = item.quantity;
  }
  if (req.body.completed !== undefined) {
    item.completed = Boolean(req.body.completed);
    updates.completed = item.completed;
  }
  if (req.body.position !== undefined) {
    item.position = Number(req.body.position);
    updates.position = item.position;
  }

  item.updated_at = new Date().toISOString();
  list.updated_at = item.updated_at;
  saveStore();

  io.to(`list_${list.id}`).emit('item_updated', item);

  if (isCloudConfigured) {
    supabase.updateItem(list.id, itemId, updates).catch(console.warn);
  }

  res.json(item);
});

// 9. Delete specific item
app.delete('/api/lists/:id/items/:itemId', async (req, res) => {
  const list = await findListByIdOrToken(req.params.id);
  if (!list) {
    return res.status(404).json({ error: 'List not found' });
  }

  const itemId = req.params.itemId;
  const index = list.items.findIndex((i) => i.id === itemId);
  if (index === -1) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const [deletedItem] = list.items.splice(index, 1);
  list.updated_at = new Date().toISOString();
  saveStore();

  io.to(`list_${list.id}`).emit('item_deleted', { listId: list.id, id: itemId });

  if (isCloudConfigured) {
    supabase.deleteItem(list.id, itemId).catch(console.warn);
  }

  res.json({ success: true, deletedItem });
});

// --- SPA FALLBACK ROUTE ---
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// --- START SERVER ---
server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`  Family Grocery List Express + Socket.IO server running on port ${PORT}`);
  console.log(`  Theme Palette: #F4EEFF, #DCD6F7, #A6B1E1, #424874`);
  console.log(`  Cultural Touch: Indian Household Elements & Emojis`);
  console.log(`  Cloud DB: ${isCloudConfigured ? 'Connected to Supabase (' + SUPABASE_URL + ')' : 'Local disk fallback'}`);
  console.log(`  Realtime Engine: Socket.IO Rooms`);
  console.log(`==================================================\n`);
});
