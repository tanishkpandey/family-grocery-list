/**
 * Ghar ki zaroorat - Express.js REST API Server
 * Simple, organized backend with Supabase PostgreSQL (and local JSON store fallback).
 */

require("dotenv").config()
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const express = require("express")
const cors = require("cors")

// Support loading .env.local if present
const envLocal = path.join(__dirname, ".env.local")
if (fs.existsSync(envLocal)) {
  try {
    const content = fs.readFileSync(envLocal, "utf8")
    content.split("\n").forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) return
      const eqIdx = trimmed.indexOf("=")
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim()
        const val = trimmed.slice(eqIdx + 1).trim()
        if (!process.env[key]) process.env[key] = val
      }
    })
  } catch (err) {
    console.error("Error loading .env.local:", err.message)
  }
}

const PORT = process.env.PORT || 3000
const DATA_DIR = path.join(__dirname, "data")
const DATA_FILE = path.join(DATA_DIR, "store.json")
const PUBLIC_DIR = path.join(__dirname, "public")

// Supabase Configuration
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  ""
const isCloudConfigured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL.startsWith("http"),
)

// --- SUPABASE REST ADAPTER ---
class SupabaseAdapter {
  constructor(baseUrl, apiKey) {
    this.baseUrl = (baseUrl || "").replace(/\/+$/, "")
    this.apiKey = apiKey
  }

  get headers() {
    return {
      apikey: this.apiKey,
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    }
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
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    }
    try {
      const res = await fetch(
        `${this.baseUrl}/rest/v1/grocery_lists?select=*,grocery_items(id,name,completed)&order=updated_at.desc`,
        { method: "GET", headers: this.headers },
      )
      if (res.ok) {
        const data = await res.json()
        return data
          .map((l) => ({
            id: l.id,
            title: l.title,
            share_token: l.share_token,
            created_at: l.created_at,
            updated_at: l.updated_at,
            item_count: (l.grocery_items || []).length,
            active_count: (l.grocery_items || []).filter((i) => !i.completed)
              .length,
            preview_items: (l.grocery_items || [])
              .slice(0, 10)
              .map((i) => i.name),
          }))
          .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      }
    } catch (e) {
      console.warn("[Supabase] getAllLists error:", e.message)
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
        preview_items: (l.items || []).slice(0, 10).map((i) => i.name),
      }))
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
  }

  async createList(id, title, shareToken) {
    if (!isCloudConfigured) return null
    try {
      const res = await fetch(`${this.baseUrl}/rest/v1/grocery_lists`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ id, title, share_token: shareToken }),
      })
      if (!res.ok) {
        console.warn(
          "[Supabase] createList warning:",
          res.status,
          await res.text(),
        )
        return null
      }
      const data = await res.json()
      return Array.isArray(data) ? data[0] : data
    } catch (err) {
      console.warn("[Supabase] createList error:", err.message)
      return null
    }
  }

  async getList(identifier) {
    if (!isCloudConfigured) return null
    try {
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          identifier,
        )
      const filter = isUUID
        ? `or=(id.eq.${identifier},share_token.eq.${identifier})`
        : `share_token=eq.${encodeURIComponent(identifier)}`
      const res = await fetch(
        `${this.baseUrl}/rest/v1/grocery_lists?${filter}`,
        {
          method: "GET",
          headers: this.headers,
        },
      )
      if (!res.ok) return null
      const lists = await res.json()
      if (!lists || lists.length === 0) return null
      const list = lists[0]

      const itemsRes = await fetch(
        `${this.baseUrl}/rest/v1/grocery_items?list_id=eq.${list.id}&order=position.asc`,
        {
          method: "GET",
          headers: this.headers,
        },
      )
      const items = itemsRes.ok ? await itemsRes.json() : []
      list.items = items
      return list
    } catch (err) {
      console.warn("[Supabase] getList error:", err.message)
      return null
    }
  }

  async updateListTitle(listId, title) {
    if (!isCloudConfigured) return null
    try {
      const res = await fetch(
        `${this.baseUrl}/rest/v1/grocery_lists?id=eq.${listId}`,
        {
          method: "PATCH",
          headers: this.headers,
          body: JSON.stringify({ title, updated_at: new Date().toISOString() }),
        },
      )
      if (!res.ok) return null
      const data = await res.json()
      return Array.isArray(data) ? data[0] : data
    } catch (err) {
      console.warn("[Supabase] updateListTitle error:", err.message)
      return null
    }
  }

  async deleteList(listId) {
    if (!isCloudConfigured) return null
    try {
      await fetch(`${this.baseUrl}/rest/v1/grocery_lists?id=eq.${listId}`, {
        method: "DELETE",
        headers: this.headers,
      })
      return true
    } catch (err) {
      return false
    }
  }

  async addItem(item) {
    if (!isCloudConfigured) return null
    try {
      const res = await fetch(`${this.baseUrl}/rest/v1/grocery_items`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(item),
      })
      if (!res.ok) {
        console.warn(
          "[Supabase] addItem warning:",
          res.status,
          await res.text(),
        )
        return null
      }
      const data = await res.json()
      return Array.isArray(data) ? data[0] : data
    } catch (err) {
      console.warn("[Supabase] addItem error:", err.message)
      return null
    }
  }

  async updateItem(listId, itemId, updates) {
    if (!isCloudConfigured) return null
    try {
      const res = await fetch(
        `${this.baseUrl}/rest/v1/grocery_items?id=eq.${itemId}&list_id=eq.${listId}`,
        {
          method: "PATCH",
          headers: this.headers,
          body: JSON.stringify({
            ...updates,
            updated_at: new Date().toISOString(),
          }),
        },
      )
      if (!res.ok) return null
      const data = await res.json()
      return Array.isArray(data) ? data[0] : data
    } catch (err) {
      console.warn("[Supabase] updateItem error:", err.message)
      return null
    }
  }

  async deleteItem(listId, itemId) {
    if (!isCloudConfigured) return null
    try {
      await fetch(
        `${this.baseUrl}/rest/v1/grocery_items?id=eq.${itemId}&list_id=eq.${listId}`,
        {
          method: "DELETE",
          headers: this.headers,
        },
      )
      return true
    } catch (err) {
      return false
    }
  }

  async clearItems(listId, mode = "all") {
    if (!isCloudConfigured) return null
    try {
      const filter =
        mode === "completed"
          ? `list_id=eq.${listId}&completed=eq.true`
          : `list_id=eq.${listId}`
      await fetch(`${this.baseUrl}/rest/v1/grocery_items?${filter}`, {
        method: "DELETE",
        headers: this.headers,
      })
      return true
    } catch (err) {
      return false
    }
  }
}

