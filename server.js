/**
 * Family Grocery List - Ultra-lightweight Zero-Dependency Server
 * Uses 100% native Node.js built-in modules (http, fs, path, crypto, url).
 * Integrated with Supabase Cloud Database via native REST API (fetch).
 * Features:
 *  - Emojis for live active members (🦚, 🪷, 🐘, 🥭, 🫖, 🐯, 🥥, 🪔, 🌻)
 *  - Indian cultural household elements & touches
 *  - Lists-First Dashboard with unique names and direct deletion
 *  - Footer: Made by Tanishk with love ❤️
 *  - Custom Theme Palette: #F4EEFF, #DCD6F7, #A6B1E1, #424874
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// --- LOAD .ENV VARIABLES WITHOUT NPM ---
function loadEnv() {
  const envFiles = [path.join(__dirname, '.env'), path.join(__dirname, '.env.local')];
  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      try {
        const content = fs.readFileSync(envFile, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch (err) {
        console.error('Error loading env file:', err);
      }
    }
  }
}

loadEnv();

// Supabase Cloud REST Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const isCloudConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL.startsWith('http'));

// --- SUPABASE CLOUD REST API ADAPTER ---
class SupabaseAdapter {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  get headers() {
    return {
      'apikey': this.apiKey,
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
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
    // Fallback to local
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
      const filter = `or=(id.eq.${identifier},share_token.eq.${identifier})`;
      const res = await fetch(`${this.baseUrl}/rest/v1/grocery_lists?${filter}`, {
        method: 'GET',
        headers: this.headers,
      });
      if (!res.ok) return null;
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

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory store with disk persistence
let store = {
  lists: {}, // { [listId]: { id, title, share_token, created_at, updated_at, items: [] } }
};

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      store = JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading store from disk:', err);
  }
}

function saveStore() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving store to disk:', err);
  }
}

loadStore();

// Theme color palette matching #F4EEFF, #DCD6F7, #A6B1E1, #424874
const AVATAR_PALETTE = [
  { name: 'Navy', bg: '#424874', text: '#FFFFFF' },
  { name: 'Periwinkle', bg: '#A6B1E1', text: '#424874' },
  { name: 'Lavender', bg: '#70759E', text: '#FFFFFF' },
  { name: 'Indigo', bg: '#545B8C', text: '#FFFFFF' },
  { name: 'Lilac', bg: '#8E97C6', text: '#FFFFFF' },
  { name: 'Slate', bg: '#2C3053', text: '#FFFFFF' },
];

// Indian & Family Presence Emojis for Active Members
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

const sseClients = new Map(); // listId -> Set of res objects

function getPresenceUsers(listId) {
  const clients = sseClients.get(listId);
  if (!clients) return [];
  const users = [];
  let idx = 0;
  for (const client of clients) {
    const palette = AVATAR_PALETTE[idx % AVATAR_PALETTE.length];
    const emojiInfo = PRESENCE_EMOJIS[idx % PRESENCE_EMOJIS.length];
    users.push({
      clientId: client._clientId || `c-${idx}`,
      name: client._clientName || (idx === 0 ? 'You' : `Family Member (${emojiInfo.label})`),
      emoji: emojiInfo.emoji,
      initial: emojiInfo.emoji,
      color: palette.bg,
      textColor: palette.text,
    });
    idx++;
  }
  return users;
}

function broadcast(listId, eventType, data) {
  const clients = sseClients.get(listId);
  if (!clients || clients.size === 0) return;
  const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.write(message);
  }
}

function broadcastPresence(listId) {
  const users = getPresenceUsers(listId);
  broadcast(listId, 'presence', {
    count: users.length,
    users: users,
  });
}

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

  if (store.lists[identifier]) return store.lists[identifier];
  for (const key in store.lists) {
    if (store.lists[key].share_token === identifier || store.lists[key].id === identifier) {
      return store.lists[key];
    }
  }

  if (isCloudConfigured) {
    const cloudList = await supabase.getList(identifier);
    if (cloudList) {
      store.lists[cloudList.id] = cloudList;
      saveStore();
      return cloudList;
    }
  }

  return null;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // --- API ROUTING ---

  // 1. Get all lists: GET /api/lists
  if (method === 'GET' && pathname === '/api/lists') {
    const allLists = await supabase.getAllLists();
    return sendJSON(res, 200, allLists);
  }

  // 2. Create a new list: POST /api/lists (Enforces unique list names & auto-cleans empty lists)
  if (method === 'POST' && pathname === '/api/lists') {
    const body = await parseBody(req);
    const title = (body.title || 'Family Grocery List').trim().slice(0, 100);

    const existing = Object.values(store.lists).find(
      (l) => l.title.trim().toLowerCase() === title.trim().toLowerCase()
    );
    if (existing) {
      return sendJSON(res, 200, existing);
    }

    // Clean up empty lists with 0 items
    for (const key in store.lists) {
      if (store.lists[key].items && store.lists[key].items.length === 0) {
        const emptyId = store.lists[key].id;
        delete store.lists[key];
        if (isCloudConfigured) supabase.deleteList(emptyId).catch(console.warn);
      }
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

    return sendJSON(res, 201, newList);
  }

  // 3. Real-time Server-Sent Events stream: GET /api/lists/:id/events
  const sseMatch = pathname.match(/^\/api\/lists\/([^/]+)\/events$/);
  if (method === 'GET' && sseMatch) {
    const listId = sseMatch[1];
    const list = await findListByIdOrToken(listId);

    if (!list) {
      return sendJSON(res, 404, { error: 'List not found' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    res.write('retry: 3000\n\n');

    res._clientId = crypto.randomUUID ? crypto.randomUUID() : generateRandomToken(8);
    res._clientName = parsedUrl.query.name || '';

    if (!sseClients.has(list.id)) {
      sseClients.set(list.id, new Set());
    }
    const clients = sseClients.get(list.id);
    clients.add(res);

    broadcastPresence(list.id);

    req.on('close', () => {
      const currentClients = sseClients.get(list.id);
      if (currentClients) {
        currentClients.delete(res);
        if (currentClients.size === 0) {
          sseClients.delete(list.id);
        } else {
          broadcastPresence(list.id);
        }
      }
    });
    return;
  }

  // 4. Specific list details & items: GET /api/lists/:id
  const getListMatch = pathname.match(/^\/api\/lists\/([^/]+)$/);
  if (method === 'GET' && getListMatch) {
    const listId = getListMatch[1];
    const list = await findListByIdOrToken(listId);
    if (!list) {
      return sendJSON(res, 404, { error: 'List not found' });
    }
    return sendJSON(res, 200, list);
  }

  // 5. Update list title: PUT /api/lists/:id
  if (method === 'PUT' && getListMatch) {
    const listId = getListMatch[1];
    const list = await findListByIdOrToken(listId);
    if (!list) {
      return sendJSON(res, 404, { error: 'List not found' });
    }
    const body = await parseBody(req);
    const newTitle = (body.title || '').trim().slice(0, 100);
    if (newTitle) {
      const conflict = Object.values(store.lists).find(
        (l) => l.id !== list.id && l.title.trim().toLowerCase() === newTitle.toLowerCase()
      );
      if (conflict) {
        return sendJSON(res, 400, { error: `A list named "${newTitle}" already exists.` });
      }

      list.title = newTitle;
      list.updated_at = new Date().toISOString();
      saveStore();
      broadcast(list.id, 'list_updated', list);

      if (isCloudConfigured) {
        supabase.updateListTitle(list.id, newTitle).catch(console.warn);
      }
    }
    return sendJSON(res, 200, list);
  }

  // 6. Delete entire list: DELETE /api/lists/:id
  if (method === 'DELETE' && getListMatch) {
    const listId = getListMatch[1];
    const list = await findListByIdOrToken(listId);
    if (!list) {
      return sendJSON(res, 404, { error: 'List not found' });
    }

    const deletedId = list.id;
    delete store.lists[deletedId];
    saveStore();

    broadcast(deletedId, 'list_deleted', { id: deletedId });

    if (isCloudConfigured) {
      supabase.deleteList(deletedId).catch(console.warn);
    }

    return sendJSON(res, 200, { success: true, id: deletedId });
  }

  // 7. Add grocery item: POST /api/lists/:id/items
  const addItemMatch = pathname.match(/^\/api\/lists\/([^/]+)\/items$/);
  if (method === 'POST' && addItemMatch) {
    const listId = addItemMatch[1];
    const list = await findListByIdOrToken(listId);
    if (!list) {
      return sendJSON(res, 404, { error: 'List not found' });
    }
    const body = await parseBody(req);
    const name = (body.name || '').trim().slice(0, 200);
    if (!name) {
      return sendJSON(res, 400, { error: 'Item name is required' });
    }
    const quantity = body.quantity ? body.quantity.trim().slice(0, 100) : null;
    const now = new Date().toISOString();
    const maxPos = list.items.reduce((max, i) => Math.max(max, i.position || 0), 0);

    const itemId = body.id || (crypto.randomUUID ? crypto.randomUUID() : generateRandomToken(16));

    const existingIndex = list.items.findIndex((i) => i.id === itemId);
    if (existingIndex !== -1) {
      return sendJSON(res, 200, list.items[existingIndex]);
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

    broadcast(list.id, 'item_added', newItem);

    if (isCloudConfigured) {
      supabase.addItem(newItem).catch(console.warn);
    }

    return sendJSON(res, 201, newItem);
  }

  // 8. Delete all items or clear completed: DELETE /api/lists/:id/items
  if (method === 'DELETE' && addItemMatch) {
    const listId = addItemMatch[1];
    const list = await findListByIdOrToken(listId);
    if (!list) {
      return sendJSON(res, 404, { error: 'List not found' });
    }

    const mode = parsedUrl.query.mode || (parsedUrl.query.completed === 'true' ? 'completed' : 'all');
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

    broadcast(list.id, 'items_cleared', { mode, items: list.items });

    if (isCloudConfigured) {
      supabase.clearItems(list.id, mode).catch(console.warn);
    }

    return sendJSON(res, 200, { success: true, mode, count: removedItems.length, removedItems });
  }

  // 9. Update item: PUT /api/lists/:id/items/:itemId
  const updateItemMatch = pathname.match(/^\/api\/lists\/([^/]+)\/items\/([^/]+)$/);
  if (method === 'PUT' && updateItemMatch) {
    const listId = updateItemMatch[1];
    const itemId = updateItemMatch[2];
    const list = await findListByIdOrToken(listId);
    if (!list) {
      return sendJSON(res, 404, { error: 'List not found' });
    }
    const item = list.items.find((i) => i.id === itemId);
    if (!item) {
      return sendJSON(res, 404, { error: 'Item not found' });
    }

    const body = await parseBody(req);
    const updates = {};
    if (body.name !== undefined) {
      item.name = body.name.trim().slice(0, 200);
      updates.name = item.name;
    }
    if (body.quantity !== undefined) {
      item.quantity = body.quantity ? body.quantity.trim().slice(0, 100) : null;
      updates.quantity = item.quantity;
    }
    if (body.completed !== undefined) {
      item.completed = Boolean(body.completed);
      updates.completed = item.completed;
    }
    if (body.position !== undefined) {
      item.position = Number(body.position);
      updates.position = item.position;
    }

    item.updated_at = new Date().toISOString();
    list.updated_at = item.updated_at;
    saveStore();

    broadcast(list.id, 'item_updated', item);

    if (isCloudConfigured) {
      supabase.updateItem(list.id, itemId, updates).catch(console.warn);
    }

    return sendJSON(res, 200, item);
  }

  // 10. Delete item: DELETE /api/lists/:id/items/:itemId
  if (method === 'DELETE' && updateItemMatch) {
    const listId = updateItemMatch[1];
    const itemId = updateItemMatch[2];
    const list = await findListByIdOrToken(listId);
    if (!list) {
      return sendJSON(res, 404, { error: 'List not found' });
    }
    const index = list.items.findIndex((i) => i.id === itemId);
    if (index === -1) {
      return sendJSON(res, 404, { error: 'Item not found' });
    }

    const [deletedItem] = list.items.splice(index, 1);
    list.updated_at = new Date().toISOString();
    saveStore();

    broadcast(list.id, 'item_deleted', { id: itemId });

    if (isCloudConfigured) {
      supabase.deleteItem(list.id, itemId).catch(console.warn);
    }

    return sendJSON(res, 200, { success: true, deletedItem });
  }

  // --- STATIC FILE SERVING & SPA ROUTING ---
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  if (pathname.startsWith('/list/') || (!fs.existsSync(filePath) && !path.extname(pathname))) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, fallback) => {
          if (err2) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(fallback);
          }
        });
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`  Family Grocery List server running on port ${PORT}`);
  console.log(`  Theme Palette: #F4EEFF, #DCD6F7, #A6B1E1, #424874`);
  console.log(`  Cultural Touch: Indian Household Elements & Emojis`);
  console.log(`  Cloud DB: ${isCloudConfigured ? 'Connected to Supabase (' + SUPABASE_URL + ')' : 'Local disk fallback'}`);
  console.log(`  Features: Emoji Presence Avatars, Lists Dashboard`);
  console.log(`==================================================\n`);
});