const supabase = new SupabaseAdapter(SUPABASE_URL, SUPABASE_ANON_KEY)

// --- LOCAL JSON DISK PERSISTENCE FALLBACK ---
let store = { lists: {} }

function loadStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, "utf8")
      store = JSON.parse(data)
    }
  } catch (err) {
    console.error("Error loading store from disk:", err.message)
  }
}

function saveStore() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf8")
  } catch (err) {
    console.error("Error saving store to disk:", err.message)
  }
}

loadStore()

function generateRandomToken(len = 9) {
  const chars = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ"
  const bytes = crypto.randomBytes(len)
  let res = ""
  for (let i = 0; i < len; i++) {
    res += chars[bytes[i] % chars.length]
  }
  return res
}

async function findListByIdOrToken(identifier) {
  if (!identifier) return null

  if (isCloudConfigured) {
    const cloudList = await supabase.getList(identifier)
    if (cloudList) {
      store.lists[cloudList.id] = cloudList
      saveStore()
      return cloudList
    }
  }

  if (store.lists[identifier]) return store.lists[identifier]
  for (const key in store.lists) {
    const l = store.lists[key]
    if (l.id === identifier || l.share_token === identifier) {
      return l
    }
  }

  return null
}

// --- EXPRESS APP SETUP ---
const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static(PUBLIC_DIR))

// --- REST API ROUTES (CRUD) ---

// 1. Get all lists
app.get("/api/lists", async (req, res) => {
  const allLists = await supabase.getAllLists()
  res.json(allLists)
})

// 2. Create new list
app.post("/api/lists", async (req, res) => {
  const title = (req.body.title || "Ghar ki zaroorat").trim().slice(0, 100)
  const id = crypto.randomUUID ? crypto.randomUUID() : generateRandomToken(16)
  const shareToken = generateRandomToken(9)
  const now = new Date().toISOString()

  const newList = {
    id,
    title: title || "Ghar ki zaroorat",
    share_token: shareToken,
    created_at: now,
    updated_at: now,
    items: [],
  }

  store.lists[id] = newList
  saveStore()

  if (isCloudConfigured) {
    try {
      await supabase.createList(id, newList.title, shareToken)
    } catch (err) {
      console.warn("[Supabase] createList error:", err.message)
    }
  }

  res.status(201).json(newList)
})

// 3. Get specific list and its items
app.get("/api/lists/:id", async (req, res) => {
  const list = await findListByIdOrToken(req.params.id)
  if (!list) {
    return res.status(404).json({ error: "List not found" })
  }
  res.json(list)
})

// 4. Update list title
app.put("/api/lists/:id", async (req, res) => {
  const list = await findListByIdOrToken(req.params.id)
  if (!list) {
    return res.status(404).json({ error: "List not found" })
  }

  const newTitle = (req.body.title || "").trim().slice(0, 100)
  if (newTitle) {
    list.title = newTitle
    list.updated_at = new Date().toISOString()
    saveStore()

    if (isCloudConfigured) {
      try {
        await supabase.updateListTitle(list.id, newTitle)
      } catch (err) {
        console.warn("[Supabase] updateListTitle error:", err.message)
      }
    }
  }

  res.json(list)
})

// 5. Delete entire list
app.delete("/api/lists/:id", async (req, res) => {
  const list = await findListByIdOrToken(req.params.id)
  if (!list) {
    return res.status(404).json({ error: "List not found" })
  }

  const deletedId = list.id
  delete store.lists[deletedId]
  saveStore()

  if (isCloudConfigured) {
    try {
      await supabase.deleteList(deletedId)
    } catch (err) {
      console.warn("[Supabase] deleteList error:", err.message)
    }
  }

  res.json({ success: true, id: deletedId })
})

// 6. Add grocery item to list
app.post("/api/lists/:id/items", async (req, res) => {
  const list = await findListByIdOrToken(req.params.id)
  if (!list) {
    return res.status(404).json({ error: "List not found" })
  }

  const name = (req.body.name || "").trim().slice(0, 200)
  if (!name) {
    return res.status(400).json({ error: "Item name is required" })
  }

  const quantity = req.body.quantity
    ? req.body.quantity.trim().slice(0, 100)
    : null
  const now = new Date().toISOString()
  const maxPos = (list.items || []).reduce(
    (max, i) => Math.max(max, i.position || 0),
    0,
  )
  const itemId =
    req.body.id ||
    (crypto.randomUUID ? crypto.randomUUID() : generateRandomToken(16))

  const newItem = {
    id: itemId,
    list_id: list.id,
    name,
    quantity,
    completed: false,
    position: maxPos + 1,
    created_at: now,
    updated_at: now,
  }

  list.items = list.items || []
  list.items.push(newItem)
  list.updated_at = now
  saveStore()

  if (isCloudConfigured) {
    try {
      await supabase.addItem(newItem)
    } catch (err) {
      console.warn("[Supabase] addItem error:", err.message)
    }
  }

  res.status(201).json(newItem)
})

// 7. Clear all items or completed items
app.delete("/api/lists/:id/items", async (req, res) => {
  const list = await findListByIdOrToken(req.params.id)
  if (!list) {
    return res.status(404).json({ error: "List not found" })
  }

  const mode =
    req.query.mode || (req.query.completed === "true" ? "completed" : "all")
  let removedItems = []

  list.items = list.items || []
  if (mode === "completed") {
    removedItems = list.items.filter((i) => i.completed)
    list.items = list.items.filter((i) => !i.completed)
  } else {
    removedItems = [...list.items]
    list.items = []
  }

  list.updated_at = new Date().toISOString()
  saveStore()

  if (isCloudConfigured) {
    try {
      await supabase.clearItems(list.id, mode)
    } catch (err) {
      console.warn("[Supabase] clearItems error:", err.message)
    }
  }

  res.json({ success: true, mode, count: removedItems.length, removedItems })
})

// 8. Update specific item (toggle complete, rename, change quantity)
app.put("/api/lists/:id/items/:itemId", async (req, res) => {
  const list = await findListByIdOrToken(req.params.id)
  if (!list) {
    return res.status(404).json({ error: "List not found" })
  }

  const itemId = req.params.itemId
  list.items = list.items || []
  const item = list.items.find((i) => i.id === itemId)
  if (!item) {
    return res.status(404).json({ error: "Item not found" })
  }

  const updates = {}
  if (req.body.name !== undefined) {
    item.name = req.body.name.trim().slice(0, 200)
    updates.name = item.name
  }
  if (req.body.quantity !== undefined) {
    item.quantity = req.body.quantity
      ? req.body.quantity.trim().slice(0, 100)
      : null
    updates.quantity = item.quantity
  }
  if (req.body.completed !== undefined) {
    item.completed = Boolean(req.body.completed)
    updates.completed = item.completed
  }
  if (req.body.position !== undefined) {
    item.position = Number(req.body.position)
    updates.position = item.position
  }

  item.updated_at = new Date().toISOString()
  list.updated_at = item.updated_at
  saveStore()

  if (isCloudConfigured) {
    try {
      await supabase.updateItem(list.id, itemId, updates)
    } catch (err) {
      console.warn("[Supabase] updateItem error:", err.message)
    }
  }

  res.json(item)
})

// 9. Delete specific item
app.delete("/api/lists/:id/items/:itemId", async (req, res) => {
  const list = await findListByIdOrToken(req.params.id)
  if (!list) {
    return res.status(404).json({ error: "List not found" })
  }

  const itemId = req.params.itemId
  list.items = list.items || []
  const index = list.items.findIndex((i) => i.id === itemId)
  if (index === -1) {
    return res.status(404).json({ error: "Item not found" })
  }

  const [deletedItem] = list.items.splice(index, 1)
  list.updated_at = new Date().toISOString()
  saveStore()

  if (isCloudConfigured) {
    try {
      await supabase.deleteItem(list.id, itemId)
    } catch (err) {
      console.warn("[Supabase] deleteItem error:", err.message)
    }
  }

  res.json({ success: true, deletedItem })
})

// SPA Direct Route Fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"))
})

// Start Server
app.listen(PORT, () => {
  console.log(`
==================================================
  Ghar ki zaroorat - Express Server running on port ${PORT}
  Theme: #F4EEFF, #DCD6F7, #A6B1E1, #424874
  Database: ${isCloudConfigured ? `Connected to Supabase (${SUPABASE_URL})` : "Using local store.json"}
==================================================
  `)
})
